#!/usr/bin/env bash
# MobOS E2E frontend bootstrap (Phase 1 QA).
#
# Writes root .env with VITE_API_URL=http://localhost:3001 when missing (the
# file is gitignored), then runs the Vite dev server pinned to port 5173 —
# the only local origin allowed by the backend CORS config.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]] || ! grep -q "^VITE_API_URL=http://localhost:3001\$" "$ENV_FILE"; then
  echo "[e2e] Writing root .env with VITE_API_URL=http://localhost:3001"
  if [[ -f "$ENV_FILE" ]] && grep -q "^VITE_API_URL=" "$ENV_FILE"; then
    sed -i '' "s|^VITE_API_URL=.*|VITE_API_URL=http://localhost:3001|" "$ENV_FILE"
  else
    printf 'VITE_API_URL=http://localhost:3001\n' >> "$ENV_FILE"
  fi
fi

echo "[e2e] Starting frontend (Vite) on port 5173…"
cd "$REPO_ROOT"
exec npm run dev -- --port 5173 --host 127.0.0.1
