FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @work-calendar-ai/api... --prod=false --frozen-lockfile=false
COPY . .
RUN pnpm --filter @work-calendar-ai/api prisma:generate
RUN pnpm --filter @work-calendar-ai/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @work-calendar-ai/api... --prod=false --frozen-lockfile=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @work-calendar-ai/api prisma:generate && if [ \"$RUN_DB_INIT_ON_START\" = \"true\" ]; then pnpm --filter @work-calendar-ai/api prisma:push && pnpm --filter @work-calendar-ai/api report-requirements:backfill && pnpm --filter @work-calendar-ai/api seed; fi && pnpm --filter @work-calendar-ai/api start:prod"]
