import z from '@/lib/zod';
import {
    DisciplineValues,
    SubjectValues,
    TopicValues,
} from '@/lib/zod/schemas/subjects';

export const QuestionIndexPath = z.string().openapi({
    ref: 'index',
    example: '42',
    description: 'O número da questão na prova',
});

export const QuestionSchema = z
    .object({
        title: z
            .string()
            .describe('O título da questão')
            .openapi({ example: 'Questão 1 - ENEM 2020' }),
        index: z
            .number()
            .int()
            .positive()
            .describe('O número da questão na prova')
            .openapi({ example: 1 }),
        discipline: z
            .string()
            .nullable()
            .describe('A disciplina da questão')
            .openapi({ example: 'linguagens' }),
        language: z
            .string()
            .nullable()
            .describe('O idioma da questão')
            .openapi({ example: 'ingles' }),
        subject: z
            .enum(SubjectValues)
            .nullable()
            .default(null)
            .describe('A matéria da questão')
            .openapi({ example: 'matematica' }),
        topics: z
            .array(z.enum(TopicValues))
            .default([])
            .describe('Os tópicos da matéria abordados na questão')
            .openapi({ example: ['progressao-aritmetica'] }),
    })
    .openapi({
        title: 'Questão',
    });

export const QuestionDetailSchema = QuestionSchema.extend({
    year: z
        .number()
        .int()
        .positive()
        .describe('O ano em que a prova foi aplicada')
        .openapi({ example: 2020 }),
    context: z
        .string()
        .nullable()
        .describe('O contexto da questão, em Makdown')
        .openapi({
            example:
                'Lorem ipsum dolor sit amet, qui minim labore adipisicing minim sint cillum sint consectetur cupidatat.',
        }),
    files: z
        .array(z.string())
        .describe('Os arquivos da questão')
        .openapi({
            example: [
                'https://enem.dev/2020/questions/1-ingles/6e1ca12e-9bc4-472b-8809-84e7e394714a.png',
            ],
        }),
    correctAlternative: z
        .enum(['A', 'B', 'C', 'D', 'E'])
        .describe('A alternativa correta da questão')
        .openapi({ example: 'A' }),
    alternativesIntroduction: z
        .string()
        .nullable()
        .describe('O texto introdutório das alternativas da questão')
        .openapi({
            example: 'Com base no texto, selecione a alternativa correta',
        }),
    alternatives: z
        .array(
            z.object({
                letter: z
                    .enum(['A', 'B', 'C', 'D', 'E'])
                    .describe('A letra da alternativa')
                    .openapi({ example: 'A' }),
                text: z
                    .string()
                    .nullable()
                    .describe('O texto da alternativa')
                    .openapi({
                        example:
                            'Lorem ipsum dolor sit amet, qui minim labore adipisicing minim sint cillum sint consectetur cupidatat.',
                    }),
                file: z
                    .string()
                    .nullable()
                    .describe('O arquivo da alternativa')
                    .openapi({
                        example:
                            'https://enem.dev/2020/questions/1-ingles/6e1ca12e-9bc4-472b-8809-84e7e394714a.png',
                    }),
                isCorrect: z
                    .boolean()
                    .describe('Se a alternativa é a correta ou não')
                    .openapi({ example: true }),
            }),
        )
        .describe('As alternativas da questão'),
}).openapi({
    title: 'Detalhes da questão',
});

export const GetQuestionsResponseSchema = z.object({
    metadata: z.object({
        limit: z
            .number()
            .int()
            .positive()
            .describe('O número máximo de questões retornadas')
            .openapi({ example: 10 }),
        offset: z
            .number()
            .int()
            .nonnegative()
            .describe('O número da primeira questão retornada')
            .openapi({ example: 0 }),
        total: z
            .number()
            .int()
            .nonnegative()
            .describe('O número total de questões da prova')
            .openapi({ example: 180 }),
        hasMore: z
            .boolean()
            .describe('Se há mais questões disponíveis ou não')
            .openapi({ example: true }),
    }),
    questions: z.array(QuestionDetailSchema).describe('As questões da prova'),
});

export const GetQuestionsQuerySchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .positive()
        .default(10)
        .describe('O número máximo de questões a serem retornadas')
        .openapi({ example: 10 }),
    offset: z.coerce
        .number()
        .int()
        .nonnegative()
        .default(0)
        .describe('O numero da primeira questão a ser retornada')
        .openapi({ example: 0 }),
    language: z
        .string()
        .optional()
        .describe('O idioma desejado das questões')
        .openapi({ example: 'ingles' }),
    subject: z
        .enum(SubjectValues)
        .optional()
        .describe(
            'Filtrar por matéria. Com filtros de matéria ou tópico, `offset` é a posição na lista filtrada',
        )
        .openapi({ example: 'matematica' }),
    topic: z
        .enum(TopicValues)
        .optional()
        .describe('Filtrar por tópico')
        .openapi({ example: 'progressao-aritmetica' }),
});

export const GetQuestionDetailsQuerySchema = z.object({
    language: z
        .string()
        .optional()
        .describe('O idioma desejado da questão')
        .openapi({ example: 'ingles' }),
});

export const QuestionLanguageValues = ['ingles', 'espanhol'] as const;

export const QuestionIdSchema = z
    .string()
    .regex(/^\d{4}-\d{1,3}(?:-(?:ingles|espanhol))?$/, 'Invalid question id')
    .describe(
        'Identificador da questão: `{ano}-{numero}`, ou `{ano}-{numero}-{idioma}` para questões de língua estrangeira',
    )
    .openapi({ example: '2020-1-ingles' });

export const QuestionIndexEntrySchema = z
    .object({
        id: QuestionIdSchema,
        year: z
            .number()
            .int()
            .positive()
            .describe('O ano em que a prova foi aplicada')
            .openapi({ example: 2020 }),
        index: z
            .number()
            .int()
            .positive()
            .describe('O número da questão na prova')
            .openapi({ example: 1 }),
        discipline: z
            .string()
            .nullable()
            .describe('A disciplina da questão')
            .openapi({ example: 'linguagens' }),
        language: z
            .string()
            .nullable()
            .describe('O idioma da questão')
            .openapi({ example: 'ingles' }),
        subject: z
            .enum(SubjectValues)
            .nullable()
            .describe('A matéria da questão')
            .openapi({ example: 'ingles' }),
        topics: z
            .array(z.enum(TopicValues))
            .describe('Os tópicos da matéria abordados na questão')
            .openapi({ example: ['interpretacao-texto'] }),
    })
    .openapi({
        title: 'Questão (índice)',
    });

export const QuestionsIndexResponseSchema = z.object({
    total: z
        .number()
        .int()
        .nonnegative()
        .describe(
            'O número total de questões, incluindo as variantes de idioma',
        )
        .openapi({ example: 2757 }),
    questions: z
        .array(QuestionIndexEntrySchema)
        .describe('Todas as questões de todas as provas'),
});

// Parâmetros separados por vírgula. O pipeline mantém `type: string` na
// documentação (zod-openapi documenta a *entrada* dos parâmetros de query),
// mas cada item ainda é validado (422 para valores inválidos).
const splitCsv = (value: string | undefined) => {
    if (value === undefined) {
        return undefined;
    }

    const items = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    return items.length > 0 ? items : undefined;
};

const csvParam = <T extends z.ZodTypeAny>(item: T) =>
    z.string().optional().transform(splitCsv).pipe(z.array(item).optional());

export const SearchQuestionsQuerySchema = z.object({
    ids: csvParam(QuestionIdSchema)
        .describe(
            'Ids de questões separados por vírgula (máx. 100). Quando informado, os demais filtros e a paginação são ignorados; a ordem é preservada e ids desconhecidos são omitidos',
        )
        .openapi({ example: '2020-1-ingles,2019-91,2023-180' }),
    year: csvParam(z.coerce.number().int().positive())
        .describe('Filtrar por ano(s) da prova, separados por vírgula')
        .openapi({ example: '2022,2023' }),
    discipline: csvParam(z.enum(DisciplineValues))
        .describe('Filtrar por disciplina(s), separadas por vírgula')
        .openapi({ example: 'matematica,ciencias-natureza' }),
    subject: csvParam(z.enum(SubjectValues))
        .describe('Filtrar por matéria(s), separadas por vírgula')
        .openapi({ example: 'fisica,quimica' }),
    topic: csvParam(z.enum(TopicValues))
        .describe(
            'Filtrar por tópico(s), separados por vírgula: a questão é incluída se abordar ao menos um deles',
        )
        .openapi({ example: 'progressao-aritmetica' }),
    language: z
        .enum(QuestionLanguageValues)
        .default('espanhol')
        .describe(
            'O idioma das questões de língua estrangeira; questões sem idioma são sempre incluídas',
        )
        .openapi({ example: 'ingles' }),
    random: z
        .preprocess(
            value => value === true || value === 'true' || value === '1',
            z.boolean(),
        )
        .default(false)
        .describe('Embaralhar a lista filtrada antes de paginar')
        .openapi({ example: false }),
    seed: z
        .string()
        .min(1)
        .max(64)
        .optional()
        .describe(
            'A semente do embaralhamento (usada apenas com `random=true`). Se omitida, uma semente é gerada e devolvida em `metadata.seed`',
        )
        .openapi({ example: 'abc123' }),
    limit: z.coerce
        .number()
        .int()
        .positive()
        .default(10)
        .describe('O número máximo de questões a serem retornadas (máx. 100)')
        .openapi({ example: 10 }),
    offset: z.coerce
        .number()
        .int()
        .nonnegative()
        .default(0)
        .describe('A posição (base zero) da primeira questão na lista filtrada')
        .openapi({ example: 0 }),
});

export const SearchQuestionsResponseSchema = z.object({
    metadata: GetQuestionsResponseSchema.shape.metadata.extend({
        seed: z
            .string()
            .optional()
            .describe('A semente usada no embaralhamento, quando `random=true`')
            .openapi({ example: 'abc123' }),
    }),
    questions: z
        .array(QuestionDetailSchema)
        .describe('As questões encontradas'),
});
