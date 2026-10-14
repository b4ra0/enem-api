import { ZodOpenApiPathsObject } from 'zod-openapi';
import { getQuestions } from './get-questions';
import { getQuestionDetails } from './get-question-details';
import { searchQuestions } from './search-questions';
import { getQuestionsIndex } from './get-questions-index';

export const questionsPaths: ZodOpenApiPathsObject = {
    '/questions': {
        get: searchQuestions,
    },
    '/questions/index': {
        get: getQuestionsIndex,
    },
    '/exams/{year}/questions': {
        get: getQuestions,
    },
    '/exams/{year}/questions/{index}': {
        get: getQuestionDetails,
    },
};
