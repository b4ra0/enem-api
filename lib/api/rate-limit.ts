import { NextRequest } from 'next/server';
import { EnemApiError } from './errors';

const DEFAULT_WINDOW_MS = 10000;
const DEFAULT_MAX_REQUESTS = 10;

function readEnvInt(name: string, fallback: number) {
    const raw = process.env[name];

    if (raw === undefined || raw.trim() === '') {
        return fallback;
    }

    const value = Number(raw);

    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function readEnvFlag(name: string) {
    return ['true', '1'].includes((process.env[name] ?? '').trim());
}

function getClientId(request: NextRequest) {
    const forwardedFor = request.headers.get('X-Forwarded-For');
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();

    return request.ip ?? (forwardedIp || 'unknown');
}

class RateLimiter {
    windowSize: number;
    maxRequests: number;
    disabled: boolean;
    idToWindows: Map<string, Array<number>>;

    // Argumentos explícitos têm prioridade; depois as variáveis de ambiente
    // `RATE_LIMIT_WINDOW_MS` e `RATE_LIMIT_MAX_REQUESTS`; por fim os padrões.
    // `RATE_LIMIT_DISABLED=true` (ou `RATE_LIMIT_MAX_REQUESTS=0`) desliga o
    // limite por completo.
    constructor(windowSize?: number, maxRequests?: number) {
        this.windowSize =
            windowSize ||
            readEnvInt('RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS) ||
            DEFAULT_WINDOW_MS;
        this.maxRequests =
            maxRequests ||
            readEnvInt('RATE_LIMIT_MAX_REQUESTS', DEFAULT_MAX_REQUESTS);
        this.disabled =
            readEnvFlag('RATE_LIMIT_DISABLED') || this.maxRequests === 0;
        this.idToWindows = new Map<string, Array<number>>();
    }

    check(request: NextRequest): {
        rateLimitHeaders: Record<string, string>;
    } {
        if (this.disabled) {
            return { rateLimitHeaders: {} };
        }

        const ip = getClientId(request);
        const now = Date.now();

        let queue = this.idToWindows.get(ip);

        if (!queue) {
            queue = [];
            this.idToWindows.set(ip, queue);
        }

        while (queue.length > 0 && now - queue[0] > this.windowSize) {
            queue.shift();
        }

        if (queue.length >= this.maxRequests) {
            const resetTime = queue[0] + this.windowSize - now;

            throw new EnemApiError({
                code: 'rate_limit_exceeded',
                message: `Rate limit exceeded. Try again in ${resetTime}ms.`,
                headers: {
                    'X-RateLimit-Limit': String(this.maxRequests),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(resetTime),
                    'Retry-After': String(resetTime),
                },
            });
        }

        queue.push(now);

        const rateLimitHeaders = {
            'X-RateLimit-Limit': String(this.maxRequests),
            'X-RateLimit-Remaining': String(this.maxRequests - queue.length),
            'X-RateLimit-Reset': String(this.windowSize),
        };

        return {
            rateLimitHeaders,
        };
    }
}

export { RateLimiter };
