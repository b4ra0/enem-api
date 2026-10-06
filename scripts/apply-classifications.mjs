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
//       "index": 150,
//       "language": null,
//       "subject": "matematica",
//       "topics": ["logaritmo"],
//       "confidence": "high",
//       "reason": "Cálculo com a fórmula de decaimento exponencial"
//     }
//   ]
//
// `confidence` e `reason` são opcionais e vão só para o relatório.

import fs from 'node:fs';
import {
    readJson,
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
const years = new Set();

for (const entry of entries) {
    const language = entry.language ?? null;
    const label = `${entry.year} #${entry.index}${language ? ` (${language})` : ''}`;
    const filePath = questionFilePath(entry.year, entry.index, language);

    const error = !fs.existsSync(filePath)
        ? 'questão não encontrada'
        : validateClassification(entry);

    if (error) {
        report.push({ year: entry.year, index: entry.index, language, error });
        console.error(`${label}: ERRO ${error}`);
        continue;
    }

    const question = readJson(filePath);
    const mismatch = subjectDiscipline(entry.subject) !== question.discipline;

    if (!dryRun) {
        writeQuestionClassification(filePath, entry);
        years.add(entry.year);
    }

    report.push({
        year: entry.year,
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

for (const year of years) {
    updateExamDetails(year);
}

writeReport(report);
