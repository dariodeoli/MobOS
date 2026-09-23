#!/usr/bin/env bash
# MobOS E2E frontend bootstrap (Phase 1 QA).
#
# Writes root .env with VITE_API_URL=http://localhost:${API_PORT} when missing (the
# file is gitignored), then runs the Vite dev server pinned to port 5175 —
# the only local origin allowed by the backend CORS config
# (backend/lib/identity.ts MOBOS_LOCAL_APP_ORIGIN, which also matches the
# Vite default port in vite.config.js).

set -euo pipefail

# Aislable por agente/CI (ver start-backend.sh).
API_PORT="${MOBOS_E2E_API_PORT:-3001}"
WEB_PORT="${MOBOS_E2E_WEB_PORT:-5175}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]] || ! grep -q "^VITE_API_URL=http://localhost:${API_PORT}\$" "$ENV_FILE"; then
  echo "[e2e] Writing root .env with VITE_API_URL=http://localhost:${API_PORT}"
  if [[ -f "$ENV_FILE" ]] && grep -q "^VITE_API_URL=" "$ENV_FILE"; then
    sed -i '' "s|^VITE_API_URL=.*|VITE_API_URL=http://localhost:${API_PORT}|" "$ENV_FILE"
  else
    printf 'VITE_API_URL=http://localhost:%s\n' "$API_PORT" >> "$ENV_FILE"
  fi
fi

echo "[e2e] Starting frontend on port ${WEB_PORT}…"
cd "$REPO_ROOT"
# Modo del frontend:
# - `dev` (default): Vite dev server; es lo que usan los tests (sin build).
# - `preview` (MOBOS_E2E_FRONTEND=preview): build de producción + `vite preview`.
#   La auditoría de performance (#247) mide con el bundle real; el modo dev
#   sirve cientos de módulos sueltos y no representa la carga de producción.
if [[ "${MOBOS_E2E_FRONTEND:-dev}" == "preview" ]]; then
  echo "[e2e] Frontend en modo preview (build de producción)…"
  VITE_API_URL="http://localhost:${API_PORT}" ./node_modules/.bin/vite build --logLevel warn
  exec ./node_modules/.bin/vite preview --port "$WEB_PORT" --strictPort --host 127.0.0.1
fi
# Binario directo (sin el wrapper de npm): al terminar la suite Playwright mata
# este proceso y no queda un Vite huérfano ocupando el puerto.
exec ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort --host 127.0.0.1
