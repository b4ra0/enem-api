# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
# libc6-compat: Next.js no alpine; openssl: engines do Prisma (musl)
RUN apk add --no-cache libc6-compat openssl \
    && npm install -g pnpm@9
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# O schema precisa existir antes do install: o postinstall do
# @prisma/client executa `prisma generate`.
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# NÃO usar `pnpm build`: ele roda `prisma migrate deploy`, que exige um
# banco de dados. O cliente Prisma é gerado, mas nenhuma migração é aplicada.
RUN pnpm exec prisma generate \
    && pnpm exec next build

# ---------- runner ----------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs
# server.js faz process.chdir(__dirname): public/ precisa ficar ao lado dele,
# pois as rotas leem os JSON das questões via process.cwd()/public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/v1/exams > /dev/null || exit 1
CMD ["node", "server.js"]
