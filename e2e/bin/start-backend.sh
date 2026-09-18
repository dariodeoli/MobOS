#!/usr/bin/env bash
# MobOS E2E backend bootstrap (Phase 1 QA).
#
# Idempotent: reuses the local Postgres cluster in /tmp/mobos-e2e-pg and the
# seeded mobos_e2e database when they already exist. Writes backend/.env only
# when it is missing or differs from the required values (the file is
# gitignored). Then runs Prisma migrations and starts Next.js on port 3001.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_ROOT="$REPO_ROOT/backend"
PG_BIN="/opt/homebrew/bin"
# Aislable por agente/CI: cada valor puede venir por variable de entorno.
PGDATA="${MOBOS_E2E_PGDATA:-/tmp/mobos-e2e-pg}"
PGPORT="${MOBOS_E2E_PGPORT:-5439}"
DB_NAME="${MOBOS_E2E_DB:-mobos_e2e}"
API_PORT="${MOBOS_E2E_API_PORT:-3001}"
WEB_PORT="${MOBOS_E2E_WEB_PORT:-5175}"

# Un worktree vinculado no debe usar la base compartida: si otro agente corre
# su propia suite, el teardown se lleva puesto el cluster del otro. Los valores
# únicos los deriva `playwright.config.js`; acá solo se avisa.
GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --git-dir 2>/dev/null || echo .git)"
GIT_COMMON="$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || echo .git)"
if [[ "$GIT_DIR" != "$GIT_COMMON" && "$PGDATA" == "/tmp/mobos-e2e-pg" ]]; then
  echo "[e2e] AVISO: worktree vinculado usando la base compartida $PGDATA." >&2
  echo "[e2e] Corré 'npm run test:e2e' (deriva base y puertos únicos) o exportá MOBOS_E2E_PGDATA/PGPORT/API_PORT/WEB_PORT." >&2
fi
DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/${DB_NAME}"

for binary in initdb pg_ctl createdb; do
  if [[ ! -x "$PG_BIN/$binary" ]]; then
    echo "Missing required PostgreSQL binary: $PG_BIN/$binary" >&2
    exit 1
  fi
done

pg_running() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1
}

# ── Postgres cluster ──────────────────────────────────────────────────────
if ! pg_running; then
  if lsof -nP -iTCP:"$PGPORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[e2e] El puerto $PGPORT ya está en uso por otro proceso (¿otro worktree?)." >&2
    echo "[e2e] Exportá valores únicos: MOBOS_E2E_PGPORT, MOBOS_E2E_API_PORT, MOBOS_E2E_WEB_PORT." >&2
    exit 1
  fi
  if [[ ! -d "$PGDATA" ]]; then
    echo "[e2e] Initializing PostgreSQL cluster at $PGDATA (port ${PGPORT})..."
    "$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust --no-locale --encoding=UTF8 >/dev/null
  fi
  echo "[e2e] Starting PostgreSQL on port ${PGPORT}..."
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-h 127.0.0.1 -p $PGPORT -k $PGDATA" -w start >/dev/null
fi

if ! "$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DB_NAME" >/dev/null 2>&1; then
  # createdb exits non-zero when the database already exists; that is fine.
  if ! "$PG_BIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    echo "[e2e] Failed to create database $DB_NAME" >&2
    exit 1
  fi
fi

# ── backend/.env ──────────────────────────────────────────────────────────
ENV_FILE="$BACKEND_ROOT/.env"
write_env() {
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=$DATABASE_URL
MOBOS_APP_URL=http://localhost:$WEB_PORT
EOF
}
if [[ ! -f "$ENV_FILE" ]]; then
  write_env
elif ! grep -q "^DATABASE_URL=$DATABASE_URL\$" "$ENV_FILE" || ! grep -q "^MOBOS_APP_URL=http://localhost:$WEB_PORT\$" "$ENV_FILE"; then
  echo "[e2e] backend/.env differs from required values; rewriting."
  write_env
fi

# ── Prisma client + migrations ────────────────────────────────────────────
# Prisma 7 does not auto-load .env; prisma.config.ts reads process.env, so the
# URL must be exported into the CLI subprocess.
# The client is regenerated whenever the schema is newer than the generated
# client (a stale client predating the latest schema breaks idempotent
# lookups such as prisma.order.findUnique({ tenantId_idempotencyKey })).
PRISMA_CLIENT="$BACKEND_ROOT/node_modules/.prisma/client/index.d.ts"
if [[ ! -d "$BACKEND_ROOT/node_modules/.prisma" ]] || [[ "$BACKEND_ROOT/prisma/schema.prisma" -nt "$PRISMA_CLIENT" ]] || ! grep -q "reservationCustomerId" "$PRISMA_CLIENT" 2>/dev/null; then
  echo "[e2e] Generating Prisma client…"
  (cd "$BACKEND_ROOT" && DATABASE_URL="$DATABASE_URL" npx prisma generate --schema prisma/schema.prisma >/dev/null)
fi
echo "[e2e] Applying Prisma migrations…"
(cd "$BACKEND_ROOT" && DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy --schema prisma/schema.prisma)

# ── Next.js dev server on 3001 ────────────────────────────────────────────
echo "[e2e] Starting backend (Next.js) on port ${API_PORT}…"
cd "$BACKEND_ROOT"
export DATABASE_URL
export MOBOS_APP_URL="http://localhost:$WEB_PORT"
exec ./node_modules/.bin/next dev -p "$API_PORT"
