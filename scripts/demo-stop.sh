#!/usr/bin/env bash
set -euo pipefail

screen -S workcalendar-api -X quit >/dev/null 2>&1 || true
screen -S workcalendar-web -X quit >/dev/null 2>&1 || true

for port in 3000 3001; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids >/dev/null 2>&1 || true
  fi
done

echo "Work Calendar AI demo stopped."
