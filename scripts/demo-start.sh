#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_Q="$(printf "%q" "$ROOT")"

mkdir -p "$ROOT/tmp"

screen -S workcalendar-api -X quit >/dev/null 2>&1 || true
screen -S workcalendar-web -X quit >/dev/null 2>&1 || true

for port in 3000 3001; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids >/dev/null 2>&1 || true
  fi
done

sleep 1

for port in 3000 3001; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids >/dev/null 2>&1 || true
  fi
done

: > "$ROOT/tmp/local-api.log"
: > "$ROOT/tmp/web.log"

rm -rf "$ROOT/apps/web/.next"

screen -dmS workcalendar-api /bin/zsh -lc "export PATH=\"\$HOME/.local/bin:\$PATH\"; cd $ROOT_Q && API_PORT=3001 node scripts/local-api.mjs >> tmp/local-api.log 2>&1"
screen -dmS workcalendar-web /bin/zsh -lc "export PATH=\"\$HOME/.local/bin:\$PATH\"; cd $ROOT_Q && NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @work-calendar-ai/web dev >> tmp/web.log 2>&1"

sleep 4

curl -fsS http://localhost:3001/health >/dev/null
curl -fsS -I http://localhost:3000/login >/dev/null

echo "Work Calendar AI demo is running."
echo "Web: http://localhost:3000"
echo "API: http://localhost:3001"
