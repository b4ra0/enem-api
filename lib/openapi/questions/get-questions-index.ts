import { ZodOpenApiOperationObject } from 'zod-openapi';
import { QuestionsIndexResponseSchema } from '@/lib/zod/schemas/questions';
import { openApiErrorResponses } from '@/lib/openapi/responses';

export const getQuestionsIndex: ZodOpenApiOperationObject = {
    operationId: 'getQuestionsIndex',
    summary: 'Índice de questões',
    description:
        'Listar o índice de todas as questões de todas as provas, com seus metadados (ano, número, disciplina, idioma, matéria e tópicos), sem o enunciado',
    responses: {
        '200': {
            description: 'Índice de questões',
            content: {
                'application/json': {
                    schema: QuestionsIndexResponseSchema,
                },
            },
        },
        ...openApiErrorResponses,
    },
    tags: ['Questões'],
};
