/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // `NEXT_OUTPUT=standalone` é definido apenas no Dockerfile; `next start`
    // e a Vercel continuam com a saída padrão.
    ...(process.env.NEXT_OUTPUT === 'standalone' && { output: 'standalone' }),
    async headers() {
        return [
            {
                source: '/v1/:path*',
                headers: [
                    {
                        key: 'Access-Control-Allow-Origin',
                        value: '*',
                    },
                    {
                        key: 'Access-Control-Allow-Methods',
                        value: 'GET, POST, PUT, DELETE, OPTIONS',
                    },
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Content-Type, Authorization',
                    },
                    {
                        key: 'Access-Control-Expose-Headers',
                        value: 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
