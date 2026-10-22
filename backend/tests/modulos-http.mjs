import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

// Módulos apagados contra el servidor real: las escrituras de cada apiPrefix dan 403
// (antes de validar el cuerpo), las lecturas no se bloquean, el servidor de pedidos no
// aplica gift cards / cupones / combos / trade-in y el PUT de módulos es solo del dueño real.
const [base, admin, databaseUrl, pgBin] = process.argv.slice(2)
if (!base || !admin || !databaseUrl || !pgBin) throw new Error('base, token admin, DATABASE_URL y PG_BIN requeridos')
const tenantId = 'tenant-a-it'
let checks = 0
const psql = (sql) => execFileSync(`${pgBin}/psql`, [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-c', sql]).toString().trim()

async function pedir(path, method = 'GET', body) {
  for (let intento = 0; intento < 3; intento += 1) {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const data = await response.json().catch(() => null)
    if (response.status !== 429) return { status: response.status, data }
    await new Promise((resolve) => setTimeout(resolve, Math.min(65, Math.max(1, Number(response.headers.get('retry-after')) || 5)) * 1000))
  }
  throw new Error(`${method} ${path}: rate limit persistente`)
}

const original = psql(`SELECT COALESCE(settings,'{}'::jsonb)::text FROM "Tenant" WHERE "id"='${tenantId}'`)
const ids = ['tradein', 'servicios', 'delivery', 'campanas-recompra', 'publicidad', 'comisiones', 'cuotas', 'conciliacion', 'gift-cards', 'promociones', 'listas-precios', 'abastecimiento', 'multisucursal', 'stock-avanzado', 'ia-conectores', 'verificacion-imei', 'inventario-unidades', 'venta-sin-stock']
function guardarStore(apagados) {
  const modules = Object.fromEntries(apagados.map((id) => [id, { enabled: false, manuallySelected: true, source: 'manual', updatedAt: new Date().toISOString() }]))
  const store = JSON.stringify({ version: 1, preset: 'comercio', modules })
  psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings",'{}'::jsonb) || jsonb_build_object('moduleStore', $j$${store}$j$::jsonb) WHERE "id"='${tenantId}'`)
}

// [método, ruta, módulo]: el cuerpo vacío llega antes que cualquier validación.
const escrituras = [
  ['PATCH', '/api/trade-ins', 'tradein'], ['POST', '/api/device-valuations', 'tradein'],
  ['POST', '/api/service-orders', 'servicios'], ['PATCH', '/api/service-orders', 'servicios'], ['POST', '/api/warranties', 'servicios'], ['POST', '/api/workshop/parts', 'servicios'],
  ['POST', '/api/delivery/trips', 'delivery'], ['POST', '/api/delivery/tariffs', 'delivery'],
  ['POST', '/api/marketing/campaigns', 'campanas-recompra'],
  ['POST', '/api/commission-rules', 'comisiones'], ['POST', '/api/commission-settlements', 'comisiones'],
  ['POST', '/api/store-credits', 'cuotas'], ['POST', '/api/collections/reminders', 'cuotas'],
  ['POST', '/api/finance/reconciliation', 'conciliacion'],
  ['POST', '/api/gift-cards', 'gift-cards'],
  ['POST', '/api/promotions', 'promociones'], ['POST', '/api/combos', 'promociones'],
  ['POST', '/api/price-lists', 'listas-precios'],
  ['POST', '/api/supply/needs', 'abastecimiento'], ['POST', '/api/transit-assignments', 'abastecimiento'],
  ['POST', '/api/transfers', 'multisucursal'], ['POST', '/api/shared-stock', 'multisucursal'],
  ['POST', '/api/inventory-counts', 'stock-avanzado'], ['POST', '/api/stock-verifications', 'stock-avanzado'], ['POST', '/api/inventory-reservations', 'stock-avanzado'],
  ['POST', '/api/imei', 'verificacion-imei'],
  ['POST', '/api/inventory-units', 'inventario-unidades'], ['PATCH', '/api/inventory-units', 'inventario-unidades'],
]
const lecturas = ['/api/gift-cards', '/api/promotions', '/api/price-lists', '/api/commission-rules', '/api/service-orders', '/api/transfers', '/api/inventory-counts', '/api/store-credits', '/api/device-valuations', '/api/combos', '/api/imei']

try {
  // Empresa existente sin cambios: nada se bloquea por módulos.
  psql(`UPDATE "Tenant" SET "settings" = COALESCE("settings",'{}'::jsonb) - 'moduleStore' WHERE "id"='${tenantId}'`)
  const abierta = await pedir('/api/gift-cards', 'POST', {})
  assert.notEqual(abierta.status, 403, 'sin store (legacy) el módulo está activo')
  checks += 1

  guardarStore(ids)
  for (const [metodo, ruta, modulo] of escrituras) {
    const { status, data } = await pedir(ruta, metodo, {})
    assert.equal(status, 403, `${metodo} ${ruta} con ${modulo} apagado: ${JSON.stringify(data)}`)
    assert.match(String(data?.message), /desactivado/, `${metodo} ${ruta}: mensaje claro`)
    checks += 1
  }
  for (const ruta of lecturas) {
    const { status, data } = await pedir(ruta)
    assert.notEqual(status, 403, `GET ${ruta} con el módulo apagado debe seguir leyendo: ${JSON.stringify(data)}`)
    checks += 1
  }

  // El servidor de pedidos no aplica lo que viene de un módulo apagado aunque el front lo mande.
  const venta = (extra) => ({ orderNumber: `MOD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, items: [{ productId: 'prod-a-order-it', description: 'Módulos', quantity: 1, unitPricePyg: 100000, ...(extra.item ?? {}) }], ...(extra.payment ? { payment: extra.payment } : { payment: { method: 'CASH', amountPyg: 1000 } }) })
  for (const [nombre, cuerpo] of [
    ['gift card', venta({ payment: { method: 'GIFT_CARD', amountPyg: 100000, status: 'CONFIRMED', giftCardCode: 'GC-AAAA-BBBB-CCCC' } })],
    ['cupón', venta({ item: { couponCode: 'NOEXISTE' } })],
    ['venta sin stock (backorder)', venta({ item: { backorder: true } })],
    ['combo', venta({ item: { comboId: 'combo-inexistente' } })],
    ['trade-in', venta({ payment: { method: 'TRADE_IN', amountPyg: 100000, status: 'CONFIRMED', tradeIn: { serial: 'MODSERIAL1', model: 'Equipo', conditionNotes: 'ok' } } })],
  ]) {
    const { status, data } = await pedir('/api/orders', 'POST', cuerpo)
    assert.equal(status, 403, `pedido con ${nombre} y el módulo apagado: ${JSON.stringify(data)}`)
    checks += 1
  }
  const normal = await pedir('/api/orders', 'POST', venta({}))
  assert.equal(normal.status, 201, `un pedido común sigue funcionando: ${JSON.stringify(normal.data)}`)
  checks += 1

  // Con los módulos activos el mismo pedido ya no se rechaza por módulo.
  guardarStore([])
  const activo = await pedir('/api/orders', 'POST', venta({ payment: { method: 'GIFT_CARD', amountPyg: 100000, status: 'CONFIRMED', giftCardCode: 'GC-AAAA-BBBB-CCCC' } }))
  assert.notEqual(activo.status, 403, `con gift-cards activo no se rechaza por módulo: ${JSON.stringify(activo.data)}`)
  checks += 1

  // Venta sin stock activa: backorder:true ya no se rechaza por módulo.
  const conBackorder = await pedir('/api/orders', 'POST', venta({ item: { backorder: true } }))
  assert.notEqual(conBackorder.status, 403, `con venta-sin-stock activo no se rechaza por módulo: ${JSON.stringify(conBackorder.data)}`)
  checks += 1

  // Solo el dueño real cambia módulos: un ADMIN sin membresía OWNER recibe 403.
  const estado = await pedir('/api/tenant/modules')
  assert.equal(estado.status, 200)
  if (estado.data.canManage === false) {
    const put = await pedir('/api/tenant/modules', 'PUT', { moduleId: 'tradein', enabled: false })
    assert.equal(put.status, 403, `PUT módulos sin ser dueño real: ${JSON.stringify(put.data)}`)
    checks += 1
  }
  console.log(`modulos-http: ${checks} verificaciones OK`)
} finally {
  psql(`UPDATE "Tenant" SET "settings" = $j$${original}$j$::jsonb WHERE "id"='${tenantId}'`)
}
