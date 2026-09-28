// #286 · Sucursal efectiva para usuarios sin sucursal asignada (decisión de
// Dario): se queda con la última sucursal que usó; si no usó ninguna, con la
// primera creada de la empresa. Verifica contra la API real del arnés que un
// VENDEDOR sin sucursal ve el catálogo, ve las unidades y puede vender con su
// sucursal efectiva.
//
// Uso: node backend/tests/sucursal-efectiva.mjs <base> <databaseUrl> <pgBin>
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'

const [base, databaseUrl, pgBin] = process.argv.slice(2)
assert.ok(base && databaseUrl && pgBin, 'uso: sucursal-efectiva.mjs <base> <databaseUrl> <pgBin>')

const psql = (query) => execFileSync(`${pgBin}/psql`, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', query], { encoding: 'utf8' }).trim()

const SELLER = 'user-sin-sucursal-it'
const PIN = '7412'
const PRIMERA = 'branch-a-it' // primera sucursal creada del tenant A del arnés
const SEGUNDA = 'branch-a2-it'
const PRODUCTO_PRIMERA = 'prod-ef-primera-it'
const PRODUCTO_SEGUNDA = 'prod-ef-segunda-it'
// Los seriales se guardan normalizados (mayúsculas y sin separadores).
const SERIAL_PRIMERA = 'SEREFPRIMERA01'
const SERIAL_SEGUNDA = 'SEREFSEGUNDA01'

// Sembrado propio y determinista, sobre el tenant A que ya trae dos sucursales.
psql(`DELETE FROM "UserBranchUsage" WHERE "userId" = '${SELLER}'`)
psql(`INSERT INTO "User" ("id","tenantId","branchId","name","email","pinHash","role","status","updatedAt")
      VALUES ('${SELLER}','tenant-a-it',NULL,'Seller Sin Sucursal','seller-sin-sucursal-it@example.invalid','${bcrypt.hashSync(PIN, 10)}','VENDEDOR','ACTIVE',CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET "branchId" = NULL, "pinHash" = EXCLUDED."pinHash", "role" = 'VENDEDOR', "status" = 'ACTIVE'`)
// Orden explícito de creación: la regla usa «primera creada» como fallback.
psql(`UPDATE "Branch" SET "createdAt" = '2024-01-01T00:00:00Z' WHERE "id" = '${PRIMERA}'`)
psql(`UPDATE "Branch" SET "createdAt" = '2024-06-01T00:00:00Z' WHERE "id" = '${SEGUNDA}'`)
psql(`INSERT INTO "Product" ("id","tenantId","branchId","sku","name","category","pricePyg","stock","isActive","updatedAt") VALUES
      ('${PRODUCTO_PRIMERA}','tenant-a-it','${PRIMERA}','SKU-EF-PRIMERA-IT','Producto sucursal primera','Test',100000,5,true,CURRENT_TIMESTAMP),
      ('${PRODUCTO_SEGUNDA}','tenant-a-it','${SEGUNDA}','SKU-EF-SEGUNDA-IT','Producto sucursal segunda','Test',100000,5,true,CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET "branchId" = EXCLUDED."branchId", "stock" = 5, "isActive" = true`)
psql(`INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","status","updatedAt") VALUES
      ('unit-ef-primera-it','tenant-a-it','${PRODUCTO_PRIMERA}','${PRIMERA}','${SERIAL_PRIMERA}','AVAILABLE',CURRENT_TIMESTAMP),
      ('unit-ef-segunda-it','tenant-a-it','${PRODUCTO_SEGUNDA}','${SEGUNDA}','${SERIAL_SEGUNDA}','AVAILABLE',CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET "branchId" = EXCLUDED."branchId", "status" = 'AVAILABLE'`)

// IP de cliente propia (como otro terminal detrás del Hub): este arnés no
// consume las ventanas de límite por IP que comparten las demás secciones
// (todas llegan desde 127.0.0.1) ni les mueve el piso.
const IP_CLIENTE = '10.99.0.7'

async function pedir(path, { method = 'GET', body, token, tenant = 'tenant-a-it' } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'x-forwarded-for': IP_CLIENTE,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null, response }
}
let checks = 0
const catalogoDe = async (token) => {
  const { status, data } = await pedir('/api/products?q=SKU-EF-', { token })
  assert.equal(status, 200, `catálogo: ${JSON.stringify(data)}`)
  checks++
  return Array.isArray(data) ? data.map((producto) => producto.id) : []
}
const unidadesDe = async (token, productId, branchId) => {
  const query = `productId=${productId}&status=AVAILABLE${branchId ? `&branchId=${branchId}` : ''}`
  const { status, data } = await pedir(`/api/inventory-units?${query}`, { token })
  checks++
  return { status, seriales: Array.isArray(data) ? data.map((unidad) => unidad.serial) : [] }
}
const ventaCon = async (token, productId, serial) => {
  const { status, data } = await pedir('/api/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId, description: productId, quantity: 1, unitPricePyg: 100000, inventoryUnitSerials: [serial] }], payments: [{ method: 'CASH', amountPyg: 100000, status: 'CONFIRMED' }] },
  })
  assert.equal(status, 201, `venta con ${productId}: ${JSON.stringify(data)}`)
  checks++
  return data
}

// Sesión de vendedor sembrada por SQL: el arnés comparte la ventana de
// intentos de /api/auth/pin (20 cada 15 min), así que no consume logins.
const tokenVendedor = randomBytes(32).toString('hex')
const tokenHash = createHash('sha256').update(tokenVendedor).digest('hex')
psql(`DELETE FROM "Session" WHERE "id" = 'sesion-ef-it'`)
psql(`INSERT INTO "Session" ("id","tenantId","userId","level","deviceId","branchId","tokenHash","expiresAt","createdAt","lastSeenAt")
      VALUES ('sesion-ef-it','tenant-a-it','${SELLER}','SELLER','device-sucursal-efectiva',NULL,'${tokenHash}',(NOW() AT TIME ZONE 'UTC') + INTERVAL '1 hour',(NOW() AT TIME ZONE 'UTC'),(NOW() AT TIME ZONE 'UTC'))`)

// 1) Sin uso previo la sucursal efectiva es la primera creada: la sesión la
// expone, el catálogo deja de estar vacío y las unidades salen de ahí.
const me = await pedir('/api/auth/me', { token: tokenVendedor })
assert.equal(me.status, 200)
assert.equal(me.data.user.branchId, PRIMERA, 'la efectiva debe ser la primera sucursal creada')
checks++
const primeraVuelta = await catalogoDe(tokenVendedor)
assert.ok(primeraVuelta.includes(PRODUCTO_PRIMERA), 'el catálogo muestra los productos de la sucursal efectiva')
assert.ok(!primeraVuelta.includes(PRODUCTO_SEGUNDA), 'el catálogo no mezcla productos de otra sucursal')
const unidadesPrimera = await unidadesDe(tokenVendedor, PRODUCTO_PRIMERA)
assert.equal(unidadesPrimera.status, 200, 'las unidades de la sucursal efectiva se listan')
assert.ok(unidadesPrimera.seriales.includes(SERIAL_PRIMERA), 'el vendedor ve el equipo serializado de su sucursal')
const unidadesAjenas = await unidadesDe(tokenVendedor, PRODUCTO_SEGUNDA)
assert.equal(unidadesAjenas.status, 200)
assert.ok(!unidadesAjenas.seriales.includes(SERIAL_SEGUNDA), 'no ve unidades de otra sucursal')
const unidadesOtraRama = await unidadesDe(tokenVendedor, PRODUCTO_PRIMERA, SEGUNDA)
assert.equal(unidadesOtraRama.status, 403, 'pedir otra sucursal sigue dando 403')

// 2) La venta es posible: el pedido queda con la sucursal efectiva y el
// vendedor lo vuelve a ver en su listado.
const venta = await ventaCon(tokenVendedor, PRODUCTO_PRIMERA, SERIAL_PRIMERA)
assert.equal(venta.branchId, PRIMERA, 'el pedido debe quedar en la sucursal efectiva')
const listado = await pedir('/api/orders', { token: tokenVendedor })
assert.equal(listado.status, 200, `listado de pedidos: ${JSON.stringify(listado.data)}`)
assert.ok(Array.isArray(listado.data) && listado.data.some((pedido) => pedido.id === venta.id), 'el vendedor ve el pedido que acaba de crear')
checks++

// 3) La preferencia manda: con uso previo en otra sucursal, la efectiva es esa.
psql(`INSERT INTO "UserBranchUsage" ("id","tenantId","userId","branchId","usedAt")
      VALUES ('ubu-ef-segunda','tenant-a-it','${SELLER}','${SEGUNDA}',(NOW() AT TIME ZONE 'UTC') + INTERVAL '1 minute')
      ON CONFLICT ("userId","branchId") DO UPDATE SET "usedAt" = EXCLUDED."usedAt"`)
const meSegunda = await pedir('/api/auth/me', { token: tokenVendedor })
assert.equal(meSegunda.data.user.branchId, SEGUNDA, 'la última usada debe mandar sobre la primera creada')
checks++
const segundaVuelta = await catalogoDe(tokenVendedor)
assert.ok(segundaVuelta.includes(PRODUCTO_SEGUNDA), 'el catálogo sigue a la última usada')
assert.ok(!segundaVuelta.includes(PRODUCTO_PRIMERA), 'la sucursal anterior deja de listarse')
const unidadesSegunda = await unidadesDe(tokenVendedor, PRODUCTO_SEGUNDA)
assert.ok(unidadesSegunda.seriales.includes(SERIAL_SEGUNDA), 'las unidades siguen a la última usada')
const ventaSegunda = await ventaCon(tokenVendedor, PRODUCTO_SEGUNDA, SERIAL_SEGUNDA)
assert.equal(ventaSegunda.branchId, SEGUNDA, 'la venta sigue a la última usada')

console.log(`sucursal-efectiva: ${checks} verificaciones OK (catálogo, unidades y venta sin sucursal asignada)`)
