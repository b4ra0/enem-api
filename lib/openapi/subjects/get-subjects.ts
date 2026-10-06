import z from '@/lib/zod';
import { ZodOpenApiOperationObject } from 'zod-openapi';
import { openApiErrorResponses } from '@/lib/openapi/responses';
import { SubjectSchema } from '@/lib/zod/schemas/subjects';

export const getSubjects: ZodOpenApiOperationObject = {
    operationId: 'getSubjects',
    summary: 'Listar matérias',
    description:
        'Listar todas as matérias e seus tópicos, usados para classificar as questões',
    responses: {
        '200': {
            description: 'Lista de matérias',
            content: {
                'application/json': {
                    schema: z.array(SubjectSchema),
                },
            },
        },
        ...openApiErrorResponses,
    },
    tags: ['Matérias'],
};
