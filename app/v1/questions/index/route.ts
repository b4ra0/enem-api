import { NextRequest, NextResponse } from 'next/server';
import z from '@/lib/zod';
import { QuestionsIndexResponseSchema } from '@/lib/zod/schemas/questions';
import { handleAndReturnErrorResponse } from '@/lib/api/errors';
import { getQuestionsIndex } from '@/lib/api/questions/get-questions-index';
import { RateLimiter } from '@/lib/api/rate-limit';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';

const rateLimiter = new RateLimiter();

export async function GET(request: NextRequest) {
    try {
        const { rateLimitHeaders } = rateLimiter.check(request);

        await logger(request);

        const { entries } = await getQuestionsIndex();

        // As entradas já foram validadas ao montar o índice.
        const body: z.infer<typeof QuestionsIndexResponseSchema> = {
            total: entries.length,
            questions: entries,
        };

        return NextResponse.json(body, {
            headers: {
                ...rateLimitHeaders,
                'Cache-Control':
                    'public, max-age=3600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        return handleAndReturnErrorResponse(error);
    }
}
