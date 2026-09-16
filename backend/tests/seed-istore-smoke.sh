#!/usr/bin/env bash
# Smoke test de la migración de seed iStore: levanta un PostgreSQL desechable,
# aplica todas las migraciones, crea un tenant similar al real y ejecuta el
# seed para validar sintaxis y conteos esperados.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../../backend" && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/bin}"
RUN_ROOT="$(mktemp -d /tmp/mobos-seed-smoke.XXXXXX)"
PGDATA="$RUN_ROOT/data"
PGPORT="${MOBOS_IT_PGPORT:-55439}"
DB_NAME="mobos_seed_smoke"

for binary in initdb pg_ctl createdb psql; do
  if [[ ! -x "$PG_BIN/$binary" ]]; then echo "Falta $binary en $PG_BIN"; rm -rf "$RUN_ROOT"; exit 1; fi
done

cleanup() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf "$RUN_ROOT"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-h 127.0.0.1 -p $PGPORT -k $RUN_ROOT" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DB_NAME"
export DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/${DB_NAME}"

(cd "$BACKEND_ROOT" && ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma >/dev/null)

"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO "Tenant" ("id", "name", "email", "slug", "updatedAt") VALUES ('tenant-seed', 'iStore Paraguay', 'dariodeoli@gmail.com', 'istore-seed', now());
INSERT INTO "Branch" ("id", "tenantId", "name", "city", "updatedAt") VALUES ('branch-seed-asu', 'tenant-seed', 'Asunción', 'Asunción', now());
INSERT INTO "Branch" ("id", "tenantId", "name", "city", "updatedAt") VALUES ('branch-seed-cde', 'tenant-seed', 'CDE', 'Ciudad del Este', now());
INSERT INTO "User" ("id", "tenantId", "branchId", "name", "role", "pinHash", "updatedAt") VALUES ('user-seed-admin', 'tenant-seed', 'branch-seed-asu', 'Dario', 'ADMIN', 'x', now());
SQL

# Ejecuta el bloque DO del seed manualmente (idempotencia incluida).
"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKEND_ROOT/prisma/migrations/20260916030000_istore_paraguay_real_stock/migration.sql" >/dev/null
# Segunda pasada: debe ser no-op sin errores.
"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKEND_ROOT/prisma/migrations/20260916030000_istore_paraguay_real_stock/migration.sql" >/dev/null

count() { "$PG_BIN/psql" "$DATABASE_URL" -At -c "$1"; }

PRODUCTS="$(count "SELECT count(*) FROM \"Product\" WHERE \"tenantId\"='tenant-seed'")"
UNITS="$(count "SELECT count(*) FROM \"InventoryUnit\" WHERE \"tenantId\"='tenant-seed'")"
AVAILABLE="$(count "SELECT count(*) FROM \"InventoryUnit\" WHERE \"tenantId\"='tenant-seed' AND status='AVAILABLE'")"
RESERVED="$(count "SELECT count(*) FROM \"InventoryUnit\" WHERE \"tenantId\"='tenant-seed' AND status='RESERVED'")"
SOLD="$(count "SELECT count(*) FROM \"InventoryUnit\" WHERE \"tenantId\"='tenant-seed' AND status='SOLD'")"
TRANSIT="$(count "SELECT count(*) FROM \"InventoryUnit\" WHERE \"tenantId\"='tenant-seed' AND status='IN_TRANSIT'")"
STOCK_CHECK="$(count "SELECT count(*) FROM \"Product\" p WHERE p.\"tenantId\"='tenant-seed' AND p.stock <> (SELECT COALESCE(count(*),0) FROM \"InventoryUnit\" u WHERE u.\"productId\"=p.id AND u.status IN ('AVAILABLE','RESERVED')) AND p.sku LIKE 'IPH-%'")"
SUPPLIERS="$(count "SELECT count(*) FROM \"Supplier\" WHERE \"tenantId\"='tenant-seed'")"
LOCATIONS="$(count "SELECT count(*) FROM \"StockLocation\" WHERE \"tenantId\"='tenant-seed'")"

echo "productos=$PRODUCTS unidades=$UNITS (disponibles=$AVAILABLE reservadas=$RESERVED vendidas=$SOLD transito=$TRANSIT)"
echo "proveedores=$SUPPLIERS ubicaciones=$LOCATIONS desajustes_stock_serializado=$STOCK_CHECK"

[[ "$PRODUCTS" -ge 800 ]] || { echo "FALLA: catálogo incompleto"; exit 1; }
[[ "$UNITS" -ge 150 ]] || { echo "FALLA: unidades incompletas"; exit 1; }
[[ "$SOLD" -ge 15 ]] || { echo "FALLA: vendidas incompletas"; exit 1; }
[[ "$RESERVED" -ge 8 ]] || { echo "FALLA: reservadas incompletas"; exit 1; }
[[ "$TRANSIT" -ge 5 ]] || { echo "FALLA: tránsito incompleto"; exit 1; }
[[ "$STOCK_CHECK" -eq 0 ]] || { echo "FALLA: stock de producto desajustado con unidades"; exit 1; }
echo "seed-istore-smoke: OK"
