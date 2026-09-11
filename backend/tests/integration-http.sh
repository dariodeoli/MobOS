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

for binary in initdb pg_ctl createdb psql; do
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
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-h 127.0.0.1 -p $PGPORT" -w start >/dev/null
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres "$DB_NAME"

export DATABASE_URL
(cd "$BACKEND_ROOT" && ./node_modules/.bin/prisma db push --schema prisma/schema.prisma >/dev/null)
(cd "$BACKEND_ROOT" && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma >/dev/null)

PIN_HASH="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('2468', 10))")"
PASSWORD_HASH="$(cd "$BACKEND_ROOT" && node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('company-password-it', 10))")"

"$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pin_hash="$PIN_HASH" -v password_hash="$PASSWORD_HASH" >/dev/null <<'SQL'
INSERT INTO "Tenant" ("id", "name", "slug", "email", "passwordHash", "updatedAt") VALUES
  ('tenant-a-it', 'Tenant A Integration', 'tenant-a-it', 'company-a-it@example.invalid', :'password_hash', CURRENT_TIMESTAMP),
  ('tenant-b-it', 'Tenant B Integration', 'tenant-b-it', 'company-b-it@example.invalid', :'password_hash', CURRENT_TIMESTAMP);

INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt") VALUES
  ('branch-a-it', 'tenant-a-it', 'Sucursal A', CURRENT_TIMESTAMP),
  ('branch-a2-it', 'tenant-a-it', 'Sucursal A2', CURRENT_TIMESTAMP),
  ('branch-b-it', 'tenant-b-it', 'Sucursal B', CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "tenantId", "branchId", "name", "email", "pinHash", "role", "status", "updatedAt") VALUES
  ('user-a-it', 'tenant-a-it', 'branch-a-it', 'Seller A', 'seller-a-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-a-2-it', 'tenant-a-it', 'branch-a-it', 'Seller A Two', 'seller-a-2-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-lock-it', 'tenant-a-it', 'branch-a-it', 'Seller Lock', 'seller-lock-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP),
  ('user-b-it', 'tenant-b-it', 'branch-b-it', 'Seller B', 'seller-b-it@example.invalid', :'pin_hash', 'VENDEDOR', 'ACTIVE', CURRENT_TIMESTAMP);

INSERT INTO "Product" ("id", "tenantId", "branchId", "sku", "name", "category", "pricePyg", "stock", "isActive", "updatedAt") VALUES
  ('prod-a-order-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-ORDER-IT', 'Synthetic Product A Order', 'Test', 100000, 10, true, CURRENT_TIMESTAMP),
  ('prod-a-rollback-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-ROLLBACK-IT', 'Synthetic Product A Rollback', 'Test', 100000, 2, true, CURRENT_TIMESTAMP),
  ('prod-a-overpay-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-OVERPAY-IT', 'Synthetic Product A Overpay', 'Test', 100000, 5, true, CURRENT_TIMESTAMP),
  ('prod-a-pending-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-PENDING-IT', 'Synthetic Product A Pending', 'Test', 100000, 3, true, CURRENT_TIMESTAMP),
  ('prod-a-concurrent-it', 'tenant-a-it', 'branch-a-it', 'SKU-A-CONCURRENT-IT', 'Synthetic Product A Concurrent', 'Test', 100000, 3, true, CURRENT_TIMESTAMP),
  ('prod-a-crossbranch-it', 'tenant-a-it', 'branch-a2-it', 'SKU-A-CROSSBRANCH-IT', 'Synthetic Product A Cross Branch', 'Test', 100000, 2, true, CURRENT_TIMESTAMP),
  ('prod-b-it', 'tenant-b-it', 'branch-b-it', 'SKU-B-IT', 'Synthetic Product B', 'Test', 100000, 7, true, CURRENT_TIMESTAMP);
SQL

(
  cd "$BACKEND_ROOT"
  NODE_ENV=test DATABASE_URL="$DATABASE_URL" "$BACKEND_ROOT/node_modules/.bin/next" start -H 127.0.0.1 -p "$API_PORT" >"$SERVER_LOG" 2>&1
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

echo "1/11 HTTP sin token devuelve 401..."
out="$(response_file)"; request GET /api/products 401 '' "$out" '' tenant-a-it
out="$(response_file)"; request GET /api/orders 401 '' "$out" '' tenant-a-it

echo "2/11 Login de empresa y companyToken sin acceso a datos..."
out="$(response_file)"; request POST /api/auth/login 200 '{"email":"company-a-it@example.invalid","password":"company-password-it","deviceId":"device-a-it","branchId":"branch-a-it"}' "$out" '' ''
COMPANY_TOKEN_A="$(json_field "$out" companyToken)"
if [[ -z "$COMPANY_TOKEN_A" ]]; then echo "Login de empresa no devolvió companyToken." >&2; exit 1; fi
assert_login_tenant "$out" || { echo "Login no devolvió el tenant esperado." >&2; exit 1; }
out="$(response_file)"; request GET /api/products 401 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request GET /api/orders 401 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request GET /api/auth/me 401 '' "$out" "$COMPANY_TOKEN_A" ''

echo "3/11 PIN bcrypt, vendedor ajeno y aislamiento por sesión..."
out="$(response_file)"; request POST /api/auth/pin 401 '{"sellerId":"user-b-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request POST /api/auth/pin 200 '{"sellerId":"user-a-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''
TOKEN_A="$(json_field "$out" accessToken)"
if [[ -z "$TOKEN_A" ]]; then echo "Login PIN no devolvió accessToken." >&2; exit 1; fi
out="$(response_file)"; request GET /api/products 200 '' "$out" "$TOKEN_A" tenant-b-it
assert_products_for_tenant "$out" || { echo "El header de otra empresa alteró el tenant de la sesión." >&2; exit 1; }

echo "4/11 Orden fuerza seller autenticado..."
out="$(response_file)"
request POST /api/orders 201 '{"sellerId":"user-a-2-it","branchId":"branch-a-it","orderNumber":"IT-ORDER-001","items":[{"productId":"prod-a-order-it","description":"Synthetic Product A Order","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-b-it
if [[ "$(json_field "$out" sellerId)" != "user-a-it" || "$(json_field "$out" tenantId)" != "tenant-a-it" ]]; then
  echo "La orden no quedó forzada al vendedor/tenant de la sesión." >&2
  exit 1
fi

echo "5/11 Orden de misma empresa en sucursal ajena se rechaza..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a2-it","orderNumber":"IT-CROSS-BRANCH-001","items":[{"productId":"prod-a-crossbranch-it","description":"Synthetic Product A Cross Branch","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it

echo "6/11 Stock insuficiente revierte toda la transacción..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a-it","orderNumber":"IT-ROLLBACK-001","items":[{"productId":"prod-a-rollback-it","description":"Synthetic Product A Rollback","quantity":3,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it
out="$(response_file)"; request GET /api/stock 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_stock "$out" prod-a-rollback-it 2 || { echo "El stock cambió a pesar del rollback." >&2; exit 1; }

echo "7/11 Sobrepago rechaza y revierte stock..."
out="$(response_file)"
request POST /api/orders 409 '{"sellerId":"user-a-it","branchId":"branch-a-it","orderNumber":"IT-OVERPAY-001","items":[{"productId":"prod-a-overpay-it","description":"Synthetic Product A Overpay","quantity":1,"unitPricePyg":100000}],"payment":{"method":"CASH","amountPyg":100001}}' "$out" "$TOKEN_A" tenant-a-it
out="$(response_file)"; request GET /api/stock 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_stock "$out" prod-a-overpay-it 5 || { echo "El stock cambió después de rechazar el sobrepago." >&2; exit 1; }

echo "8/11 Pago pendiente no confirma la orden..."
out="$(response_file)"
request POST /api/orders 201 '{"orderNumber":"IT-PENDING-001","items":[{"productId":"prod-a-pending-it","description":"Synthetic Product A Pending","quantity":1,"unitPricePyg":100000}]}' "$out" "$TOKEN_A" tenant-a-it
PENDING_ORDER_ID="$(json_field "$out" id)"
out="$(response_file)"
request POST /api/payments 201 '{"orderId":"'"$PENDING_ORDER_ID"'","method":"CASH","amountPyg":40000,"status":"PENDING"}' "$out" "$TOKEN_A" tenant-a-it
out="$(response_file)"; request GET /api/orders 200 '' "$out" "$TOKEN_A" tenant-a-it
assert_pending_payment "$out" IT-PENDING-001 || { echo "El pago pendiente confirmó o alteró incorrectamente la orden." >&2; exit 1; }

echo "9/11 Pagos concurrentes no permiten sobrepagar..."
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

echo "10/11 Bloqueo de login empresarial después de cinco intentos..."
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

echo "11/11 Logout invalida companyToken y accessToken..."
out="$(response_file)"; request POST /api/auth/logout 200 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request GET /api/products 401 '' "$out" "$TOKEN_A" ''
out="$(response_file)"; request POST /api/auth/logout 200 '' "$out" "$COMPANY_TOKEN_A" ''
out="$(response_file)"; request POST /api/auth/pin 401 '{"sellerId":"user-a-it","pin":"2468"}' "$out" "$COMPANY_TOKEN_A" ''

echo "PASS: aislamiento, niveles de token, PIN/lockout, seller forzado, sucursales, rollback, pagos y logout."
