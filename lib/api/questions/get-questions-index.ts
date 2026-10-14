import z from '@/lib/zod';
import { getExams } from '@/lib/api/exams/get-exams';
import { getExamDetails } from '@/lib/api/exams/get-exam-details';
import { QuestionIndexEntrySchema } from '@/lib/zod/schemas/questions';
import { Application, ApplicationValues } from '@/lib/zod/schemas/application';

export type QuestionIndexEntry = z.infer<typeof QuestionIndexEntrySchema>;

export type QuestionsIndex = {
    entries: QuestionIndexEntry[];
    byId: Map<string, QuestionIndexEntry>;
};

const LANGUAGE_RANK: Record<string, number> = { espanhol: 1, ingles: 2 };

const languageRank = (language: string | null) =>
    language === null ? 0 : (LANGUAGE_RANK[language] ?? 3);

export function buildQuestionId(
    year: number,
    index: number,
    language: string | null,
    application: Application = 'regular',
) {
    const exam =
        application === 'reaplicacao' ? `${year}-reaplicacao` : `${year}`;
    return language ? `${exam}-${index}-${language}` : `${exam}-${index}`;
}

// Ano decrescente, aplicação regular antes da reaplicação, número
// crescente e variantes de idioma adjacentes (sem idioma < espanhol < inglês).
function compareEntries(a: QuestionIndexEntry, b: QuestionIndexEntry) {
    return (
        b.year - a.year ||
        ApplicationValues.indexOf(a.application) -
            ApplicationValues.indexOf(b.application) ||
        a.index - b.index ||
        languageRank(a.language) - languageRank(b.language)
    );
}

async function loadQuestionsIndex(): Promise<QuestionsIndex> {
    const exams = await getExams();
    const sources = exams.flatMap(exam =>
        ApplicationValues.map(application => ({
            year: exam.year,
            application,
        })),
    );
    // Reaplicações inexistentes voltam como null e são ignoradas.
    const details = await Promise.all(
        sources.map(async source => ({
            application: source.application,
            exam: await getExamDetails(source),
        })),
    );

    const entries = details
        .flatMap(({ application, exam }) =>
            exam
                ? exam.questions.map(question =>
                      QuestionIndexEntrySchema.parse({
                          id: buildQuestionId(
                              exam.year,
                              question.index,
                              question.language,
                              application,
                          ),
                          year: exam.year,
                          application,
                          index: question.index,
                          discipline: question.discipline,
                          language: question.language,
                          subject: question.subject,
                          topics: question.topics,
                      }),
                  )
                : [],
        )
        .sort(compareEntries);

    return {
        entries,
        byId: new Map(entries.map(entry => [entry.id, entry])),
    };
}

// Os dados em `public/` são estáticos, então o índice é montado uma vez por
// processo. A Promise (e não o valor) é cacheada para que requisições
// concorrentes compartilhem a mesma carga; em caso de erro, o cache é limpo
// para que a próxima requisição tente novamente.
let cached: Promise<QuestionsIndex> | null = null;

export function getQuestionsIndex(): Promise<QuestionsIndex> {
    if (!cached) {
        cached = loadQuestionsIndex().catch(error => {
            cached = null;
            throw error;
        });
    }

    return cached;
}
