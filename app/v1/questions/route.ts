import { NextRequest, NextResponse } from 'next/server';
import z from '@/lib/zod';
import { getSearchParamsAsObject } from '@/lib/utils';
import {
    QuestionDetailSchema,
    SearchQuestionsQuerySchema,
    SearchQuestionsResponseSchema,
} from '@/lib/zod/schemas/questions';
import { EnemApiError, handleAndReturnErrorResponse } from '@/lib/api/errors';
import {
    getQuestionsIndex,
    QuestionIndexEntry,
} from '@/lib/api/questions/get-questions-index';
import { getQuestionDetails } from '@/lib/api/questions/get-question-details';
import {
    generateSeed,
    seededShuffle,
} from '@/lib/api/questions/seeded-shuffle';
import { Application } from '@/lib/zod/schemas/application';
import { RateLimiter } from '@/lib/api/rate-limit';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';

const rateLimiter = new RateLimiter();

const MAX_LIMIT = 100;
const MAX_IDS = 100;

type Metadata = z.infer<typeof SearchQuestionsResponseSchema>['metadata'];

export async function GET(request: NextRequest) {
    try {
        const { rateLimitHeaders } = rateLimiter.check(request);

        await logger(request);

        const query = SearchQuestionsQuerySchema.parse(
            getSearchParamsAsObject(request.nextUrl.searchParams),
        );

        if (query.limit > MAX_LIMIT) {
            throw new EnemApiError({
                code: 'bad_request',
                message: `Limit cannot be greater than ${MAX_LIMIT}`,
            });
        }

        if (query.ids && query.ids.length > MAX_IDS) {
            throw new EnemApiError({
                code: 'bad_request',
                message: `Cannot request more than ${MAX_IDS} ids at once`,
            });
        }

        const { entries, byId } = await getQuestionsIndex();

        let selected: QuestionIndexEntry[];
        let metadata: Metadata;

        if (query.ids) {
            // Modo `ids`: filtros e paginação são ignorados, a ordem é
            // preservada, duplicados são removidos e ids desconhecidos
            // são omitidos.
            const uniqueIds = Array.from(new Set(query.ids));

            selected = uniqueIds.flatMap(id => {
                const entry = byId.get(id);
                return entry ? [entry] : [];
            });

            metadata = {
                limit: uniqueIds.length,
                offset: 0,
                total: selected.length,
                hasMore: false,
            };
        } else {
            const {
                year,
                application,
                discipline,
                subject,
                topic,
                language,
                random,
                seed,
                limit,
                offset,
            } = query;

            if (year) {
                const knownYears = new Set(entries.map(entry => entry.year));
                const unknownYear = year.find(value => !knownYears.has(value));

                if (unknownYear !== undefined) {
                    throw new EnemApiError({
                        code: 'not_found',
                        message: `No exam found for year ${unknownYear}`,
                    });
                }
            }

            const years = year && new Set(year);
            const applications = application && new Set(application);
            const disciplines = discipline && new Set(discipline);
            const subjects = subject && new Set(subject);
            const topics = topic && new Set(topic);

            let filtered = entries.filter(
                entry =>
                    (!years || years.has(entry.year)) &&
                    (!applications || applications.has(entry.application)) &&
                    (!disciplines ||
                        (entry.discipline !== null &&
                            disciplines.has(entry.discipline))) &&
                    (!subjects ||
                        (entry.subject !== null &&
                            subjects.has(entry.subject))) &&
                    (!topics ||
                        entry.topics.some(value => topics.has(value))) &&
                    (entry.language === null || entry.language === language),
            );

            const effectiveSeed = random ? (seed ?? generateSeed()) : undefined;

            if (effectiveSeed !== undefined) {
                filtered = seededShuffle(filtered, effectiveSeed);
            }

            selected = filtered.slice(offset, offset + limit);

            metadata = {
                limit,
                offset,
                total: filtered.length,
                hasMore: offset + limit < filtered.length,
                ...(effectiveSeed !== undefined && { seed: effectiveSeed }),
            };
        }

        const questions: Array<
            z.infer<typeof QuestionDetailSchema> & {
                application: Application;
            }
        > = await Promise.all(
            selected.map(async entry => {
                const details = await getQuestionDetails({
                    year: entry.year,
                    index: entry.index,
                    language: entry.language,
                    application: entry.application,
                });

                if (!details) {
                    throw new EnemApiError({
                        code: 'internal_server_error',
                        message: `Failed to fetch question ${entry.id}`,
                    });
                }

                return { ...details, application: entry.application };
            }),
        );

        const cacheControl =
            query.random && !query.seed
                ? 'no-store'
                : 'public, max-age=300, stale-while-revalidate=3600';

        return NextResponse.json(
            SearchQuestionsResponseSchema.parse({ metadata, questions }),
            {
                headers: {
                    ...rateLimitHeaders,
                    'Cache-Control': cacheControl,
                },
            },
        );
    } catch (error) {
        return handleAndReturnErrorResponse(error);
    }
}
