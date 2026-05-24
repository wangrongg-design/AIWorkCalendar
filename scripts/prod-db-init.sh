#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

docker compose -f "$COMPOSE_FILE" exec api pnpm --filter @work-calendar-ai/api prisma:generate
docker compose -f "$COMPOSE_FILE" exec api pnpm --filter @work-calendar-ai/api prisma:push
docker compose -f "$COMPOSE_FILE" exec api pnpm --filter @work-calendar-ai/api seed

echo "Production database initialized."

