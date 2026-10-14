// Limpa o texto de questões extraídas automaticamente dos PDFs do INEP
// (como as do PR #18: ENEM 2024/2025 e reaplicações).
//
// Uso:
//   node scripts/clean-extracted-questions.mjs 2024 2025 2024-reaplicacao
//
// Opções:
//   --dry-run            só mostra o que mudaria
//   --drop-incomplete    remove questões com alternativa sem texto e sem imagem
//
// O que é corrigido:
// - linhas quebradas pela largura da coluna do caderno são unidas (linhas
//   curtas, como versos de poemas, itens de lista e células de tabela, são
//   mantidas);
// - a letra da alternativa seguinte grudada no fim de cada alternativa
//   ("... nostalgia. B") e o "A" no fim do comando da questão;
// - cabeçalhos repetidos do caderno no início do texto ("ENEM 2022 ENEM 2022 ...").
//
// Ao final, a lista de questões em `public/{prova}/details.json` é
// sincronizada com as pastas existentes.

import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, readJson, writeJson } from './lib/classification.mjs';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const JOIN_RATIO = 0.85;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dropIncomplete = args.includes('--drop-incomplete');
const datasets = args.filter(arg => !arg.startsWith('--'));

if (datasets.length === 0) {
    console.error('Informe ao menos uma prova (ex.: 2024 ou 2024-reaplicacao)');
    process.exit(1);
}

function questionDirs(dataset) {
    const dir = path.join(PUBLIC_DIR, dataset, 'questions');
    return fs
        .readdirSync(dir)
        .map(name => path.join(dir, name))
        .filter(p => fs.existsSync(path.join(p, 'details.json')));
}

// Largura típica de uma linha cheia de texto no caderno (percentil 75).
function typicalLineWidth(questions) {
    const lengths = questions
        .flatMap(q => (q.context ?? '').split('\n'))
        .filter(line => line.length >= 15 && !line.includes('!['))
        .map(line => line.length)
        .sort((a, b) => a - b);

    return lengths[Math.floor(0.75 * (lengths.length - 1))] ?? 55;
}

const isImageLine = line => /!\[[^\]]*\]\([^)]*\)/.test(line);
const isListItem = line => /^\s*([-•*▪]|\d+[.)]|[a-z][.)])\s/.test(line);

// Um bloco é prosa quando a maior parte das linhas ocupa a coluna inteira.
// Em poemas e tabelas as linhas são curtas e as quebras têm significado.
function isProseBlock(lines, threshold) {
    const body = lines.slice(0, -1).filter(line => line.trim().length > 0);

    return (
        body.length >= 2 &&
        body.filter(line => line.trim().length >= threshold).length >=
            0.6 * body.length
    );
}

function unwrap(text, width) {
    if (!text) {
        return text;
    }

    const threshold = Math.round(width * JOIN_RATIO);

    return text
        .split(/\n{2,}/)
        .map(block => {
            const lines = block.split('\n');
            const prose = isProseBlock(lines, threshold);
            let result = lines[0];

            for (let i = 1; i < lines.length; i++) {
                const previous = lines[i - 1].trim();
                const current = lines[i];
                const continues =
                    prose &&
                    !/[.!?:;]$/.test(previous) &&
                    /^\s*[a-zà-ú0-9(“"«]/.test(current);
                const join =
                    (previous.length >= threshold || continues) &&
                    current.trim().length > 0 &&
                    !isImageLine(previous) &&
                    !isImageLine(current) &&
                    !isListItem(current);

                result += join ? ` ${current.trimStart()}` : `\n${current}`;
            }

            return result;
        })
        .join('\n\n');
}

// Na extração, a letra da alternativa seguinte ficou no fim do texto
// ("... nostalgia. B"). Só corrige quando o padrão aparece em todas as
// alternativas A–D com texto, para não cortar algo legítimo como "ponto B".
function hasLetterBleed(question) {
    const candidates = question.alternatives.filter(
        a => a.text && a.letter !== 'E',
    );

    return (
        candidates.length >= 3 &&
        candidates.every(a => {
            const next = LETTERS[LETTERS.indexOf(a.letter) + 1];
            return new RegExp(`\\s${next}$`).test(a.text.trim());
        })
    );
}

function clean(question, width) {
    const result = structuredClone(question);
    const bleed = hasLetterBleed(question);

    if (result.context) {
        result.context = result.context
            .replace(/^(ENEM \d{4}\s*){2,}\s*/, '')
            .trim();
        result.context = unwrap(result.context, width) || null;
    }

    if (result.alternativesIntroduction) {
        let intro = result.alternativesIntroduction.trim();

        if (bleed || intro === 'A') {
            intro = intro.replace(/(^|\s)A$/, '').trim();
        }

        result.alternativesIntroduction = unwrap(intro, width) || null;
    }

    result.alternatives = result.alternatives.map(alternative => {
        if (!alternative.text) {
            return alternative;
        }

        let text = alternative.text.trim();

        if (bleed && alternative.letter !== 'E') {
            const next = LETTERS[LETTERS.indexOf(alternative.letter) + 1];
            text = text.replace(new RegExp(`\\s${next}$`), '').trim();
        }

        return { ...alternative, text: unwrap(text, width) || null };
    });

    return result;
}

const isIncomplete = question =>
    question.alternatives.some(a => !a.text?.trim() && !a.file);

function syncExamDetails(dataset) {
    const examPath = path.join(PUBLIC_DIR, dataset, 'details.json');
    const exam = readJson(examPath);
    const existing = new Set(
        questionDirs(dataset).map(dir => path.basename(dir)),
    );
    const before = exam.questions.length;

    exam.questions = exam.questions.filter(entry =>
        existing.has(
            entry.language
                ? `${entry.index}-${entry.language}`
                : `${entry.index}`,
        ),
    );

    if (!dryRun && exam.questions.length !== before) {
        writeJson(examPath, exam);
    }

    return before - exam.questions.length;
}

for (const dataset of datasets) {
    const dirs = questionDirs(dataset);
    const questions = dirs.map(dir => readJson(path.join(dir, 'details.json')));
    const width = typicalLineWidth(questions);
    const stats = { changed: 0, bleed: 0, dropped: [] };

    dirs.forEach((dir, i) => {
        const original = questions[i];
        const cleaned = clean(original, width);

        if (hasLetterBleed(original)) stats.bleed++;

        if (dropIncomplete && isIncomplete(cleaned)) {
            stats.dropped.push(path.basename(dir));
            if (!dryRun) fs.rmSync(dir, { recursive: true });
            return;
        }

        if (JSON.stringify(cleaned) !== JSON.stringify(original)) {
            stats.changed++;
            if (!dryRun) writeJson(path.join(dir, 'details.json'), cleaned);
        }
    });

    const removedFromList = dryRun
        ? stats.dropped.length
        : syncExamDetails(dataset);

    console.log(
        `${dataset}: largura ${width}, ${stats.changed} questões limpas, ` +
            `${stats.bleed} com letra grudada, ${stats.dropped.length} removidas` +
            (stats.dropped.length ? ` (${stats.dropped.join(', ')})` : '') +
            `, ${removedFromList} fora da lista da prova`,
    );
}
