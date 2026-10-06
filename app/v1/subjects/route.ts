import { RateLimiter } from '@/lib/api/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { subjects } from '@/lib/zod/schemas/subjects';
import { handleAndReturnErrorResponse } from '@/lib/api/errors';
import { logger } from '@/lib/api/logger';

export const dynamic = 'force-dynamic';

const rateLimiter = new RateLimiter();

export async function GET(request: NextRequest) {
    try {
        const { rateLimitHeaders } = rateLimiter.check(request);

        await logger(request);

        return NextResponse.json(subjects, { headers: rateLimitHeaders });
    } catch (error) {
        return handleAndReturnErrorResponse(error);
    }
}
