import z from '@/lib/zod';
import taxonomy from '@/lib/taxonomy.json';

export const SubjectValues = taxonomy.map(subject => subject.value) as [
    string,
    ...string[],
];

export const TopicValues = Array.from(
    new Set(taxonomy.flatMap(subject => subject.topics.map(t => t.value))),
) as [string, ...string[]];

export const SubjectSchema = z
    .object({
        label: z
            .string()
            .describe('O nome da matéria')
            .openapi({ example: 'Matemática' }),
        value: z
            .enum(SubjectValues)
            .describe('O código da matéria')
            .openapi({ example: 'matematica' }),
        discipline: z
            .string()
            .describe('A disciplina (área do conhecimento) da matéria')
            .openapi({ example: 'matematica' }),
        topics: z
            .array(
                z.object({
                    label: z.string().describe('O nome do tópico'),
                    value: z.string().describe('O código do tópico'),
                }),
            )
            .describe('Os tópicos da matéria')
            .openapi({
                example: [
                    {
                        label: 'Progressão aritmética (PA)',
                        value: 'progressao-aritmetica',
                    },
                ],
            }),
    })
    .openapi({
        title: 'Matéria',
    });

export const subjects = z.array(SubjectSchema).parse(taxonomy);
