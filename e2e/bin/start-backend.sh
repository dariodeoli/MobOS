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
PGDATA="/tmp/mobos-e2e-pg"
PGPORT="5439"
DB_NAME="mobos_e2e"
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
  if [[ ! -d "$PGDATA" ]]; then
    echo "[e2e] Initializing PostgreSQL cluster at $PGDATA (port ${PGPORT})..."
    "$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust --no-locale --encoding=UTF8 >/dev/null
  fi
  echo "[e2e] Starting PostgreSQL on port ${PGPORT}..."
  "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-h 127.0.0.1 -p $PGPORT" -w start >/dev/null
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
MOBOS_APP_URL=http://localhost:5175
EOF
}
if [[ ! -f "$ENV_FILE" ]]; then
  write_env
elif ! grep -q "^DATABASE_URL=$DATABASE_URL\$" "$ENV_FILE" || ! grep -q "^MOBOS_APP_URL=http://localhost:5175\$" "$ENV_FILE"; then
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
if [[ ! -d "$BACKEND_ROOT/node_modules/.prisma" ]] || [[ "$BACKEND_ROOT/prisma/schema.prisma" -nt "$PRISMA_CLIENT" ]]; then
  echo "[e2e] Generating Prisma client…"
  (cd "$BACKEND_ROOT" && DATABASE_URL="$DATABASE_URL" npx prisma generate --schema prisma/schema.prisma >/dev/null)
fi
echo "[e2e] Applying Prisma migrations…"
(cd "$BACKEND_ROOT" && DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy --schema prisma/schema.prisma)

# ── Next.js dev server on 3001 ────────────────────────────────────────────
echo "[e2e] Starting backend (Next.js) on port 3001…"
cd "$BACKEND_ROOT"
export DATABASE_URL
export MOBOS_APP_URL="http://localhost:5175"
exec npm run dev
