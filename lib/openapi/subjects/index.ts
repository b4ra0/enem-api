import { ZodOpenApiPathsObject } from 'zod-openapi';
import { getSubjects } from './get-subjects';

export const subjectsPaths: ZodOpenApiPathsObject = {
    '/subjects': {
        get: getSubjects,
    },
};
