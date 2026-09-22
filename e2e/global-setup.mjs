// Phase 1 QA global setup.
//
// Seeds one tenant with real API calls (register → onboarding → admin PIN →
// sellers → products → one order with a public tracking token) against the
// backend that Playwright already booted at http://localhost:3001, then
// persists two storageState files (seller and admin sessions) for the specs.
//
// Idempotency: a marker file (e2e/.auth/.seeded) short-circuits the seed.
//
// Note on cookies vs Bearer: the backend ties cookie authentication to the
// app origin (sameOrigin() compares the Origin header with MOBOS_APP_URL),
// so a raw request context from Playwright cannot use cookies here. The
// backend accepts the same session tokens via `Authorization: Bearer`,
// which is origin-independent; we extract the cookie values from Set-Cookie
// and re-inject them into storageState files as localhost cookies.

import { chromium, request as pwRequest } from '@playwright/test'
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { existsSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED } from './helpers/seed-data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '.auth')
const MARKER = path.join(AUTH_DIR, '.seeded')
const SEED_ORDER_FILE = path.join(AUTH_DIR, 'seed-order.json')
const SELLER_STATE = path.join(AUTH_DIR, 'seller.json')
const ADMIN_STATE = path.join(AUTH_DIR, 'admin.json')
const PG_BIN = '/opt/homebrew/bin'
// Snapshot post-seed: restaurar es cuestión de segundos contra 5-20 minutos de
// sembrar de nuevo cuando una corrida falla a mitad. Se invalida solo cuando
// cambian las migraciones (la base tiene que reflejar el esquema nuevo).
const PG_PORT = () => process.env.MOBOS_E2E_PGPORT || '5439'
const PG_DB = () => process.env.MOBOS_E2E_DB || 'mobos_e2e'
const SNAPSHOT = () => `/tmp/mobos-e2e-snapshot-${PG_DB()}.dump`
const SNAPSHOT_META = () => `/tmp/mobos-e2e-snapshot-${PG_DB()}.json`
const API = SEED.api

const bearer = (token) => ({ Authorization: `Bearer ${token}` })

function cookieValue(setCookie, name) {
  const rows = Array.isArray(setCookie) ? setCookie : []
  for (const row of rows) {
    const match = String(row).match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    if (match) return match[1]
  }
  return null
}

async function registerOrLogin(ctx) {
  const reg = await ctx.post('/api/auth/register', {
    data: { companyName: SEED.company.name, email: SEED.company.email, password: SEED.company.password, deviceId: SEED.company.deviceId },
  })
  const headers = await reg.headersArray()
  const companyToken = cookieValue(headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value), 'mobos_company_session')
  if (reg.ok()) {
    return { token: companyToken, sellers: (await reg.json()).sellers || [] }
  }
  if (reg.status() === 409) {
    return loginCompany(ctx)
  }
  throw new Error(`register failed: HTTP ${reg.status()} ${await reg.text()}`)
}

async function loginCompany(ctx) {
  const res = await ctx.post('/api/auth/login', {
    data: { email: SEED.company.email, password: SEED.company.password, deviceId: SEED.company.deviceId },
  })
  if (!res.ok()) throw new Error(`login failed: HTTP ${res.status()} ${await res.text()}`)
  const headers = await res.headersArray()
  const token = cookieValue(headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value), 'mobos_company_session')
  return { token, sellers: (await res.json()).sellers || [] }
}

async function sellerSession(ctx, companyToken, sellerId, pin) {
  const res = await ctx.post('/api/auth/pin', {
    headers: bearer(companyToken),
    data: { sellerId, pin },
  })
  if (!res.ok()) throw new Error(`seller pin failed for ${sellerId}: HTTP ${res.status()} ${await res.text()}`)
  const headers = await res.headersArray()
  return cookieValue(headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value), 'mobos_seller_session')
}

// Firma de las migraciones: si cambia, el snapshot quedó viejo y se descarta.
function firmaMigraciones() {
  const dir = path.join(__dirname, '..', 'backend', 'prisma', 'migrations')
  const nombres = readdirSync(dir).filter((n) => !n.startsWith('.')).sort().join('|')
  return createHash('sha256').update(nombres).digest('hex').slice(0, 16)
}

async function snapshotValido() {
  try {
    const meta = JSON.parse(await readFile(SNAPSHOT_META(), 'utf8'))
    await access(SNAPSHOT())
    return meta.migraciones === firmaMigraciones()
  } catch { return false }
}

function restaurarSnapshot() {
  execFileSync(`${PG_BIN}/pg_restore`, [
    '-h', '127.0.0.1', '-p', PG_PORT(), '-U', 'postgres', '-d', PG_DB(),
    '--clean', '--if-exists', '--no-owner', '--no-privileges', SNAPSHOT(),
  ], { stdio: 'ignore' })
}

function guardarSnapshot() {
  try {
    execFileSync(`${PG_BIN}/pg_dump`, ['-h', '127.0.0.1', '-p', PG_PORT(), '-U', 'postgres', '-d', PG_DB(), '-Fc', '-f', SNAPSHOT()], { stdio: 'ignore' })
    writeFileSync(SNAPSHOT_META(), JSON.stringify({ migraciones: firmaMigraciones(), tomadoEn: new Date().toISOString() }, null, 2))
  } catch (error) {
    console.warn('[e2e] no se pudo tomar el snapshot:', error?.message || error)
  }
}

async function ensureBranch() {
  // The API has no branch-creation endpoint in this phase, so the harness
  // inserts the two test branches directly (idempotent, fixed ids).
  execFileSync(`${PG_BIN}/psql`, [
    '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
    '-v', 'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt")
     SELECT branch."id", t."id", branch."name", CURRENT_TIMESTAMP
     FROM "Tenant" t
     CROSS JOIN (VALUES ('${SEED.branchId}', '${SEED.branchName}'), ('${SEED.branch2Id}', '${SEED.branch2Name}')) AS branch("id", "name")
     WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT ("id") DO NOTHING;`,
  ], { stdio: 'ignore' })
}

// Invitaciones visibles en Configuración → Equipo (issue #54). Se recrean en
// cada corrida porque una spec ejerce la revocación real; ids fijos y acotados.
const INVITACIONES_E2E = [
  ['e2e-invite-pendiente', 'invitado.pendiente@test.local', 'Invitado E2E Pendiente', `ee${'1'.repeat(62)}`, '7 days', '-1 minute'],
  ['e2e-invite-vencida', 'invitado.vencida@test.local', 'Invitado E2E Vencido', `ee${'2'.repeat(62)}`, '-1 day', '-2 days'],
  ['e2e-invite-conflicto', 'invitado.conflicto@test.local', 'Invitado E2E Conflicto', `ee${'3'.repeat(62)}`, '7 days', '-1 minute'],
]

async function ensureInvitations() {
  const idList = INVITACIONES_E2E.map(([id]) => `'${id}'`).join(', ')
  const inserts = INVITACIONES_E2E.map(([id, email, name, tokenHash, expira, reenvio]) =>
    `INSERT INTO "UserInvitation" ("id", "tenantId", "email", "name", "role", "branchId", "inviterId", "tokenHash", "expiresAt", "sentAt", "resendAvailableAt", "updatedAt")
     SELECT '${id}', t."id", '${email}', '${name}', 'VENDEDOR'::"UserRole", NULL, (SELECT u."id" FROM "User" u WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN' ORDER BY u."createdAt" ASC LIMIT 1), '${tokenHash}', CURRENT_TIMESTAMP + INTERVAL '${expira}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '${reenvio}', CURRENT_TIMESTAMP
     FROM "Tenant" t
     WHERE t."email" = '${SEED.company.email}' AND EXISTS (SELECT 1 FROM "User" u WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN');`
  ).join(' ')
  try {
    execFileSync(`${PG_BIN}/psql`, [
      '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `DELETE FROM "UserInvitation" WHERE "id" IN (${idList}); ${inserts}`,
    ], { stdio: 'ignore' })
  } catch (error) {
    console.warn('[e2e] no se pudieron sembrar las invitaciones:', error?.message || error)
  }
}

async function ensureSellers(ctx, adminToken) {
  const res = await ctx.get('/api/users', { headers: bearer(adminToken) })
  if (!res.ok()) throw new Error(`users list failed: HTTP ${res.status()}`)
  const users = await res.json()
  for (const seller of SEED.sellers) {
    const found = users.find((u) => u.email === seller.email)
    if (found) {
      // Re-assert the PIN so storage states stay valid after partial reseeds.
      const patch = await ctx.patch('/api/users', { headers: bearer(adminToken), data: { id: found.id, resetPin: true, pin: seller.pin } })
      if (!patch.ok()) throw new Error(`seller PIN reset failed: HTTP ${patch.status()} ${await patch.text()}`)
      seller.id = found.id
    } else {
      const created = await ctx.post('/api/users', { headers: bearer(adminToken), data: { name: seller.name, email: seller.email, pin: seller.pin, role: 'VENDEDOR' } })
      if (!created.ok()) throw new Error(`seller create failed: HTTP ${created.status()} ${await created.text()}`)
      seller.id = (await created.json()).id
    }
  }
}

// Repartidor del seed: mismo patrón que los vendedores, con rol REPARTIDOR.
async function ensureRepartidor(ctx, adminToken) {
  const res = await ctx.get('/api/users', { headers: bearer(adminToken) })
  if (!res.ok()) throw new Error(`users list failed: HTTP ${res.status()}`)
  const users = await res.json()
  const found = users.find((u) => u.email === SEED.repartidor.email)
  if (found) {
    const patch = await ctx.patch('/api/users', { headers: bearer(adminToken), data: { id: found.id, resetPin: true, pin: SEED.repartidor.pin } })
    if (!patch.ok()) throw new Error(`repartidor PIN reset failed: HTTP ${patch.status()} ${await patch.text()}`)
    SEED.repartidor.id = found.id
    return
  }
  const created = await ctx.post('/api/users', { headers: bearer(adminToken), data: { name: SEED.repartidor.name, email: SEED.repartidor.email, pin: SEED.repartidor.pin, role: 'REPARTIDOR' } })
  if (!created.ok()) throw new Error(`repartidor create failed: HTTP ${created.status()} ${await created.text()}`)
  SEED.repartidor.id = (await created.json()).id
}

// Pedido de reparto del seed: sin cobros, asignado al repartidor y reiniciado
// en cada corrida para que el ciclo asignar → cobrar → rendir se pueda repetir.
async function ensureDeliveryOrder(ctx, sellerToken, adminToken) {
  const state = await ctx.get(`/api/delivery/orders?estado=todos&asignado=${SEED.repartidor.id}`, { headers: bearer(adminToken) })
  if (!state.ok()) throw new Error(`delivery orders list failed: HTTP ${state.status()}`)
  // El repartidor de prueba ve UN solo pedido (el sembrado): lo que quedó
  // asignado de corridas anteriores se desasigna para que la suite sea
  // determinista (delivery.spec afirma "y solo ese").
  execFileSync(`${PG_BIN}/psql`, [
    '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
    '-v', 'ON_ERROR_STOP=1',
    '-c', `UPDATE "Order" SET "assignedToId" = NULL WHERE "assignedToId" = (SELECT "id" FROM "User" WHERE "email" = '${SEED.repartidor.email}') AND "orderNumber" <> '${SEED.deliveryOrderNumber}';`,
  ], { stdio: 'ignore' })
  const existente = (await state.json()).find((row) => row.orderNumber === SEED.deliveryOrderNumber)
  if (existente) {
    execFileSync(`${PG_BIN}/psql`, [
      '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `DELETE FROM "DeliverySettlement" WHERE "deliveryUserId" = (SELECT "id" FROM "User" WHERE "email" = '${SEED.repartidor.email}'); UPDATE "Order" SET "fulfillmentStatus" = 'PROCESSING', "status" = 'PENDING', "assignedToId" = '${SEED.repartidor.id}' WHERE "orderNumber" = '${SEED.deliveryOrderNumber}'; DELETE FROM "Payment" WHERE "orderId" = (SELECT "id" FROM "Order" WHERE "orderNumber" = '${SEED.deliveryOrderNumber}');`,
    ], { stdio: 'ignore' })
    return
  }
  const created = await ctx.post('/api/orders', {
    headers: bearer(sellerToken),
    data: {
      orderNumber: SEED.deliveryOrderNumber,
      customer: { name: SEED.deliveryCustomer.name, phone: SEED.deliveryCustomer.phone, addresses: [{ label: 'Entrega', address: 'Av. Reparto E2E 123', city: 'Asunción', isDefault: true }] },
      deliveryType: 'Delivery',
      items: [{ productId: SEED.products.cable.id, description: SEED.products.cable.name, quantity: 1, unitPricePyg: SEED.products.cable.pricePyg }],
    },
  })
  if (!created.ok()) throw new Error(`delivery order create failed: HTTP ${created.status()} ${await created.text()}`)
  const order = await created.json()
  const assigned = await ctx.post(`/api/orders/${order.id}/assignment`, { headers: bearer(adminToken), data: { assignedToId: SEED.repartidor.id } })
  if (!assigned.ok()) throw new Error(`delivery order assign failed: HTTP ${assigned.status()} ${await assigned.text()}`)
}

async function ensureProducts(ctx, adminToken) {
  const res = await ctx.get('/api/products', { headers: bearer(adminToken) })
  if (!res.ok()) throw new Error(`products list failed: HTTP ${res.status()}`)
  const rows = await res.json()
  for (const [key, product] of Object.entries(SEED.products)) {
    let found = rows.find((r) => r.sku === product.sku)
    if (!found) {
      // La base persistente acumula productos de todas las corridas: el
      // listado general trae hasta 200 y el SKU del seed puede quedar fuera de
      // esa ventana (el create chocaba después con el IMEI: 409). Búsqueda
      // puntual antes de decidir crearlo.
      const porSku = await ctx.get(`/api/products?q=${encodeURIComponent(product.sku)}`, { headers: bearer(adminToken) })
      if (porSku.ok()) found = (await porSku.json()).find((r) => r.sku === product.sku)
    }
    if (found) {
      product.id = found.id
      // Serialized products own their stock via units; skip the stock reset.
      if (!product.imei) {
        const patch = await ctx.patch('/api/products', { headers: bearer(adminToken), data: { id: found.id, pricePyg: product.pricePyg, stock: product.stock } })
        if (!patch.ok()) throw new Error(`product stock reset failed (${key}): HTTP ${patch.status()}`)
      } else {
        // Cada corrida vende una unidad serializada: se reponen hasta 3
        // disponibles para que las suites repetidas no se queden sin stock.
        const unidades = await ctx.get(`/api/inventory-units?q=${encodeURIComponent(product.sku)}`, { headers: bearer(adminToken) })
        if (!unidades.ok()) throw new Error(`units list failed (${key}): HTTP ${unidades.status()}`)
        const disponibles = (await unidades.json()).filter((unit) => unit.status === 'AVAILABLE' && unit.product?.sku === product.sku).length
        for (let i = disponibles; i < 3; i += 1) {
          const serial = `E2E-${product.sku}-${Date.now().toString(36).toUpperCase()}${i}`
          const created = await ctx.post('/api/inventory-units', { headers: bearer(adminToken), data: { productId: product.id, branchId: SEED.branchId, serial, condition: 'NEW' } })
          if (!created.ok()) throw new Error(`unit replenish failed (${key}): HTTP ${created.status()} ${await created.text()}`)
        }
      }
    } else {
      const body = { sku: product.sku, name: product.name, category: product.category, pricePyg: product.pricePyg, stock: product.stock, costPyg: product.costPyg, branchId: SEED.branchId }
      if (product.imei) body.imei = product.imei, body.condition = 'NEW'
      const created = await ctx.post('/api/products', { headers: bearer(adminToken), data: body })
      if (!created.ok()) throw new Error(`product create failed (${key}): HTTP ${created.status()} ${await created.text()}`)
      product.id = (await created.json()).id
    }
  }
}

// Inventario de QA visual (#122): deja unidades de prueba en "Depósito 2" y
// "Piso de venta" para revisar la tabla compacta con contenido real. Es
// idempotente y no toca los datos que usan las specs.
const QA_INVENTARIO = [
  { sku: 'ZZ-QA-DEP2', name: 'iPhone 14 Pro QA Depósito', location: 'Depósito 2', prefix: 'ZZQA-DEP2', battery: 91 },
  { sku: 'ZZ-QA-PISO', name: 'iPhone 13 QA Piso de venta', location: 'Piso de venta', prefix: 'ZZQA-PISO', battery: 84 },
]

async function ensureQaInventory(ctx, adminToken) {
  for (const def of QA_INVENTARIO) {
    const locRes = await ctx.get('/api/stock-locations', { headers: bearer(adminToken) })
    if (!locRes.ok()) return
    let location = (await locRes.json()).find((row) => row.name === def.location && row.branchId === SEED.branchId)
    if (!location) {
      const created = await ctx.post('/api/stock-locations', { headers: bearer(adminToken), data: { branchId: SEED.branchId, name: def.location } })
      if (!created.ok()) return
      location = await created.json()
    }
    const prodRes = await ctx.get(`/api/products?q=${encodeURIComponent(def.sku)}`, { headers: bearer(adminToken) })
    let producto = prodRes.ok() ? (await prodRes.json()).find((row) => row.sku === def.sku) : null
    if (!producto) {
      const created = await ctx.post('/api/products', { headers: bearer(adminToken), data: { sku: def.sku, name: def.name, category: 'Celulares', condition: 'NEW', pricePyg: 4200000, costPyg: 3200000, stock: 0, branchId: SEED.branchId } })
      if (!created.ok()) continue
      producto = await created.json()
    }
    const unitsRes = await ctx.get(`/api/inventory-units?q=${encodeURIComponent(def.sku)}`, { headers: bearer(adminToken) })
    const units = unitsRes.ok() ? await unitsRes.json() : []
    for (let i = 1; i <= 3; i += 1) {
      const serial = `${def.prefix}-${i}`
      if (units.some((unit) => unit.serial === serial)) continue
      await ctx.post('/api/inventory-units', { headers: bearer(adminToken), data: { productId: producto.id, branchId: SEED.branchId, locationId: location.id, serial, condition: i === 3 ? 'USED' : 'NEW', batteryHealth: Math.max(60, def.battery - i * 2) } })
    }
  }
}

async function ensurePaymentAccounts(ctx, adminToken) {
  const res = await ctx.get('/api/payment-accounts', { headers: bearer(adminToken) })
  if (!res.ok()) throw new Error(`payment accounts list failed: HTTP ${res.status()}`)
  const rows = await res.json()
  for (const account of SEED.accounts) {
    if (rows.some((a) => a.name === account.name)) continue
    const created = await ctx.post('/api/payment-accounts', { headers: bearer(adminToken), data: account })
    if (!created.ok()) throw new Error(`payment account create failed (${account.name}): HTTP ${created.status()} ${await created.text()}`)
  }
}

async function ensureSeedOrder(ctx, companyToken, sellerId, adminToken) {
  const sellerToken = await sellerSession(ctx, companyToken, sellerId, SEED.sellers[0].pin)
  // La base persistente acumula pedidos: se busca el del seed por número para
  // no quedar fuera de la ventana de la lista y evitar duplicados -timestamp.
  const list = await ctx.get(`/api/orders?q=${encodeURIComponent(SEED.seedOrderNumber)}`, { headers: bearer(adminToken) })
  if (!list.ok()) throw new Error(`orders list failed: HTTP ${list.status()}`)
  const rows = await list.json()
  // The public tracking spec needs a customerName, so an older seed order
  // without a customer gets superseded by a fresh one.
  const existing = rows.find((o) => o.orderNumber === SEED.seedOrderNumber && o.customer?.name)
  let orderNumber = SEED.seedOrderNumber
  let token = existing?.publicToken
  // Desde #178 el token de seguimiento no se guarda en claro: un pedido
  // sembrado por el código nuevo no lo devuelve en la lista. Se pide un enlace
  // de nivel rápido (mismo nivel que el token legacy) para no crear otro pedido.
  if (!token && existing?.id) {
    const acceso = await ctx.post(`/api/orders/${existing.id}/access-tokens`, {
      headers: bearer(adminToken),
      data: { level: 'rapido', impreso: false },
    })
    if (acceso.ok()) token = (await acceso.json()).token
  }
  if (!token) {
    // orderNumber is unique per tenant; supersede an older seed order
    // (e.g. one created before the harness sent a customer) with a fresh one.
    if (rows.some((o) => o.orderNumber === SEED.seedOrderNumber)) orderNumber = `${SEED.seedOrderNumber}-${Date.now()}`
    // El pedido se crea con la sesión del vendedor para que aparezca en su
    // listado (una base nueva no tiene otros pedidos y los specs del vendedor
    // necesitan al menos uno); el admin lo ve igual porque ve todos.
    const create = (number) => ctx.post('/api/orders', {
      headers: bearer(sellerToken),
      data: {
        orderNumber: number,
        customer: { name: 'Cliente E2E Seguimiento' },
        items: [{ productId: SEED.products.cable.id, description: SEED.products.cable.name, quantity: 1, unitPricePyg: SEED.products.cable.pricePyg }],
        payment: { method: 'CASH', amountPyg: SEED.products.cable.pricePyg },
      },
    })
    let created = await create(orderNumber)
    // La base persistente es compartida y acumula órdenes: la lista trae las
    // últimas 100 y una semilla vieja puede quedar fuera de la ventana. Ante
    // el choque de número, se reintenta una vez con marca de tiempo.
    if (created.status() === 409) {
      orderNumber = `${SEED.seedOrderNumber}-${Date.now()}`
      created = await create(orderNumber)
    }
    if (!created.ok()) throw new Error(`seed order create failed: HTTP ${created.status()} ${await created.text()}`)
    token = (await created.json()).publicToken
  }
  await writeFile(SEED_ORDER_FILE, JSON.stringify({ orderNumber, publicToken: token }, null, 2))
  return sellerToken
}

async function writeStorageState(file, companyToken, sellerToken) {
  const ctx = await pwRequest.newContext({
    baseURL: API,
    storageState: {
      cookies: [
        { name: 'mobos_company_session', value: companyToken, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' },
        { name: 'mobos_seller_session', value: sellerToken, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' },
      ],
      origins: [],
    },
  })
  const state = await ctx.storageState()
  await ctx.dispose()
  await writeFile(file, JSON.stringify(state, null, 2))
}

export default async function globalSetup() {
  await mkdir(AUTH_DIR, { recursive: true })
  // La base persistente es compartida entre worktrees: otra sesión puede
  // cambiar la contraseña de la empresa seed. Se re-afirma en cada corrida.
  try {
    execFileSync(`${PG_BIN}/psql`, [
      '-h', '127.0.0.1', '-p', '5439', '-U', 'postgres', '-d', 'mobos_e2e',
      '-c', `UPDATE "Tenant" SET "passwordHash" = '$2b$12$IOfxzCWNHr64ronQliOU/uiiEFczir16Epz.VIPdI.F1diPIhRNhm', "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE "email" = '${SEED.company.email}' AND "passwordHash" IS NOT NULL;`,
    ], { stdio: 'ignore' })
  } catch {
    // Sin base no hay nada que restaurar; el seed completo lo resuelve.
  }
  // Los specs de admin crean un "Vendedor E2E …" en cada corrida. Sin
  // limpieza se acumulan en la base persistente y el login por PIN (que
  // compara bcrypt contra TODOS los usuarios activos) se vuelve lentísimo.
  // Se marcan INACTIVE (no se borran: conservan auditoría y FKs). Los
  // vendedores del seed se reconocen por su email y quedan excluidos.
  try {
    execFileSync(`${PG_BIN}/psql`, [
      '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
      '-c', `UPDATE "User" SET status = 'INACTIVE' WHERE (name LIKE 'Vendedor E2E%' OR name LIKE 'Integrante E2E%') AND email IS NULL;`,
    ], { stdio: 'ignore' })
  } catch {
    // Si el prune falla, la suite sigue: el seed propio no depende de esto.
  }
  const alreadySeeded = await access(MARKER).then(() => true).catch(() => false)
  const ctx = await pwRequest.newContext({ baseURL: API })
  try {
    if (alreadySeeded) {
      try {
        await refreshStorageStates(ctx)
        return
      } catch (error) {
        // La base persistente es compartida entre worktrees: otro agente
        // pudo re-sembrar y revocar sesiones, o borrar la base. Si renovar
        // no alcanza, se re-sembra completo.
        console.warn(`[e2e] refresh de sesiones falló (${error?.message || error}); re-sembrando completo.`)
        await rm(MARKER, { force: true })
        await rm(SEED_ORDER_FILE, { force: true })
      }
    }
    if (await snapshotValido()) {
      console.log('[e2e] Restaurando snapshot post-seed (sin re-sembrar)…')
      restaurarSnapshot()
      try {
        await refreshStorageStates(ctx)
        return
      } catch (error) {
        console.warn(`[e2e] refresh tras restaurar falló (${error?.message || error}); re-sembrando completo.`)
      }
    }
    await seedFresh(ctx)
    guardarSnapshot()
  } finally {
    await ctx.dispose()
  }
}

// Renueva sesiones y storage states sin mutar datos del tenant: otro
// worktree puede correr su propio seed sobre la misma base persistente y
// revocar nuestras sesiones (reset de PIN), o los archivos de estado pueden
// faltar. Es barato (login + 2 PIN) e idempotente.
async function refreshStorageStates(ctx) {
  const company = await loginCompany(ctx)
  const seller = company.sellers.find((s) => s.name === SEED.sellers[0].name)
  const admin = company.sellers.find((s) => s.name === SEED.admin.name)
  if (!seller || !admin) throw new Error('seed users not found in company sellers')
  const adminToken = await sellerSession(ctx, company.token, admin.id, SEED.admin.pin)
  // Reponer stock serializado y reafirmar precios también en el camino de
  // refresh: cada corrida vende unidades y la base persistente se agota.
  await ensureProducts(ctx, adminToken)
  await ensureQaInventory(ctx, adminToken)
  await ensurePaymentAccounts(ctx, adminToken)
  const sellerToken = await ensureSeedOrder(ctx, company.token, seller.id, adminToken)
  await ensureRepartidor(ctx, adminToken)
  await ensureDeliveryOrder(ctx, sellerToken, adminToken)
  await writeStorageState(SELLER_STATE, company.token, sellerToken)
  await writeStorageState(ADMIN_STATE, company.token, adminToken)
  await ensureInvitations()
}

async function seedFresh(ctx) {
  const company = await registerOrLogin(ctx)
  const companyToken = company.token

  // Onboarding sets the admin PIN (idempotent: 409 means already done).
  const onboarding = await ctx.post('/api/auth/onboarding', { headers: bearer(companyToken), data: { pin: SEED.admin.pin } })
  if (!onboarding.ok() && onboarding.status() !== 409) throw new Error(`onboarding failed: HTTP ${onboarding.status()} ${await onboarding.text()}`)

  // The login/register response lists sellers as {id, name, branchId} (no role).
  const adminId = company.sellers.find((s) => s.name === SEED.admin.name)?.id
  if (!adminId) throw new Error('admin user not found in company session sellers')
  let adminToken = await sellerSession(ctx, companyToken, adminId, SEED.admin.pin)

  // Branch first: serialized products need one, and the admin cash/inventory
  // views need a branch assignment.
  await ensureBranch()
  await ensureSellers(ctx, adminToken)
  await ensureRepartidor(ctx, adminToken)
  await ensureProducts(ctx, adminToken)
  await ensureQaInventory(ctx, adminToken)
  await ensurePaymentAccounts(ctx, adminToken)

  // Assign the branch to the admin (cash opens per branch). This revokes
  // admin sessions, so mint a fresh one afterwards.
  const assign = await ctx.patch('/api/users', { headers: bearer(adminToken), data: { id: adminId, branchId: SEED.branchId } })
  if (!assign.ok()) throw new Error(`admin branch assign failed: HTTP ${assign.status()} ${await assign.text()}`)
  adminToken = await sellerSession(ctx, companyToken, adminId, SEED.admin.pin)

  // El vendedor sembrado también necesita la sucursal para que el POS vea el
  // mismo inventario que los productos sembrados. El id sale de ensureSellers:
  // la respuesta de login/registro sólo lista vendedores preexistentes.
  const sellerAssign = await ctx.patch('/api/users', { headers: bearer(adminToken), data: { id: SEED.sellers[0].id, branchId: SEED.branchId } })
  if (!sellerAssign.ok()) throw new Error(`seller branch assign failed: HTTP ${sellerAssign.status()} ${await sellerAssign.text()}`)
  const repartidorAssign = await ctx.patch('/api/users', { headers: bearer(adminToken), data: { id: SEED.repartidor.id, branchId: SEED.branchId } })
  if (!repartidorAssign.ok()) throw new Error(`repartidor branch assign failed: HTTP ${repartidorAssign.status()} ${await repartidorAssign.text()}`)

  // Re-check the serialized product now that the branch exists (it may have
  // been created without a unit in an older partial seed).
  await ensureProducts(ctx, adminToken)

  const sellerToken = await ensureSeedOrder(ctx, companyToken, SEED.sellers[0].id, adminToken)
  await ensureDeliveryOrder(ctx, sellerToken, adminToken)

  await writeStorageState(SELLER_STATE, companyToken, sellerToken)
  await writeStorageState(ADMIN_STATE, companyToken, adminToken)
  await ensureInvitations()

  await writeFile(MARKER, JSON.stringify({
    seededAt: new Date().toISOString(),
    tenantEmail: SEED.company.email,
    adminId,
    sellers: SEED.sellers.map((s) => ({ id: s.id, name: s.name, pin: s.pin })),
    products: Object.fromEntries(Object.entries(SEED.products).map(([key, p]) => [key, { id: p.id, sku: p.sku }])),
    branchId: SEED.branchId,
  }, null, 2))
  // Precalentar Vite: la primera navegación compila módulos y puede superar
  // los timeouts en una corrida aislada con caché fría.
  const webBase = (process.env.MOBOS_E2E_WEB_URL || `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}`).replace(/\/$/, '')
  try {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    for (const path of ['/login', '/demo']) {
      try { await page.goto(`${webBase}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForLoadState('networkidle', { timeout: 60000 }) } catch { /* la app se calienta igual */ }
    }
    await browser.close()
  } catch (error) { console.warn('[e2e] warm-up de Vite omitido:', error?.message || error) }

  console.log('[e2e] Seeded tenant, sellers, products and tracking order.')
}
