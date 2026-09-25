#!/usr/bin/env bash

# MobOS HTTP integration tests.
#
# Safety contract:
# - opt-in only: MOBOS_IT_EXECUTE=1 is required;
# - creates a fresh PostgreSQL cluster below mktemp only;
# - never runs next build; it uses the existing .next output;
# - seeds synthetic tenants/users/products only;
# - cleanup removes only the generated mktemp directory.

set -euo pipefail

if [[ "${MOBOS_IT_EXECUTE:-0}" != "1" ]]; then
  echo "Arnés preparado. Esperando autorización: MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh"
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_ROOT="$REPO_ROOT/backend"
PG_BIN="/opt/homebrew/bin"

for binary in initdb pg_ctl createdb psql pg_dump pg_restore; do
  if [[ ! -x "$PG_BIN/$binary" ]]; then
    echo "Falta el binario PostgreSQL requerido: $PG_BIN/$binary" >&2
    exit 1
  fi
done

if [[ ! -x "$BACKEND_ROOT/node_modules/.bin/prisma" || ! -x "$BACKEND_ROOT/node_modules/.bin/next" ]]; then
  echo "Faltan dependencias locales del backend; no se instalarán durante esta prueba." >&2
  exit 1
fi

if [[ ! -f "$BACKEND_ROOT/.next/BUILD_ID" ]]; then
  echo "No existe un build Next existente; el arnés no ejecuta next build." >&2
  exit 1
fi

free_port() {
  node -e "const net=require('net'); const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port)); s.close();});"
}

TMP_BASE="${TMPDIR:-/tmp}"
RUN_ROOT="$(mktemp -d "$TMP_BASE/mobos-it.XXXXXX")"
case "$RUN_ROOT" in
  "$TMP_BASE"/mobos-it.*) ;;
  *) echo "Ruta temporal inesperada; abortando para proteger otras bases." >&2; exit 1 ;;
esac

PGDATA="$RUN_ROOT/pgdata"
DB_NAME="mobos_it"
PGPORT="$(free_port)"
API_PORT="$(free_port)"
DATABASE_URL="postgresql://postgres@127.0.0.1:${PGPORT}/${DB_NAME}"
BASE_URL="http://127.0.0.1:${API_PORT}"
SERVER_LOG="$RUN_ROOT/backend.log"
SERVER_PID=""

cleanup() {
  set +e
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  if [[ -d "$PGDATA" ]]; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1
  fi
  if [[ -n "$RUN_ROOT" && -d "$RUN_ROOT" ]]; then
    rm -rf -- "$RUN_ROOT"
  fi
  echo "Cluster y servidor temporales limpiados."
}
trap cleanup EXIT INT TERM

echo "Preparando cluster PostgreSQL temporal aislado..."
"$PG_BIN/initdb" -D "$PGDATA" --username=postgres --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-h 127.0.0.1 -p $PGPORT -k $RUN_ROOT" -w start
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DB_NAME"

export DATABASE_URL
(cd "$BACKEND_ROOT" && ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma)
(cd "$BACKEND_ROOT" && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma >/dev/null)

# Base migrada y vacía: el chequeo de consistencia no debe romper sin datos.
(cd "$BACKEND_ROOT" && node tests/consistency-check.mjs) || {
  echo "El chequeo de consistencia falló sobre una base vacía." >&2
  exit 1
}

PIN_HASH="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('2468', 10))")"
PIN_HASH_2="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('1357', 10))")"
PIN_HASH_3="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('8642', 10))")"
PASSWORD_HASH="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('company-password-it', 10))")"

"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pin_hash="$PIN_HASH" -v pin_hash_2="$PIN_HASH_2" -v pin_hash_3="$PIN_HASH_3" -v password_hash="$PASSWORD_HASH" >/dev/null <<'SQL'
INSERT INTO "Tenant" ("id", "name", "slug", "email", "passwordHash", "updatedAt") VALUES
  ('tenant-a-it', 'Tenant A Integration', 'tenant-a-it', 'company-a-it@example.invalid', :'password_hash', CURRENT_TIMESTAMP),
  ('tenant-b-it', 'Tenant B Integration', 'tenant-b-it', 'company-b-it@example.invalid', :'password_hash', CURRENT_TIMESTAMP),
  ('tenant-c-it', 'Tenant C Integration', 'tenant-c-it', 'company-c-it@example.invalid', :'password_hash', CURRENT_TIMESTAMP);

INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt") VALUES
  ('branch-a-it', 'tenant-a-it', 'Sucursal A', CURRENT_TIMESTAMP),
  ('branch-a2-it', 'tenant-a-it', 'Sucursal A2', CURRENT_TIMESTAMP),
  ('branch-b-it', 'tenant-b-it', 'Sucursal B', CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "tenantId", "branchId", "name", "email", "pinHash", "role", "status", "updatedAt") VALUES
  ('user-admin-it', 'tenant-a-it', 'branch-a-it', 'Admin Test', 'admin-it@example.invalid', :'pin_hash', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-a-it', 'tenant-a-it', 'branch-a-it', 'Seller A', 'seller-a-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-a-2-it', 'tenant-a-it', 'branch-a-it', 'Seller A Two', 'seller-a-2-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-cajera-it', 'tenant-a-it', 'branch-a-it', 'Caja A', 'cajera-a-it@example.invalid', :'pin_hash', 'CAJERA', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-gerente-it', 'tenant-a-it', 'branch-a-it', 'Gerente A', 'gerente-a-it@example.invalid', :'pin_hash', 'GERENTE', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-lock-it', 'tenant-a-it', 'branch-a-it', 'Seller Lock', 'seller-lock-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-pinunique-it', 'tenant-a-it', 'branch-a-it', 'Seller Unique Pin', 'seller-pinunique-it@example.invalid', :'pin_hash_2', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-b-it', 'tenant-b-it', 'branch-b-it', 'Seller B', 'seller-b-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-c-admin-it', 'tenant-c-it', NULL, 'Admin C', 'admin-c-it@example.invalid', :'pin_hash', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-repartidor-it', 'tenant-a-it', 'branch-a-it', 'Repartidor IT', 'repartidor-it@example.invalid', :'pin_hash_3', 'REPARTIDOR', 'ACTIVE', CURRENT_TIMESTAMP);

-- Invitaciones sembradas para invitation-app.mjs y para los casos de listado,
-- reenvío y revocación. El relay de correo apunta a un host .invalid: el envío
-- falla de forma tolerada (deliveryState=queued) sin tocar la red real. Los
-- tokenHash son valores sintéticos únicos (nunca se usan por aceptación vía id).
INSERT INTO "UserInvitation" ("id", "tenantId", "email", "name", "role", "branchId", "inviterId", "tokenHash", "expiresAt", "sentAt", "resendAvailableAt", "updatedAt") VALUES
  ('invite-a-b-it', 'tenant-a-it', 'seller-b-it@example.invalid', 'Seller B', 'VENDEDOR', 'branch-a-it', 'user-admin-it', '00000000000000000000000000000000000000000000000000000000000000a1', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('invite-b-b-it', 'tenant-b-it', 'seller-b-it@example.invalid', 'Seller B', 'VENDEDOR', 'branch-b-it', 'user-b-it', '00000000000000000000000000000000000000000000000000000000000000b2', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('invite-c-b-it', 'tenant-c-it', 'seller-b-it@example.invalid', 'Seller B', 'GERENTE', NULL, 'user-c-admin-it', '00000000000000000000000000000000000000000000000000000000000000c3', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('invite-revoke-it', 'tenant-a-it', 'revoke-target-it@example.invalid', 'Revoke Target', 'VENDEDOR', 'branch-a-it', 'user-admin-it', '00000000000000000000000000000000000000000000000000000000000000d4', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP);

INSERT INTO "Product" ("id", "tenantId", "branchId", "sku", "name", "category", "pricePyg", "stock", "isActive", "updatedAt") VALUES
  ('prod-a-order-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-ORDER-IT', 'Synthetic Product A Order', 'Test', 100000, 10, true, CURRENT_TIMESTAMP),
  ('prod-a-rollback-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-ROLLBACK-IT', 'Synthetic Product A Rollback', 'Test', 100000, 2, true, CURRENT_TIMESTAMP),
  ('prod-a-overpay-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-OVERPAY-IT', 'Synthetic Product A Overpay', 'Test', 100000, 5, true, CURRENT_TIMESTAMP),
  ('prod-a-pending-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-PENDING-IT', 'Synthetic Product A Pending', 'Test', 100000, 3, true, CURRENT_TIMESTAMP),
  ('prod-a-concurrent-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-CONCURRENT-IT', 'Synthetic Product A Concurrent', 'Test', 100000, 3, true, CURRENT_TIMESTAMP),
  ('prod-a-crossbranch-it', 'tenant-a-it', 'branch-a2-it', 'SKU-A-CROSSBRANCH-IT', 'Synthetic Product A Cross Branch', 'Test', 100000, 2, true, CURRENT_TIMESTAMP),
  ('prod-b-it', 'tenant-b-it', 'branch-b-it', 'SKU-B-IT', 'Synthetic Product B', 'Test', 100000, 7, true, CURRENT_TIMESTAMP);

UPDATE "Product" SET "costPyg" = 70000 WHERE "id" = 'prod-a-order-it';
SQL

(
  cd "$BACKEND_ROOT"
  # exec: SERVER_PID queda como el proceso next real, para que el cleanup
  # pueda terminarlo sin dejar servidores huérfanos en el puerto temporal.
  NODE_ENV=test MOBOS_APP_URL=https://app.moboss.online MOBOS_TRUST_PROXY=true DATABASE_URL="$DATABASE_URL" \
    MOBOS_MAINTENANCE_TOKEN="it-maintenance-token" \
    MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID="it-v1" \
    MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON='{"it-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}' \
    WEEM_EMAIL_RELAY_URL="https://relay.invalid/api/internal/email/send" \
    WEEM_EMAIL_RELAY_TOKEN="it-relay-token-000000000000" \
    exec "$BACKEND_ROOT/node_modules/.bin/next" start -H 127.0.0.1 -p "$API_PORT" >"$SERVER_LOG" 2>&1
) &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl --silent --fail --output /dev/null "$BASE_URL/api/health"; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Backend no inició; no se imprimen logs para evitar filtrar configuración." >&2
    exit 1
  fi
  sleep 0.25
done
if [[ "$ready" != "1" ]]; then
  echo "Backend no quedó disponible en el puerto temporal." >&2
  exit 1
fi

response_file() {
  mktemp "$RUN_ROOT/response.XXXXXX"
}

request() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local body="${4:-}"
  local output="$5"
  local token="${6:-}"
  local tenant="${7:-tenant-a-it}"
  local -a args=(--silent --show-error --request "$method" --output "$output" --write-out '%{http_code}')
  if [[ -n "$tenant" ]]; then
    args+=(--header "x-tenant-id: $tenant")
  fi
  if [[ -n "$token" ]]; then
    args+=(--header "Authorization: Bearer $token")
  fi
  if [[ -n "$body" ]]; then
    args+=(--header 'Content-Type: application/json' --data "$body")
  fi
  local status
  status="$(curl "${args[@]}" "$BASE_URL$path")"
  if [[ "$status" != "$expected" ]]; then
    echo "FALLÓ $method $path: esperado HTTP $expected, recibido $status" >&2
    exit 1
  fi
}

# Igual que request() pero envía además el header Idempotency-Key.
request_key() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local body="${4:-}"
  local output="$5"
  local token="${6:-}"
  local tenant="${7:-tenant-a-it}"
  local key="$8"
  local -a args=(--silent --show-error --request "$method" --output "$output" --write-out '%{http_code}')
  if [[ -n "$tenant" ]]; then
    args+=(--header "x-tenant-id: $tenant")
  fi
  if [[ -n "$token" ]]; then
    args+=(--header "Authorization: Bearer $token")
  fi
  if [[ -n "$key" ]]; then
    args+=(--header "Idempotency-Key: $key")
  fi
  if [[ -n "$body" ]]; then
    args+=(--header 'Content-Type: application/json' --data "$body")
  fi
  local status
  status="$(curl "${args[@]}" "$BASE_URL$path")"
  if [[ "$status" != "$expected" ]]; then
    echo "FALLÓ $method $path: esperado HTTP $expected, recibido $status" >&2
    exit 1
  fi
}

# Las credenciales de producción no se devuelven en JSON. Este helper extrae
# la cookie emitida por el servidor únicamente dentro del arnés temporal para
# seguir verificando los límites entre sesión de empresa y sesión de vendedor.
auth_cookie() {
  local method="$1" path="$2" expected="$3" body="$4" output="$5" token="$6" cookie_name="$7"
  local headers="$RUN_ROOT/headers.$RANDOM"
  local -a args=(--silent --show-error --request "$method" --output "$output" --dump-header "$headers" --write-out '%{http_code}')
  if [[ -n "$token" ]]; then args+=(--header "Authorization: Bearer $token"); fi
  if [[ -n "$body" ]]; then args+=(--header 'Content-Type: application/json' --data "$body"); fi
  local status
  status="$(curl "${args[@]}" "$BASE_URL$path")"
  if [[ "$status" != "$expected" ]]; then echo "FALLÓ $method $path: esperado HTTP $expected, recibido $status" >&2; exit 1; fi
  local value
  value="$(grep -i "^set-cookie: $cookie_name=" "$headers" | sed -E "s/^[Ss]et-[Cc]ookie: $cookie_name=([^;]*).*/\\1/" | tail -n 1)"
  if [[ -z "$value" ]]; then echo "No se emitió la cookie HttpOnly esperada: $cookie_name" >&2; exit 1; fi
  printf '%s' "$value"
}

json_field() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs')
const [file, path] = process.argv.slice(2)
const value = path.split('.').reduce((current, key) => current == null ? undefined : current[key], JSON.parse(fs.readFileSync(file, 'utf8')))
if (value == null) process.exit(1)
process.stdout.write(String(value))
NODE
}

assert_products_for_tenant() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!Array.isArray(rows) || !rows.some((row) => row.id === 'prod-a-order-it') || rows.some((row) => row.id === 'prod-b-it')) process.exit(1)
NODE
}

# Listado de invitaciones: la sembrada trae autor, estado y fechas, y nunca
# expone tokenHash ni token.
assert_invitation_list() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const seeded = Array.isArray(rows) ? rows.find((row) => row.id === 'invite-revoke-it') : null
if (!seeded || seeded.status !== 'PENDING' || seeded.inviterName !== 'Admin Test' || seeded.inviterId !== 'user-admin-it') process.exit(1)
if (!seeded.createdAt || !seeded.expiresAt || !seeded.email) process.exit(1)
if ('tokenHash' in seeded || 'token' in seeded) process.exit(1)
NODE
}

assert_invitation_revoked() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const revoked = Array.isArray(rows) ? rows.find((row) => row.id === 'invite-revoke-it') : null
if (!revoked || revoked.status !== 'REVOKED' || !revoked.revokedAt) process.exit(1)
NODE
}

# Historial del integrante: el cambio de rol quedó auditado en ambos sentidos y
# sin filtrar el hash del PIN.
assert_role_history() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const events = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).events
if (!Array.isArray(events)) process.exit(1)
const ida = events.find((event) => typeof event.detail === 'string' && event.detail.includes('Rol: Vendedor → Gerente'))
const vuelta = events.find((event) => typeof event.detail === 'string' && event.detail.includes('Rol: Gerente → Vendedor'))
if (!ida || !vuelta) process.exit(1)
if (events.some((event) => /pinHash/i.test(JSON.stringify(event)))) process.exit(1)
NODE
}

assert_login_tenant() {
  node - "$1" <<'NODE'
const fs = require('node:fs')
const tenant = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).tenant
const id = typeof tenant === 'string' ? tenant : tenant?.id ?? tenant?.slug
if (id !== 'tenant-a-it') process.exit(1)
NODE
}

assert_stock() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require('node:fs')
const [file, productId, expected] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
const row = rows.find((item) => item.id === productId)
if (!row || Number(row.stock) !== Number(expected)) process.exit(1)
NODE
}

assert_order_cost_snapshot() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require('node:fs')
const [file, orderNumber, expected] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
const order = rows.find((item) => item.orderNumber === orderNumber)
const item = order?.items?.[0]
if (!item || Number(item.unitCostPyg) !== Number(expected)) process.exit(1)
NODE
}

assert_product_cost() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require('node:fs')
const [file, productId, expected] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
const row = rows.find((item) => item.id === productId)
if (!row || Number(row.costPyg) !== Number(expected)) process.exit(1)
NODE
}

assert_pending_payment() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs')
const [file, orderNumber] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
const order = rows.find((item) => item.orderNumber === orderNumber)
if (!order || order.status !== 'PENDING' || !order.payments?.some((payment) => payment.status === 'PENDING') || order.payments.some((payment) => payment.status === 'CONFIRMED')) process.exit(1)
NODE
}

assert_confirmed_payment_total() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require('node:fs')
const [file, orderNumber, expected] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
const order = rows.find((item) => item.orderNumber === orderNumber)
const confirmed = order?.payments?.filter((payment) => payment.status === 'CONFIRMED') ?? []
const total = confirmed.reduce((sum, payment) => sum + Number(payment.amountPyg), 0)
if (!order || confirmed.length !== 1 || total !== Number(expected) || total > Number(order.totalPyg)) process.exit(1)
NODE
}

request_status() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local output="$4"
  local token="${5:-}"
  local tenant="${6:-}"
  local -a args=(--silent --show-error --request "$method" --output "$output" --write-out '%{http_code}')
  if [[ -n "$tenant" ]]; then args+=(--header "x-tenant-id: $tenant"); fi
  if [[ -n "$token" ]]; then args+=(--header "Authorization: Bearer $token"); fi
  if [[ -n "$body" ]]; then args+=(--header 'Content-Type: application/json' --data "$body"); fi
  curl "${args[@]}" "$BASE_URL$path"
}

echo "1/13 HTTP sin token devuelve 401..."
out="$(response_file)"; request GET /api/products 401 '' "$out" '' tenant-a-it
out="$(response_file)"; request GET /api/orders 401 '' "$out" '' tenant-a-it

echo "2/13 Login de empresa y companyToken sin acceso a datos..."
out="$(response_file)"; COMPANY_TOKEN_A="$(auth_cookie POST /api/auth/login 200 '{"email":"company-a-it@example.invalid","password":"company-password-it","deviceId":"device-a-it","branchId":"branch-a-it"}' "$out" '' mobos_company_session)"
assert_login_tenant "$out" || { echo "Login no devolvió el tenant esperado." >&2; exit 1; }
out="$(response_file)"; request GET /api/products 401 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request GET /api/orders 401 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request GET /api/auth/me 401 '' "$out" "$COMPANY_TOKEN_A" ''

echo "3/13 PIN bcrypt, vendedor ajeno y aislamiento por sesión..."
out="$(response_file)"; request POST /api/auth/pin 401 '{"sellerId":"user-b-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; TOKEN_A="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-a-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" mobos_seller_session)"
out="$(response_file)"; request GET /api/products 200 '' "$out" "$TOKEN_A" tenant-b-it
assert_products_for_tenant "$out" || { echo "El header de otra empresa alteró el tenant de la sesión." >&2; exit 1; }

echo "4/13 Orden fuerza seller autenticado..."
out="$(response_file)"
request POST /api/orders 201 '{"sellerId":"user-a-2-it","branchId":"branch-a-it","orderNumber":"IT-ORDER-001","items":[{"productId":"prod-a-order-it","description":"Synthetic Product A Order","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-b-it
if [[ "$(json_field "$out" sellerId)" != "user-a-it" || "$(json_field "$out" tenantId)" != "tenant-a-it" ]]; then
  echo "La orden no quedó forzada al vendedor/tenant de la sesión." >&2
  exit 1
fi
out="$(response_file)"; request GET /api/orders 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_order_cost_snapshot "$out" IT-ORDER-001 70000 || { echo "La venta no congeló el costo del producto." >&2; exit 1; }
out="$(response_file)"; request GET /api/products 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_product_cost "$out" prod-a-order-it 70000 || { echo "El costo del producto no se devolvió en el catálogo." >&2; exit 1; }
echo "4b/13 Costo del producto y foto del costo en la venta OK..."

echo "4c/13 Idempotencia de órdenes: misma clave reutiliza la orden sin descontar stock de nuevo..."
IDEM_KEY_A="it-order-idempotency-0001a"
IDEM_BODY='{"orderNumber":"IT-IDEM-001","items":[{"productId":"prod-a-order-it","description":"Synthetic Product A Idem","quantity":1,"unitPricePyg":100000}],"payment":{"method":"CASH","amountPyg":100000}}'
IDEM_BODY_B='{"orderNumber":"IT-IDEM-002","items":[{"productId":"prod-a-order-it","description":"Synthetic Product A Idem B","quantity":1,"unitPricePyg":100000}],"payment":{"method":"CASH","amountPyg":100000}}'
out="$(response_file)"; request_key POST /api/orders 201 "$IDEM_BODY" "$out" "$TOKEN_A" tenant-a-it "$IDEM_KEY_A"
IDEM_ORDER_ID="$(json_field "$out" id)"
out="$(response_file)"; request_key POST /api/orders 200 "$IDEM_BODY" "$out" "$TOKEN_A" tenant-a-it "$IDEM_KEY_A"
if [[ "$(json_field "$out" id)" != "$IDEM_ORDER_ID" ]]; then
  echo "La misma Idempotency-Key devolvió una orden distinta." >&2
  exit 1
fi
out="$(response_file)"; request_key POST /api/orders 201 "$IDEM_BODY_B" "$out" "$TOKEN_A" tenant-a-it "it-order-idempotency-0002b"
if [[ "$(json_field "$out" id)" == "$IDEM_ORDER_ID" ]]; then
  echo "Una Idempotency-Key distinta reutilizó la orden anterior." >&2
  exit 1
fi
out="$(response_file)"; request GET /api/stock 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_stock "$out" prod-a-order-it 7 || { echo "El replay idempotente descontó stock de nuevo." >&2; exit 1; }

echo "5/13 Orden de misma empresa en sucursal ajena se rechaza..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a2-it","orderNumber":"IT-CROSS-BRANCH-001","items":[{"productId":"prod-a-crossbranch-it","description":"Synthetic Product A Cross Branch","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it

echo "6/13 Stock insuficiente revierte toda la transacción..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a-it","orderNumber":"IT-ROLLBACK-001","items":[{"productId":"prod-a-rollback-it","description":"Synthetic Product A Rollback","quantity":3,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it
out="$(response_file)"; request GET /api/stock 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_stock "$out" prod-a-rollback-it 2 || { echo "El stock cambió a pesar del rollback." >&2; exit 1; }

echo "7/13 Sobrepago rechaza y revierte stock..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a-it","orderNumber":"IT-OVERPAY-001","items":[{"productId":"prod-a-overpay-it","description":"Synthetic Product A Overpay","quantity":1,"unitPricePyg":100000}],"payment":{"method":"CASH","amountPyg":100001}}' "$out" "$TOKEN_A" tenant-a-it
out="$(response_file)"; request GET /api/stock 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_stock "$out" prod-a-overpay-it 5 || { echo "El stock cambió después de rechazar el sobrepago." >&2; exit 1; }

echo "8/13 Pago pendiente no confirma la orden..."
out="$(response_file)"
request POST /api/orders 201 '{"orderNumber":"IT-PENDING-001","items":[{"productId":"prod-a-pending-it","description":"Synthetic Product A Pending","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it
PENDING_ORDER_ID="$(json_field "$out" id)"
out="$(response_file)"
request POST /api/payments 201 '{"orderId":"'"$PENDING_ORDER_ID"'","method":"CASH","amountPyg":40000,"status":"PENDING"}' "$out" "$TOKEN_A" tenant-a-it
PAYMENT_PROOF_ID="$(json_field "$out" id)"
node "$BACKEND_ROOT/tests/payment-proofs.mjs" "$BASE_URL" "$TOKEN_A" "$PAYMENT_PROOF_ID"
out="$(response_file)"; request GET /api/orders 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_pending_payment "$out" IT-PENDING-001 || { echo "El pago pendiente confirmó o alteró incorrectamente la orden." >&2; exit 1; }
node "$BACKEND_ROOT/tests/payment-retry.mjs" "$BASE_URL" "$TOKEN_A" "$PENDING_ORDER_ID"
echo "8b/13 Trazabilidad: usuario del pago, comprobantes del pedido y READY_TO_SHIP..."
node "$BACKEND_ROOT/tests/order-traceability.mjs" "$BASE_URL" "$TOKEN_A" "$PENDING_ORDER_ID" "$PAYMENT_PROOF_ID"

echo "9/13 Pagos concurrentes no permiten sobrepagar..."
out="$(response_file)"
request POST /api/orders 201 '{"orderNumber":"IT-CONCURRENT-001","items":[{"productId":"prod-a-concurrent-it","description":"Synthetic Product A Concurrent","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it
CONCURRENT_ORDER_ID="$(json_field "$out" id)"
payment_body='{"orderId":"'"$CONCURRENT_ORDER_ID"'","method":"TRANSFER","amountPyg":60000,"status":"CONFIRMED"}'
payment_a="$(response_file)"; payment_b="$(response_file)"
status_a="$(response_file)"; status_b="$(response_file)"
(request_status POST /api/payments "$payment_body" "$payment_a" "$TOKEN_A" tenant-a-it >"$status_a") & pid_a=$!
(request_status POST /api/payments "$payment_body" "$payment_b" "$TOKEN_A" tenant-a-it >"$status_b") & pid_b=$!
wait "$pid_a"; wait "$pid_b"
status_a_value="$(<"$status_a")"; status_b_value="$(<"$status_b")"
if ! { [[ "$status_a_value" == "201" && "$status_b_value" == "409" ]] || [[ "$status_a_value" == "409" && "$status_b_value" == "201" ]]; }; then
  echo "La concurrencia de pagos devolvió estados inesperados." >&2
  exit 1
fi
out="$(response_file)"; request GET /api/orders 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_confirmed_payment_total "$out" IT-CONCURRENT-001 60000 || { echo "Los pagos concurrentes superaron o duplicaron el total confirmado." >&2; exit 1; }

node "$BACKEND_ROOT/tests/new-modules.mjs" "$BASE_URL" "$TOKEN_A" "$COMPANY_TOKEN_A"
out="$(response_file)"; ADMIN_TOKEN="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-admin-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" mobos_seller_session)"
out="$(response_file)"; CAJERA_TOKEN="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-cajera-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" mobos_seller_session)"
out="$(response_file)"; GERENTE_TOKEN="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-gerente-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" mobos_seller_session)"
node "$BACKEND_ROOT/tests/print-bridge-http.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL"
# Auditoría central: rastro de impresoras, catálogo y promociones, búsqueda por
# metadato, filtros de fecha/actor y exportación CSV con los mismos filtros.
MOBOS_TEST_PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/audit.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL"
out="$(response_file)"; request PATCH /api/products 200 '{"id":"prod-a-rollback-it","costPyg":55000}' "$out" "$ADMIN_TOKEN" ''
if [[ "$(json_field "$out" costPyg)" != "55000" ]]; then echo "PATCH no guardó el costo del producto." >&2; exit 1; fi
out="$(response_file)"; request PATCH /api/products 400 '{"id":"prod-a-rollback-it","costPyg":-1}' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"; request PATCH /api/products 200 '{"id":"prod-a-rollback-it","costPyg":null}' "$out" "$ADMIN_TOKEN" ''
node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!("costPyg" in p)||p.costPyg!==null)process.exit(1)' "$out" || { echo "PATCH no permitió limpiar el costo." >&2; exit 1; }
out="$(response_file)"; request POST /api/orders 201 '{"orderNumber":"ADMIN-PRIVATE","items":[{"productId":"prod-a-order-it","description":"Private admin test","quantity":1,"unitPricePyg":100000}],"payment":{"method":"CASH","amountPyg":1000}}' "$out" "$ADMIN_TOKEN" ''
PRIVATE_ORDER_ID="$(json_field "$out" id)"
PRIVATE_PAYMENT_ID="$(node -e 'const fs=require("fs");console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).payments[0].id)' "$out")"
SELLER_PRIVACY_SELLER_ID="user-a-it" SELLER_PRIVACY_OTHER_ORDER_ID="$PRIVATE_ORDER_ID" SELLER_PRIVACY_OTHER_PAYMENT_ID="$PRIVATE_PAYMENT_ID" node "$BACKEND_ROOT/tests/seller-privacy.mjs" "$BASE_URL" "$TOKEN_A" "$COMPANY_TOKEN_A" "$ADMIN_TOKEN"
node "$BACKEND_ROOT/tests/new-modules-functional.mjs" "$BASE_URL" "$ADMIN_TOKEN"
node "$BACKEND_ROOT/tests/finance-consolidated.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL" "$PG_BIN"
# Segunda corrida: sin re-siembra, la cuota RUC agotada sigue devolviendo 429
# porque vive en AuthAttempt de la base, no en memoria del proceso.
node "$BACKEND_ROOT/tests/finance-consolidated.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL" "$PG_BIN"
node "$BACKEND_ROOT/tests/accounts-tradein.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$COMPANY_TOKEN_A"
node "$BACKEND_ROOT/tests/inventory-transfers.mjs" "$BASE_URL" "$ADMIN_TOKEN"
node "$BACKEND_ROOT/tests/unit-repairs.mjs" "$BASE_URL" "$ADMIN_TOKEN"
node "$BACKEND_ROOT/tests/public-quote-transfer.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL" "$PG_BIN"
node "$BACKEND_ROOT/tests/customer-portal.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$CAJERA_TOKEN" "$DATABASE_URL" "$PG_BIN"
MOBOS_TEST_PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/orders-credit-discounts.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL"
node "$BACKEND_ROOT/tests/mobos-1.2.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
node "$BACKEND_ROOT/tests/price-lists.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
echo "Combos: la línea del pedido recuerda el combo (validación por empresa)..."
node "$BACKEND_ROOT/tests/order-combos.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
echo "Fidelización: la venta acredita puntos (ACCRUAL) y con 0 no acredita..."
node "$BACKEND_ROOT/tests/order-loyalty.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
echo "POS offline: venta sincronizada con stock laxo, marca e idempotencia..."
node "$BACKEND_ROOT/tests/order-offline.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
echo "Entrega separada del pago: estados por tipo, transiciones y reparto..."
node "$BACKEND_ROOT/tests/order-fulfillment.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
echo "Seguridad pública del pedido: token hasheado, rotación y rate limit (#172/#178)..."
node "$BACKEND_ROOT/tests/orders-public-security.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL" "$PG_BIN"
out="$(response_file)"; COMPANY_TOKEN_C="$(auth_cookie POST /api/auth/login 200 '{"email":"company-c-it@example.invalid","password":"company-password-it","deviceId":"device-c-it"}' "$out" '' mobos_company_session)"
out="$(response_file)"; ADMIN_TOKEN_C="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-c-admin-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_C" mobos_seller_session)"
node "$BACKEND_ROOT/tests/store-branch.mjs" "$BASE_URL" "$ADMIN_TOKEN_C"
node "$BACKEND_ROOT/tests/payment-account-defaults.mjs" "$BASE_URL" "$ADMIN_TOKEN_C"
node "$BACKEND_ROOT/tests/account-parties.mjs" "$BASE_URL" "$ADMIN_TOKEN_C"
node "$BACKEND_ROOT/tests/seller-pin.mjs" "$BASE_URL" "$COMPANY_TOKEN_A"
node "$BACKEND_ROOT/tests/cookie-session.mjs" "$BASE_URL" "$ADMIN_TOKEN"
node "$BACKEND_ROOT/tests/mi-cuenta.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$COMPANY_TOKEN_A"
MOBOS_MAINTENANCE_TOKEN="it-maintenance-token" node "$BACKEND_ROOT/tests/email-events.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"
MOBOS_TEST_PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/collections-marketing.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL"
MOBOS_TEST_PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/payment-installments.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"
echo "Conciliación por cuenta/procesadora: lote recibido vs esperado, diferencia y trazabilidad..."
node "$BACKEND_ROOT/tests/reconciliation-http.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
node "$BACKEND_ROOT/tests/purchases-suppliers.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
node "$BACKEND_ROOT/tests/attachments.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL" "$PG_BIN"
node "$BACKEND_ROOT/tests/history-timelines.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$COMPANY_TOKEN_A"
echo "Seguimiento del informe compartido: envío, visto/no visto y apertura desde el portal..."
node "$BACKEND_ROOT/tests/device-report-tracking.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL" "$PG_BIN"
echo "Taller para el cliente: ficha, cronología y portal..."
node "$BACKEND_ROOT/tests/customer-service.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
out="$(response_file)"; CHECKOUT_COMPANY_B="$(auth_cookie POST /api/auth/login 200 '{"email":"company-b-it@example.invalid","password":"company-password-it","deviceId":"checkout-b-it","branchId":"branch-b-it"}' "$out" '' mobos_company_session)"
out="$(response_file)"; CHECKOUT_SELLER_B="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-b-it","pin":"2468"}' "$out" "$CHECKOUT_COMPANY_B" mobos_seller_session)"
MOBOS_IT_EXECUTE=1 node "$BACKEND_ROOT/tests/checkout-customer.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$COMPANY_TOKEN_A" "$CHECKOUT_SELLER_B"
node "$BACKEND_ROOT/tests/invitation-app.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$CHECKOUT_SELLER_B"
MOBOS_SECURITY_PAYMENT_ID="$PAYMENT_PROOF_ID" node "$BACKEND_ROOT/tests/security-regression.mjs" "$BASE_URL" "$TOKEN_A" "$COMPANY_TOKEN_A"
node "$BACKEND_ROOT/tests/authorization-limits.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$CAJERA_TOKEN" "$GERENTE_TOKEN"
node "$BACKEND_ROOT/tests/price-lists.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Campañas de recompra: segmentos, permisos, consentimiento y marca de contacto..."
node "$BACKEND_ROOT/tests/customer-segments.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Índices pg_trgm: aplicados y medición antes/después..."
node "$BACKEND_ROOT/tests/pg-trgm.mjs" "$DATABASE_URL" "$PG_BIN"

echo "Auditoría: búsqueda en metadatos (IMEI, jobId) y filtros de actor/fecha..."
node "$BACKEND_ROOT/tests/audit-http.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$DATABASE_URL"
echo "Delivery propio: asignar → cobrar → rendir → verificar, con permisos y auditoría..."
out="$(response_file)"; REPARTIDOR_TOKEN="$(auth_cookie POST /api/auth/pin 200 '{"sellerId":"user-repartidor-it","pin":"8642"}' "$out" "$COMPANY_TOKEN_A" mobos_seller_session)"
node "$BACKEND_ROOT/tests/delivery.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A" "$CAJERA_TOKEN" "$GERENTE_TOKEN" "$REPARTIDOR_TOKEN"

echo "Reportes por producto, categoría, vendedor y día..."
REPORTS_TO="$(node -e 'process.stdout.write(new Date().toISOString().slice(0,10))')"
REPORTS_FROM="$(node -e 'process.stdout.write(new Date(Date.now() - 29 * 86400000).toISOString().slice(0,10))')"
out="$(response_file)"; request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=product" 401 '' "$out" '' tenant-a-it
out="$(response_file)"; request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=product" 403 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request GET "/api/reports?from=$REPORTS_TO&to=$REPORTS_FROM" 400 '' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"; request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=inexistente" 400 '' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"; request GET "/api/reports?from=2026-02-30&to=$REPORTS_TO" 400 '' "$out" "$ADMIN_TOKEN" ''
REPORTS_ORDERS="$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT COUNT(*) FROM \"Order\" WHERE \"tenantId\" = 'tenant-a-it' AND \"status\" <> 'CANCELLED';")"
REPORTS_TOTAL="$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT COALESCE(SUM(\"totalPyg\"), 0) FROM \"Order\" WHERE \"tenantId\" = 'tenant-a-it' AND \"status\" <> 'CANCELLED';")"
for reports_group in product category seller day; do
  out="$(response_file)"
  request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=$reports_group" 200 '' "$out" "$ADMIN_TOKEN" ''
  node "$BACKEND_ROOT/tests/reports-http.mjs" "$out" "$REPORTS_TOTAL" "$REPORTS_ORDERS" "$reports_group"
done
out="$(response_file)"
request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=product&branchId=branch-b-it" 404 '' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"
request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=product&branchId=branch-a-it" 200 '' "$out" "$ADMIN_TOKEN" ''
node "$BACKEND_ROOT/tests/reports-http.mjs" "$out" "$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT COALESCE(SUM(\"totalPyg\"), 0) FROM \"Order\" WHERE \"tenantId\" = 'tenant-a-it' AND \"branchId\" = 'branch-a-it' AND \"status\" <> 'CANCELLED';")" "$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT COUNT(*) FROM \"Order\" WHERE \"tenantId\" = 'tenant-a-it' AND \"branchId\" = 'branch-a-it' AND \"status\" <> 'CANCELLED';")" product

echo "Indicadores unificados: pagos por procesadora, curva ABC y stock valorizado..."
out="$(response_file)"
request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=payments&paymentsBy=processor" 200 '' "$out" "$ADMIN_TOKEN" ''
REPORTS_PAGOS="$out"
out="$(response_file)"
request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=product" 200 '' "$out" "$ADMIN_TOKEN" ''
node "$BACKEND_ROOT/tests/reports-indicadores.mjs" "$REPORTS_PAGOS" "$out"
out="$(response_file)"
request GET "/api/reports?from=$REPORTS_FROM&to=$REPORTS_TO&groupBy=payments&paymentsBy=inventado" 400 '' "$out" "$ADMIN_TOKEN" ''

echo "Exportaciones CSV por módulo (cabeceras, BOM y alcance por rol)..."
node "$BACKEND_ROOT/tests/exports.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"
EXPORTS_AUDIT="$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT COUNT(*) FROM \"AuditLog\" WHERE \"action\" = 'DATA_EXPORTED' AND \"entity\" = 'customers';")"
if [[ "$EXPORTS_AUDIT" -lt 1 ]]; then
  echo "La exportación de clientes no dejó la auditoría DATA_EXPORTED." >&2
  exit 1
fi

echo "Invitaciones y equipo: listado, 409 con salida, reenvío, revocación, rol e historial..."
# Listado visible con autor, estado y fechas (invitación sembrada por SQL).
out="$(response_file)"; request GET /api/user-invitations 200 '' "$out" "$ADMIN_TOKEN" ''
assert_invitation_list "$out" || { echo "El listado de invitaciones no trae autor, estado o fechas." >&2; exit 1; }
# Alta nueva: devuelve autor y fechas serializadas.
out="$(response_file)"; request POST /api/user-invitations 201 '{"name":"Listado E2E","email":"listado-it@example.invalid","role":"VENDEDOR"}' "$out" "$ADMIN_TOKEN" ''
INVITE_LISTADO_ID="$(json_field "$out" id)"
if [[ -z "$INVITE_LISTADO_ID" || "$(json_field "$out" inviterName)" != "Admin Test" || -z "$(json_field "$out" createdAt)" ]]; then
  echo "El alta de invitación no devolvió identificador, autor o fecha." >&2
  exit 1
fi
# 409 con salida: el conflicto devuelve la invitación activa existente.
out="$(response_file)"; request POST /api/user-invitations 409 '{"name":"Listado E2E","email":"listado-it@example.invalid","role":"VENDEDOR"}' "$out" "$ADMIN_TOKEN" ''
if [[ "$(json_field "$out" details.invitation.id)" != "$INVITE_LISTADO_ID" || "$(json_field "$out" details.invitation.status)" != "PENDING" ]]; then
  echo "El 409 no devolvió la invitación activa existente." >&2
  exit 1
fi
# Reenvío con el correo ya entregado: respeta el enfriamiento (429).
"$PG_BIN/psql" "$DATABASE_URL" -At -c "UPDATE \"EmailOutbox\" SET \"sentAt\" = CURRENT_TIMESTAMP, \"payload\" = '', \"recipient\" = '' WHERE \"aggregateType\" = 'UserInvitation' AND \"aggregateId\" = '$INVITE_LISTADO_ID' AND \"sentAt\" IS NULL;" >/dev/null
out="$(response_file)"; request POST "/api/user-invitations/$INVITE_LISTADO_ID/resend" 429 '' "$out" "$ADMIN_TOKEN" ''
if [[ "$(json_field "$out" details.retryAfterSeconds)" -le 0 ]]; then
  echo "El reenvío en enfriamiento no devolvió retryAfterSeconds." >&2
  exit 1
fi
# Vencido el enfriamiento, el reenvío regenera el enlace de la misma invitación.
"$PG_BIN/psql" "$DATABASE_URL" -At -c "UPDATE \"UserInvitation\" SET \"resendAvailableAt\" = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE \"id\" = '$INVITE_LISTADO_ID';" >/dev/null
out="$(response_file)"; request POST "/api/user-invitations/$INVITE_LISTADO_ID/resend" 200 '' "$out" "$ADMIN_TOKEN" ''
if [[ "$(json_field "$out" id)" != "$INVITE_LISTADO_ID" ]]; then
  echo "El reenvío no devolvió la misma invitación." >&2
  exit 1
fi
# Revocación: la invitación deja de estar disponible y queda REVOKED en el listado.
out="$(response_file)"; request POST /api/user-invitations/invite-revoke-it/revoke 200 '' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"; request GET /api/user-invitations 200 '' "$out" "$ADMIN_TOKEN" ''
assert_invitation_revoked "$out" || { echo "La invitación revocada no figura como REVOKED." >&2; exit 1; }
out="$(response_file)"; request POST /api/user-invitations/invite-revoke-it/revoke 404 '' "$out" "$ADMIN_TOKEN" ''
# Cambio de rol desde la ficha: PATCH /api/users lo aplica y lo audita.
out="$(response_file)"; request PATCH /api/users 200 '{"id":"user-a-2-it","role":"GERENTE"}' "$out" "$ADMIN_TOKEN" ''
if [[ "$(json_field "$out" role)" != "GERENTE" || "$(json_field "$out" hasAvatar)" != "false" ]]; then
  echo "PATCH /api/users no cambió el rol o no expone hasAvatar." >&2
  exit 1
fi
out="$(response_file)"; request PATCH /api/users 200 '{"id":"user-a-2-it","role":"VENDEDOR"}' "$out" "$ADMIN_TOKEN" ''
out="$(response_file)"; request GET /api/users/user-a-2-it/history 200 '' "$out" "$ADMIN_TOKEN" ''
assert_role_history "$out" || { echo "El historial no registró el cambio de rol." >&2; exit 1; }
out="$(response_file)"; request GET /api/users/user-a-2-it/history 403 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request GET /api/user-invitations 403 '' "$out" "$TOKEN_A" ''

echo "10/13 Límite de reportes de error por IP: 429 con Retry-After..."
# MOBOS_TRUST_PROXY=true habilita la resolución de IP desde x-forwarded-for
# (como en producción detrás del Hub). Solo estas solicitudes envían el
# encabezado, de modo que los demás tests siguen sin límite por IP.
ERRORS_HEADERS="$(response_file)"
errors_last=""
for _ in $(seq 1 31); do
  errors_last="$(curl --silent --show-error --request POST --output /dev/null --dump-header "$ERRORS_HEADERS" --write-out '%{http_code}' --header 'Content-Type: application/json' --header 'x-forwarded-for: 198.51.100.10' --data '{"message":"synthetic rate limit check","url":"/api/errors","kind":"unhandled"}' "$BASE_URL/api/errors")"
done
if [[ "$errors_last" != "429" ]] || ! grep -qi '^retry-after:' "$ERRORS_HEADERS" || ! grep -qi '^x-request-id:' "$ERRORS_HEADERS"; then
  echo "El límite de /api/errors no devolvió 429 con Retry-After y X-Request-Id (último estado: $errors_last)." >&2
  exit 1
fi
out="$(response_file)"; request GET /api/errors 200 '' "$out" "$ADMIN_TOKEN" ''
node - "$out" <<'NODE'
const fs = require('node:fs')
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const posted = rows.filter((row) => row.message === 'synthetic rate limit check')
const requestIdOk = posted.every((row) => /^[A-Za-z0-9-]{8,64}$/.test(String(row.requestId)))
if (!Array.isArray(rows) || posted.length < 30 || rows.some((row) => 'stack' in row) || !requestIdOk) process.exit(1)
NODE
if [[ "$?" != "0" ]]; then echo "GET /api/errors no listó los reportes sin stack y con requestId del middleware." >&2; exit 1; fi

echo "11/13 Restauración de backup en cluster nuevo..."
node "$BACKEND_ROOT/tests/backup-restore.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$PG_BIN" "$DATABASE_URL" "$RUN_ROOT/backups"

echo "Centro de Abastecimiento F1: necesidades manuales y consolidación «Por comprar» (#250)..."
node "$BACKEND_ROOT/tests/supply-needs.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento F2: compra rápida, IMEI y stock adicional (#250)..."
node "$BACKEND_ROOT/tests/supply-purchases.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento F3: IMEI y preparación (escaneo, lote y etiquetas) (#250)..."
node "$BACKEND_ROOT/tests/supply-preparation.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento F4: lotes, tránsito y manifiesto (#250)..."
node "$BACKEND_ROOT/tests/supply-shipments.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento F5: recepción del lote (QR, escaneo y stock) (#250)..."
node "$BACKEND_ROOT/tests/supply-receptions.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento F6: automatización (reposición, proveedores, atrasos y AEX) (#250)..."
node "$BACKEND_ROOT/tests/supply-automation.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "Centro de Abastecimiento: repuestos del taller con tenencia y pago (#250)..."
node "$BACKEND_ROOT/tests/supply-workshop-parts.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$TOKEN_A"

echo "12/13 Bloqueo de login empresarial después de cinco intentos..."
out="$(response_file)"; request POST /api/auth/pin 200 '{"sellerId":"user-lock-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''
for _ in 1 2 3 4 5; do
  out="$(response_file)"; request POST /api/auth/login 401 '{"email":"company-a-it@example.invalid","password":"wrong-company-password","deviceId":"device-lock-it"}' "$out" '' ''
done
lock_state="$("$PG_BIN/psql" "$DATABASE_URL" -At -c "SELECT \"failedLoginAttempts\"::text || ':' || CASE WHEN \"lockedUntil\" IS NULL THEN 'missing' ELSE 'set' END FROM \"Tenant\" WHERE \"email\" = 'company-a-it@example.invalid';")"
if [[ "$lock_state" != "5:set" ]]; then
  echo "El login empresarial no dejó failedLoginAttempts=5 y lockedUntil establecido." >&2
  exit 1
fi
out="$(response_file)"; request POST /api/auth/login 401 '{"email":"company-a-it@example.invalid","password":"company-password-it","deviceId":"device-lock-it"}' "$out" '' ''

echo "13/13 Logout invalida companyToken y accessToken..."
out="$(response_file)"; request POST /api/auth/logout 200 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request GET /api/products 401 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request POST /api/auth/logout 200 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request POST /api/auth/pin 401 '{"sellerId":"user-a-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''

node "$BACKEND_ROOT/tests/stock-consistency.mjs"

echo "Ciclo de vida de la empresa: archivar, reactivar y eliminar definitivamente..."
node "$BACKEND_ROOT/tests/account-lifecycle.mjs" "$BASE_URL" "$DATABASE_URL"

echo "Consistencia financiera: la base del arnés da verde y los casos sembrados fallan..."
(cd "$BACKEND_ROOT" && node tests/consistency-check.mjs) || {
  echo "El chequeo de consistencia encontró inconsistencias reales en una base consistente." >&2
  exit 1
}
(cd "$BACKEND_ROOT" && node tests/consistency-selftest.mjs) || {
  echo "El autotest de consistencia falló: una inconsistencia sembrada no introdujo el fallo o --fix no recompuso." >&2
  exit 1
}
(cd "$BACKEND_ROOT" && node tests/consistency-check.mjs) || {
  echo "El chequeo de consistencia no volvió a dar verde tras la limpieza del autotest." >&2
  exit 1
}
echo "Corte por sesión de caja: efectivo, pedidos y diferencia (#148 §18)..."
node "$BACKEND_ROOT/tests/cash-sessions.mjs" "$BASE_URL" "$ADMIN_TOKEN"

echo "Día operativo de la auditoría de caja en UTC-3 (#148 §17)..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/cash-audit-dia.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"

echo "Trade-in publicado: costo del equipo (valor + reparaciones) y seguro en el margen (#148 §19)..."
node "$BACKEND_ROOT/tests/trade-in-cost.mjs" "$BASE_URL" "$ADMIN_TOKEN"

echo "Venta por IMEI: costo real de la unidad (reparaciones/repuestos) y seguro (#148 §19)..."
node "$BACKEND_ROOT/tests/unit-cost-margin.mjs" "$BASE_URL" "$ADMIN_TOKEN"

echo "Reportes con costo real por unidad y comisiones al día (#148 §19)..."
node "$BACKEND_ROOT/tests/reports-costos-comisiones.mjs" "$BASE_URL" "$ADMIN_TOKEN"

echo "Verificación independiente: reportes y comisiones recalculados contra la base (#148 §19)..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/reports-margen-db.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL" "$REPORTS_FROM" "$REPORTS_TO"

echo "Cadena de costo real (repuestos/inspección → margen/seguro) sobre una unidad vendida (#249 §19)..."
MOBOS_QA_API_URL="$BASE_URL" MOBOS_QA_TOKEN="$ADMIN_TOKEN" MOBOS_QA_SEMBRAR=1 MOBOS_QA_OUT="$RUN_ROOT/costo-real" node "$REPO_ROOT/scripts/qa-249-costo-real-produccion.mjs"

echo "Seguridad pública: token de liquidaciones hasheado, rotación y límite de uso..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/commission-settlement-public.mjs"

echo "Créditos: la lista se corta y los totales incluyen a todos los deudores (#83)..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/credits-totales.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"

echo "KPI de finanzas: por cobrar, por pagar y margen sobre todo el historial (#83)..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/finance-totales.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"

echo "Repuestos a crédito: cuenta a pagar al proveedor con condición y consumo (#250 · #83)..."
PG_BIN="$PG_BIN" node "$BACKEND_ROOT/tests/supplier-payables-http.mjs" "$BASE_URL" "$ADMIN_TOKEN" "$DATABASE_URL"

echo "PASS: aislamiento, niveles de token, PIN/lockout, seller forzado, sucursales, rollback, pagos, rate limit de errores, backup/restauración, consistencia, abastecimiento (necesidades, compras, preparación y lotes), repuestos a crédito y logout."
