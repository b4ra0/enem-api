// Funções compartilhadas pelos scripts de classificação de questões.

import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const OUTPUT_DIR = path.join(ROOT, 'scripts', 'output');
export const TAXONOMY = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'lib', 'taxonomy.json'), 'utf-8'),
);

export function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

// Pasta de uma prova em `public/`: `2024` ou `2024-reaplicacao`.
export const DATASET_PATTERN = /^\d{4}(-reaplicacao)?$/;

export function datasetDir(year, application = 'regular') {
    return application === 'reaplicacao' ? `${year}-reaplicacao` : `${year}`;
}

// Todas as provas, incluindo as reaplicações.
export function listYears() {
    return fs
        .readdirSync(PUBLIC_DIR)
        .filter(dir => DATASET_PATTERN.test(dir))
        .sort();
}

export function listQuestionFiles(year) {
    const questionsDir = path.join(PUBLIC_DIR, year, 'questions');

    return fs
        .readdirSync(questionsDir)
        .map(dir => path.join(questionsDir, dir, 'details.json'))
        .filter(filePath => fs.existsSync(filePath))
        .sort((a, b) => {
            const indexOf = p => parseInt(path.basename(path.dirname(p)), 10);
            return indexOf(a) - indexOf(b) || a.localeCompare(b);
        });
}

// Área do caderno em que a questão está, pela posição na prova. Em 2009 o
// primeiro dia começava por Natureza; de 2010 a 2016, por Humanas; a partir
// de 2017 Linguagens passou para o primeiro dia.
export function examSection(year, index) {
    const examYear = parseInt(year, 10);
    const order =
        examYear === 2009
            ? [
                  'ciencias-natureza',
                  'ciencias-humanas',
                  'linguagens',
                  'matematica',
              ]
            : examYear <= 2016
              ? [
                    'ciencias-humanas',
                    'ciencias-natureza',
                    'linguagens',
                    'matematica',
                ]
              : [
                    'linguagens',
                    'ciencias-humanas',
                    'ciencias-natureza',
                    'matematica',
                ];

    return order[Math.min(3, Math.floor((index - 1) / 45))];
}

// `dataset` é a pasta da prova (ex.: 2024 ou 2024-reaplicacao).
export function questionFilePath(dataset, index, language) {
    const dir = language ? `${index}-${language}` : `${index}`;
    return path.join(
        PUBLIC_DIR,
        `${dataset}`,
        'questions',
        dir,
        'details.json',
    );
}

// Retorna uma mensagem de erro se a classificação não seguir a taxonomia.
export function validateClassification({ subject, topics }) {
    const entry = TAXONOMY.find(s => s.value === subject);

    if (!entry) {
        return `matéria desconhecida: ${subject}`;
    }

    if (!Array.isArray(topics) || topics.length === 0) {
        return 'nenhum tópico informado';
    }

    const invalid = topics.filter(t => !entry.topics.some(e => e.value === t));

    if (invalid.length > 0) {
        return `tópicos que não pertencem a ${subject}: ${invalid.join(', ')}`;
    }

    return null;
}

export function subjectDiscipline(subject) {
    return TAXONOMY.find(s => s.value === subject)?.discipline;
}

// Insere as chaves novas logo depois de `afterKey`, mantendo a ordem das
// demais para não bagunçar o diff dos arquivos JSON.
export function withClassification(object, afterKey, { subject, topics }) {
    const result = {};

    for (const [key, value] of Object.entries(object)) {
        if (key === 'subject' || key === 'topics') continue;

        result[key] = value;

        if (key === afterKey) {
            result.subject = subject;
            result.topics = [...new Set(topics)];
        }
    }

    return result;
}

export function writeQuestionClassification(filePath, classification) {
    const question = readJson(filePath);
    writeJson(
        filePath,
        withClassification(question, 'discipline', classification),
    );
}

// Copia a classificação das questões para a lista em `public/{prova}/details.json`.
export function updateExamDetails(dataset) {
    const examPath = path.join(PUBLIC_DIR, `${dataset}`, 'details.json');
    const exam = readJson(examPath);

    const classifications = new Map();

    for (const filePath of listQuestionFiles(`${dataset}`)) {
        const question = readJson(filePath);

        if (question.subject) {
            classifications.set(
                `${question.index}:${question.language ?? ''}`,
                question,
            );
        }
    }

    exam.questions = exam.questions.map(entry => {
        const question = classifications.get(
            `${entry.index}:${entry.language ?? ''}`,
        );

        return question
            ? withClassification(entry, 'language', question)
            : entry;
    });

    writeJson(examPath, exam);
}

export function writeReport(report) {
    report.sort(
        (a, b) =>
            a.year - b.year ||
            (a.application ?? '').localeCompare(b.application ?? '') ||
            a.index - b.index,
    );

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const reportPath = path.join(
        OUTPUT_DIR,
        `classification-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeJson(reportPath, report);

    const errors = report.filter(r => r.error).length;
    const lowConfidence = report.filter(r => r.confidence === 'low').length;
    const mismatches = report.filter(r => r.disciplineMismatch).length;

    console.log(
        `\nConcluído: ${report.length - errors} classificadas, ${errors} erros, ` +
            `${lowConfidence} com confiança baixa, ${mismatches} com área divergente.`,
    );
    console.log(`Relatório: ${path.relative(ROOT, reportPath)}`);
}
