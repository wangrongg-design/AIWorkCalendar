#!/usr/bin/env bash
set -euo pipefail

echo "Screen sessions:"
screen -ls || true

echo
echo "Listening ports:"
lsof -iTCP:3000 -sTCP:LISTEN -n -P || true
lsof -iTCP:3001 -sTCP:LISTEN -n -P || true

echo
echo "Health:"
curl -fsS http://localhost:3001/health || true
echo

