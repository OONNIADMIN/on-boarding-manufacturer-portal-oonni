# Production image for the manufacturer portal (Next.js 14 + Prisma).
# Build with: docker compose up -d --build

FROM node:22.23.2-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare yarn@4.18.0 --activate

COPY package.json yarn.lock .yarnrc.yml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# prisma.config.ts reads DATABASE_URL at import; generate does not connect.
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/oonni_onboarding?schema=public"
ENV YARN_ENABLE_SCRIPTS=false
RUN yarn install --immutable

FROM node:22.23.2-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare yarn@4.18.0 --activate

COPY package.json yarn.lock .yarnrc.yml ./
COPY --from=deps /app/node_modules ./node_modules

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY styles ./styles
COPY types ./types
COPY data_json ./data_json
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY middleware.ts ./
COPY next.config.js ./
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/oonni_onboarding?schema=public"

RUN yarn prisma generate
RUN yarn build

FROM node:22.23.2-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
