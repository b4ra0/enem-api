// Aplica classificações feitas fora deste repositório (por exemplo, no Claude
// Code ou manualmente) a partir de um ou mais arquivos JSON.
//
// Uso:
//   node scripts/apply-classifications.mjs resultados.json [outro.json ...]
//
// Opções:
//   --dry-run   só valida, sem gravar
//
// Cada arquivo deve conter uma lista no formato:
//   [
//     {
//       "year": 2020,
//       "application": "regular",
//       "index": 150,
//       "language": null,
//       "subject": "matematica",
//       "topics": ["logaritmo"],
//       "confidence": "high",
//       "reason": "Cálculo com a fórmula de decaimento exponencial"
//     }
//   ]
//
// `application` é opcional: "regular" (padrão) ou "reaplicacao".
// `confidence` e `reason` são opcionais e vão só para o relatório.

import fs from 'node:fs';
import {
    readJson,
    datasetDir,
    questionFilePath,
    validateClassification,
    subjectDiscipline,
    writeQuestionClassification,
    updateExamDetails,
    writeReport,
} from './lib/classification.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const inputFiles = args.filter(arg => arg !== '--dry-run');

if (inputFiles.length === 0) {
    console.error('Informe ao menos um arquivo de classificações');
    process.exit(1);
}

const entries = inputFiles.flatMap(file => readJson(file));
const report = [];
const datasets = new Set();

for (const entry of entries) {
    const language = entry.language ?? null;
    const application = entry.application ?? 'regular';
    const dataset = datasetDir(entry.year, application);
    const label = `${dataset} #${entry.index}${language ? ` (${language})` : ''}`;
    const filePath = questionFilePath(dataset, entry.index, language);

    const error = !fs.existsSync(filePath)
        ? 'questão não encontrada'
        : validateClassification(entry);

    if (error) {
        report.push({
            year: entry.year,
            application,
            index: entry.index,
            language,
            error,
        });
        console.error(`${label}: ERRO ${error}`);
        continue;
    }

    const question = readJson(filePath);
    const mismatch = subjectDiscipline(entry.subject) !== question.discipline;

    if (!dryRun) {
        writeQuestionClassification(filePath, entry);
        datasets.add(dataset);
    }

    report.push({
        year: entry.year,
        application,
        index: entry.index,
        language,
        discipline: question.discipline,
        subject: entry.subject,
        topics: entry.topics,
        confidence: entry.confidence,
        reason: entry.reason,
        disciplineMismatch: mismatch,
    });

    if (mismatch) {
        console.log(
            `${label}: ${entry.subject} ⚠ área atual: ${question.discipline}`,
        );
    }
}

for (const dataset of datasets) {
    updateExamDetails(dataset);
}

writeReport(report);
