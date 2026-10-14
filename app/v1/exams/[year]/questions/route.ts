import z from '@/lib/zod';
import { NextRequest, NextResponse } from 'next/server';
import { getSearchParamsAsObject } from '@/lib/utils';
import {
    QuestionDetailSchema,
    GetQuestionsResponseSchema,
    GetQuestionsQuerySchema,
} from '@/lib/zod/schemas/questions';
import { EnemApiError, handleAndReturnErrorResponse } from '@/lib/api/errors';
import { getExamDetails } from '@/lib/api/exams/get-exam-details';
import { getQuestionDetails } from '@/lib/api/questions/get-question-details';
import { RateLimiter } from '@/lib/api/rate-limit';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';

const rateLimiter = new RateLimiter();

export async function GET(
    request: NextRequest,
    { params }: { params: { year: string } },
) {
    try {
        const { rateLimitHeaders } = rateLimiter.check(request);

        await logger(request);

        const searchParams = request.nextUrl.searchParams;

        let { limit, offset, language, subject, topic, application } =
            GetQuestionsQuerySchema.parse(
                getSearchParamsAsObject(searchParams),
            );

        if (Number(limit) > 50) {
            throw new EnemApiError({
                code: 'bad_request',
                message: 'Limit cannot be greater than 50',
            });
        }

        const exam = await getExamDetails({
            year: params.year,
            application,
        });

        if (!exam) {
            throw new EnemApiError({
                code: 'not_found',
                message:
                    `No exam found for year ${params.year}` +
                    (application === 'reaplicacao'
                        ? ' (reaplicação not available for this year)'
                        : ''),
            });
        }

        if (language && !exam.languages.find(lang => lang.value === language)) {
            throw new EnemApiError({
                code: 'bad_request',
                message: `Language ${language} not found in exam`,
            });
        }

        if (!language && exam.languages.length > 0) {
            language = exam.languages[0].value;
        }

        const isFiltered = Boolean(subject || topic);

        const matchingQuestions = exam.questions
            .filter(
                question =>
                    question.language === language || !question.language,
            )
            .filter(question => !subject || question.subject === subject)
            .filter(question => !topic || question.topics.includes(topic));

        // Sem filtros, `offset` continua sendo o número da questão na prova.
        // Com filtros, a numeração deixa de ser contínua, então `offset`
        // passa a ser a posição na lista filtrada.
        const questionsToFetch = isFiltered
            ? matchingQuestions.slice(
                  Number(offset),
                  Number(offset) + Number(limit),
              )
            : matchingQuestions
                  .filter(question => question.index >= Number(offset))
                  .filter(
                      question =>
                          question.index <= Number(offset) + Number(limit),
                  );

        const total = isFiltered
            ? matchingQuestions.length
            : exam.questions.length;

        const questions: Array<z.infer<typeof QuestionDetailSchema>> = [];

        for (const question of questionsToFetch) {
            const questionDetails = await getQuestionDetails({
                year: params.year,
                index: question.index,
                language,
                application,
            });

            if (!questionDetails) {
                throw new EnemApiError({
                    code: 'internal_server_error',
                    message: `Failed to fetch question ${question.index}`,
                });
            }

            questions.push(questionDetails);
        }

        return NextResponse.json(
            GetQuestionsResponseSchema.parse({
                metadata: {
                    limit: Number(limit),
                    offset: Number(offset),
                    total,
                    hasMore: Number(offset) + Number(limit) < total,
                },
                questions,
            }),
            { headers: rateLimitHeaders },
        );
    } catch (error) {
        return handleAndReturnErrorResponse(error);
    }
}
