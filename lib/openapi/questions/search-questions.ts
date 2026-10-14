import { ZodOpenApiOperationObject } from 'zod-openapi';
import {
    SearchQuestionsQuerySchema,
    SearchQuestionsResponseSchema,
} from '@/lib/zod/schemas/questions';
import { openApiErrorResponses } from '@/lib/openapi/responses';

export const searchQuestions: ZodOpenApiOperationObject = {
    operationId: 'searchQuestions',
    summary: 'Buscar questões',
    description:
        'Listar questões de todas as provas (aplicação regular e reaplicação), filtrando por ano, aplicação, disciplina, matéria, tópico e idioma, ou por uma lista de ids. Suporta ordem aleatória determinística (`random` + `seed`) e paginação por `limit`/`offset` sobre a lista filtrada.',
    requestParams: {
        query: SearchQuestionsQuerySchema,
    },
    responses: {
        '200': {
            description: 'Lista de questões',
            content: {
                'application/json': {
                    schema: SearchQuestionsResponseSchema,
                },
            },
        },
        ...openApiErrorResponses,
    },
    tags: ['Questões'],
};
