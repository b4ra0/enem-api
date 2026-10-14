// Classifica as questões por matéria e tópico usando a API do Claude.
//
// Uso:
//   node scripts/classify-questions.mjs 2020            # uma prova
//   node scripts/classify-questions.mjs 2019 2020       # várias provas
//   node scripts/classify-questions.mjs 2024-reaplicacao  # uma reaplicação
//   node scripts/classify-questions.mjs --all           # todas as provas
//
// Opções:
//   --force            reclassifica questões que já têm matéria
//   --dry-run          não grava nada, só mostra o resultado
//   --limit N          classifica no máximo N questões (útil para testar)
//   --concurrency N    requisições simultâneas (padrão: 4)
//   --model ID         modelo (padrão: claude-opus-5-5)
//   --effort NIVEL     low | medium | high (padrão: low)
//
// Requer ANTHROPIC_API_KEY (ou `ant auth login`).
//
// Cada questão é gravada assim que é classificada, então o script pode ser
// interrompido e retomado. Ao final de cada prova, a lista de questões em
// `public/{ano}/details.json` é atualizada. Um relatório com a confiança e a
// justificativa de cada classificação é salvo em `scripts/output/`.

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
    PUBLIC_DIR,
    TAXONOMY,
    readJson,
    examSection,
    DATASET_PATTERN,
    listYears,
    listQuestionFiles,
    subjectDiscipline,
    writeQuestionClassification,
    updateExamDetails,
    writeReport,
} from './lib/classification.mjs';

const MAX_IMAGES = 8;

// Algumas imagens do repositório têm extensão errada (BMPs e GIFs salvos
// como .png, .jpg ou .latex), então o tipo é detectado pelo conteúdo.
function detectMediaType(data) {
    const hex = data.subarray(0, 4).toString('hex');

    if (hex === '89504e47') return 'image/png';
    if (hex.startsWith('ffd8ff')) return 'image/jpeg';
    if (hex === '47494638') return 'image/gif';
    if (hex === '52494646' && data.subarray(8, 12).toString() === 'WEBP') {
        return 'image/webp';
    }

    return null;
}

function parseArgs(argv) {
    const args = {
        years: [],
        all: false,
        force: false,
        dryRun: false,
        limit: Infinity,
        concurrency: 4,
        model: 'claude-opus-5-5',
        effort: 'low',
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--all') args.all = true;
        else if (arg === '--force') args.force = true;
        else if (arg === '--dry-run') args.dryRun = true;
        else if (arg === '--limit') args.limit = Number(argv[++i]);
        else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
        else if (arg === '--model') args.model = argv[++i];
        else if (arg === '--effort') args.effort = argv[++i];
        else if (DATASET_PATTERN.test(arg)) args.years.push(arg);
        else throw new Error(`Argumento desconhecido: ${arg}`);
    }

    if (args.all) {
        args.years = listYears();
    }

    if (args.years.length === 0) {
        throw new Error('Informe ao menos um ano ou use --all');
    }

    return args;
}

const SYSTEM_PROMPT = `Você classifica questões do ENEM por matéria e tópico.

Junto com a questão vem a área do caderno da prova em que ela está. Escolha exatamente uma matéria dessa área: aquela cujo conhecimento é necessário para resolver a questão. Uma questão do caderno de Ciências da Natureza que exige cálculo continua sendo de física, química ou biologia; uma questão do caderno de Linguagens sobre um tema social é de português, artes ou educação física.

Depois escolha de 1 a 3 tópicos dessa matéria, do mais central para o menos central. Use só os tópicos necessários; a maioria das questões tem um ou dois.

Questões de língua estrangeira são de "ingles" ou "espanhol", conforme o idioma do texto. Questões de linguagens que tratam de obras, autores ou escolas literárias são de "literatura"; as que tratam do funcionamento da língua ou de interpretação de textos não literários são de "portugues".

Em "confidence", use "low" quando a questão se encaixar mal na taxonomia ou quando faltar informação (por exemplo, uma imagem essencial que não foi enviada).

Matérias e tópicos disponíveis:

${TAXONOMY.map(
    subject =>
        `## ${subject.value} (${subject.label})\n` +
        subject.topics.map(t => `- ${t.value}: ${t.label}`).join('\n'),
).join('\n\n')}`;

const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['reason', 'classification', 'confidence'],
    properties: {
        reason: {
            type: 'string',
            description: 'Justificativa curta da classificação, em português',
        },
        classification: {
            anyOf: TAXONOMY.map(subject => ({
                type: 'object',
                additionalProperties: false,
                required: ['subject', 'topics'],
                properties: {
                    subject: { type: 'string', const: subject.value },
                    topics: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: subject.topics.map(t => t.value),
                        },
                    },
                },
            })),
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
};

function localPathFromUrl(url) {
    const match = /^https:\/\/enem\.dev\/(.+)$/.exec(url);
    return match ? path.join(PUBLIC_DIR, decodeURIComponent(match[1])) : null;
}

function buildImageBlocks(question) {
    const urls = [
        ...question.files,
        ...question.alternatives.map(a => a.file).filter(Boolean),
    ];
    const blocks = [];
    const skipped = [];

    for (const url of new Set(urls)) {
        const filePath = localPathFromUrl(url);

        if (
            !filePath ||
            !fs.existsSync(filePath) ||
            blocks.length >= MAX_IMAGES
        ) {
            skipped.push(url);
            continue;
        }

        const data = fs.readFileSync(filePath);
        const mediaType = detectMediaType(data);

        if (!mediaType) {
            skipped.push(url);
            continue;
        }

        blocks.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: mediaType,
                data: data.toString('base64'),
            },
        });
    }

    return { blocks, skipped };
}

function buildQuestionText(question) {
    const alternatives = question.alternatives
        .map(a => `${a.letter}) ${a.text ?? '[imagem]'}`)
        .join('\n');

    return [
        `Caderno: ${examSection(question.year, question.index)}`,
        question.language ? `Idioma: ${question.language}` : null,
        '',
        question.context ?? '',
        '',
        question.alternativesIntroduction ?? '',
        '',
        alternatives,
    ]
        .filter(line => line !== null)
        .join('\n');
}

async function classify(client, args, question) {
    const images = buildImageBlocks(question);

    const response = await client.beta.messages.create({
        model: args.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
            effort: args.effort,
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        system: [
            {
                type: 'text',
                text: SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            {
                role: 'user',
                content: [
                    ...images.blocks,
                    { type: 'text', text: buildQuestionText(question) },
                ],
            },
        ],
    });

    if (response.stop_reason === 'refusal') {
        throw new Error(
            `Recusa (${response.stop_details?.category ?? 'sem categoria'})`,
        );
    }

    if (response.stop_reason === 'max_tokens') {
        throw new Error('Resposta cortada por max_tokens');
    }

    const text = response.content.find(block => block.type === 'text')?.text;

    if (!text) {
        throw new Error('Resposta sem texto');
    }

    const result = JSON.parse(text);

    return {
        subject: result.classification.subject,
        topics: [...new Set(result.classification.topics)],
        confidence: result.confidence,
        reason: result.reason,
        skippedImages: images.skipped,
    };
}

async function runPool(items, concurrency, worker) {
    let next = 0;

    const runners = Array.from({ length: concurrency }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await worker(item);
        }
    });

    await Promise.all(runners);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const client = new Anthropic({ maxRetries: 5 });

    const pending = [];

    for (const year of args.years) {
        for (const filePath of listQuestionFiles(year)) {
            const question = readJson(filePath);

            if (question.subject && !args.force) continue;

            pending.push({ year, filePath, question });
        }
    }

    const toClassify = pending.slice(0, args.limit);
    const report = [];
    let done = 0;

    console.log(
        `${toClassify.length} questões a classificar (${args.model}, effort ${args.effort})`,
    );

    await runPool(toClassify, args.concurrency, async item => {
        const { year, filePath, question } = item;
        const label = `${year} #${question.index}${question.language ? ` (${question.language})` : ''}`;

        try {
            const result = await classify(client, args, question);
            const mismatch =
                subjectDiscipline(result.subject) !== question.discipline;

            if (!args.dryRun) {
                writeQuestionClassification(filePath, result);
            }

            report.push({
                year: Number(year),
                index: question.index,
                language: question.language,
                discipline: question.discipline,
                ...result,
                disciplineMismatch: mismatch,
            });

            console.log(
                `[${++done}/${toClassify.length}] ${label}: ${result.subject} → ${result.topics.join(', ')} (${result.confidence})` +
                    (mismatch ? ` ⚠ área atual: ${question.discipline}` : ''),
            );
        } catch (error) {
            report.push({
                year: Number(year),
                index: question.index,
                language: question.language,
                error: String(error?.message ?? error),
            });

            console.error(
                `[${++done}/${toClassify.length}] ${label}: ERRO ${error?.message ?? error}`,
            );
        }
    });

    if (!args.dryRun) {
        for (const year of args.years) {
            updateExamDetails(year);
        }
    }

    writeReport(report);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
