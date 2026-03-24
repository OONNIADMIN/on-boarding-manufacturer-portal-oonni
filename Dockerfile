# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY styles ./styles
COPY types ./types
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY middleware.ts ./
COPY next.config.js ./
COPY tsconfig.json ./
COPY next-env.d.ts ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma ./prisma

COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 4200
ENV PORT=4200
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
