// Caza de bugs FIN de la ronda 2 (#204): caja/conciliación (diferencias y
// lote), seguro/margen, medios (Pix, USDT-cripto, canje) y cuentas. Sonda de
// sólo lectura + datos de prueba contra un entorno local con el seed de e2e.
//
// Uso: QA_BASE_URL=http://localhost:3115 QA_ORIGIN=http://localhost:5215 \
//      node scripts/qa-204-finanzas-probe.mjs
// Salida: una línea OK/FALLO por caso y el resumen final (exit 0 siempre).
const BASE = process.env.QA_BASE_URL || 'http://localhost:3115'
const ORIGIN = process.env.QA_ORIGIN || 'http://localhost:5215'
const EMAIL = process.env.QA_EMAIL || 'e2e-tienda@test.local'
const PASSWORD = process.env.QA_PASSWORD || 'E2e-password-123'
const PIN = process.env.QA_PIN || '1234'
const ADMIN = process.env.QA_ADMIN_NAME || 'Administrador'
const resultados = []
let cookies = ''

async function req(path, { method = 'GET', body, raw } = {}) {
  const respuesta = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookies ? { cookie: cookies } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const setCookie = respuesta.headers.getSetCookie?.() || []
  if (setCookie.length) cookies = setCookie.map((c) => c.split(';')[0]).join('; ')
  const texto = await respuesta.text()
  let data = texto
  try { data = JSON.parse(texto) } catch { /* texto */ }
  return { status: respuesta.status, data, raw: raw ? texto : undefined }
}

function probe(nombre, fn) {
  return fn().then((detalle) => {
    resultados.push({ probe: nombre, ok: true, detalle })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }).catch((error) => {
    resultados.push({ probe: nombre, ok: false, detalle: String(error?.message || error) })
    console.log(`FALLO ${nombre} — ${error?.message || error}`)
  })
}
const check = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }

// ── Sesión ──────────────────────────────────────────────────────────
const login = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD, deviceId: 'qa-204' } })
check(login.status === 200, `login ${login.status}`)
const admin = (login.data.sellers || []).find((u) => u.name === ADMIN)
check(admin, `admin "${ADMIN}" no encontrado en el login`)
const pin = await req('/api/auth/pin', { method: 'POST', body: { sellerId: admin.id, pin: PIN } })
check(pin.status === 200, `pin ${pin.status}`)
console.log(`sesión admin ok (${admin.name})`)

const sufijo = Date.now().toString(36).toUpperCase()
async function crearProducto(precio, costo) {
  const r = await req('/api/products', { method: 'POST', body: { name: `QA 204 ${sufijo} ${Math.random().toString(36).slice(2, 6)}`, sku: `QA204-${sufijo}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, pricePyg: precio, costPyg: costo, stock: 10 } })
  check(r.status === 201, `producto ${r.status}: ${JSON.stringify(r.data)}`)
  return r.data
}
async function crearCuenta(body) {
  const r = await req('/api/payment-accounts', { method: 'POST', body })
  return r
}
async function crearOrden(producto, payments, extra = {}) {
  const r = await req('/api/orders', { method: 'POST', body: { items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: producto.pricePyg }], payments, ...extra } })
  return r
}

// ── Cuentas ─────────────────────────────────────────────────────────
await probe('cuentas: validaciones de rangos y monedas fijas', async () => {
  const base = { name: `QA 204 ${sufijo}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-${sufijo}` }
  const pixMal = await crearCuenta({ ...base, name: `${base.name} pix`, kind: 'PIX', currency: 'PYG' })
  check(pixMal.status === 400, `PIX+PYG debía fallar: ${pixMal.status}`)
  const usdtMal = await crearCuenta({ ...base, name: `${base.name} usdt`, kind: 'CRYPTO', currency: 'BRL' })
  check(usdtMal.status === 400, `CRYPTO+BRL debía fallar: ${usdtMal.status}`)
  const feeMal = await crearCuenta({ ...base, name: `${base.name} fee`, feePercent: 150 })
  check(feeMal.status === 400, `feePercent 150 debía fallar: ${feeMal.status}`)
  const diasMal = await crearCuenta({ ...base, name: `${base.name} dias`, settlementDays: 91 })
  check(diasMal.status === 400, `settlementDays 91 debía fallar: ${diasMal.status}`)
  return 'rangos y monedas fijas rechazados'
})

await probe('medios: transferencia no mezcla USDT (tiene su propio medio)', async () => {
  const r = await crearCuenta({ name: `QA 204 ${sufijo} transfer-usdt`, kind: 'TRANSFER', currency: 'USDT', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-U-${sufijo}` })
  check(r.status === 400, `TRANSFER+USDT debía 400: ${r.status} ${JSON.stringify(r.data).slice(0, 80)}`)
  return '400'
})

await probe('cuentas: PATCH sin cambios responde claro', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} patch`, kind: 'CASH', currency: 'PYG' })).data
  const r = await req('/api/payment-accounts', { method: 'PATCH', body: { id: cuenta.id } })
  return `status=${r.status} ${JSON.stringify(r.data).slice(0, 80)}`
})

await probe('cuentas: inactiva no se puede usar para cobrar', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} inactiva`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-I-${sufijo}` })).data
  await req('/api/payment-accounts', { method: 'PATCH', body: { id: cuenta.id, isActive: false } })
  const producto = await crearProducto(100000, 60000)
  const orden = await crearOrden(producto, [{ accountId: cuenta.id, originalAmount: '100000', exchangeRatePyg: '1', amountPyg: 100000, method: 'TRANSFER', status: 'CONFIRMED' }])
  check(orden.status === 409, `debía fallar 409: ${orden.status} ${JSON.stringify(orden.data)}`)
  return 'inactiva rechazada (409)'
})

// ── Conciliación ────────────────────────────────────────────────────
const procesadoraPropia = `QA204${sufijo}`
const cuentaConc = (await crearCuenta({ name: `QA 204 ${sufijo} conc`, kind: 'CARD', currency: 'PYG', processor: procesadoraPropia })).data
const productoConc = await crearProducto(250000, 150000)
const ordenConc = (await crearOrden(productoConc, [{ accountId: cuentaConc.id, originalAmount: '250000', exchangeRatePyg: '1', amountPyg: 250000, method: 'CARD', status: 'CONFIRMED', reference: `CONC-${sufijo}` }])).data
const pagoConc = ordenConc.payments[0]
let lotePropio = null

await probe('conciliación: lote con diferencia sin nota se rechaza', async () => {
  const r = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [pagoConc.id], receivedPyg: 200000 } })
  check(r.status === 400, `debía 400: ${r.status}`)
  return '400'
})

await probe('conciliación: lote mixto rechazado', async () => {
  const cuentaB = (await crearCuenta({ name: `QA 204 ${sufijo} concB`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-B-${sufijo}` })).data
  const productoB = await crearProducto(120000, 70000)
  const ordenB = (await crearOrden(productoB, [{ accountId: cuentaB.id, originalAmount: '120000', exchangeRatePyg: '1', amountPyg: 120000, method: 'TRANSFER', status: 'CONFIRMED' }])).data
  const r = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [pagoConc.id, ordenB.payments[0].id], receivedPyg: 370000 } })
  check(r.status === 400, `debía 400: ${r.status}`)
  return '400'
})

await probe('conciliación: lote con diferencia + nota y distribución por procesadora', async () => {
  const r = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [pagoConc.id], receivedPyg: 240000, note: 'Retuvo comisión' } })
  check(r.status === 201, `debía 201: ${r.status} ${JSON.stringify(r.data)}`)
  lotePropio = r.data.lote.id
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const vista = (await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`)).data
  const procesadora = (vista.porProcesadora || []).find((f) => f.key === procesadoraPropia)
  check(procesadora, 'no aparece la procesadora propia')
  check(procesadora.differencePyg === -10000, `diferencia por procesadora ${procesadora.differencePyg} ≠ -10000`)
  const cuenta = (vista.porCuenta || []).find((f) => f.key === cuentaConc.id)
  check(cuenta?.differencePyg === -10000, `diferencia por cuenta ${cuenta?.differencePyg} ≠ -10000`)
  return `diferencia espejada en cuenta y procesadora (-10.000)`
})

await probe('conciliación: re-conciliar un pago ya verificado en otro lote', async () => {
  const r = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [pagoConc.id], receivedPyg: 250000, note: 'Segundo lote' } })
  check(r.status === 409, `mover un pago ya conciliado a otro lote debía 409: ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  return '409'
})

await probe('conciliación: el lote original conserva su pago', async () => {
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const vista = (await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}`)).data
  const propio = (vista.lotes || []).find((l) => l.id === lotePropio)
  check(propio?.pagos === 1, `el lote propio quedó con ${propio?.pagos} pago(s)`)
  return 'lote propio intacto (1 pago)'
})

await probe('conciliación: lote sobre pago PENDING lo confirma y cierra el pedido', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} pend`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-P-${sufijo}` })).data
  const producto = await crearProducto(180000, 90000)
  const orden = (await crearOrden(producto, [{ accountId: cuenta.id, originalAmount: '180000', exchangeRatePyg: '1', amountPyg: 180000, method: 'TRANSFER', status: 'PENDING' }])).data
  const pago = orden.payments[0]
  const r = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [pago.id], receivedPyg: 180000 } })
  check(r.status === 201, `debía 201: ${r.status} ${JSON.stringify(r.data)}`)
  const ver = await req(`/api/orders/${orden.id}`)
  const pagoActualizado = (ver.data.payments || []).find((p) => p.id === pago.id)
  check(pagoActualizado?.status === 'CONFIRMED', `pago quedó ${pagoActualizado?.status}`)
  check(ver.data.status === 'COMPLETED', `pedido quedó ${ver.data.status}`)
  return 'pago confirmado y pedido completado'
})

await probe('conciliación: soloResumen y validaciones de entrada', async () => {
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const resumen = (await req(`/api/finance/reconciliation?from=${hoy}&to=${hoy}&soloResumen=1`)).data
  check(resumen.items === undefined && resumen.lotes === undefined, 'soloResumen devolvió items/lotes')
  const muchos = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: Array.from({ length: 201 }, (_, i) => `x${i}`), receivedPyg: 1 } })
  check(muchos.status === 400, `201 ids debía 400: ${muchos.status}`)
  const cuentaNueva = (await crearCuenta({ name: `QA 204 ${sufijo} neg`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'QA', accountNumber: `QA-N-${sufijo}` })).data
  const productoNuevo = await crearProducto(90000, 50000)
  const ordenNueva = (await crearOrden(productoNuevo, [{ accountId: cuentaNueva.id, originalAmount: '90000', exchangeRatePyg: '1', amountPyg: 90000, method: 'TRANSFER', status: 'CONFIRMED' }])).data
  const negativo = await req('/api/finance/reconciliation', { method: 'POST', body: { action: 'batch', paymentIds: [ordenNueva.payments[0].id], receivedPyg: -1 } })
  check(negativo.status === 400, `recibido -1 debía 400: ${negativo.status}`)
  return 'soloResumen y bordes ok'
})

// ── Caja ────────────────────────────────────────────────────────────
await probe('caja: doble apertura rechazada', async () => {
  const estado = await req('/api/cash')
  const abierta = estado.data?.session?.status === 'OPEN'
  if (!abierta) await req('/api/cash', { method: 'POST', body: { action: 'open', openingPyg: 100000 } })
  const segunda = await req('/api/cash', { method: 'POST', body: { action: 'open', openingPyg: 50000 } })
  check(segunda.status === 409, `segunda apertura debía 409: ${segunda.status} ${JSON.stringify(segunda.data)}`)
  return '409'
})

await probe('caja: gasto en efectivo baja el esperado y el cierre calcula la diferencia', async () => {
  const estado = await req('/api/cash')
  const turno = estado.data?.session
  check(turno?.status === 'OPEN', 'no hay caja abierta')
  const branchId = turno?.branchId || estado.data?.branchId
  const antes = Number(turno.expectedPyg || 0)
  const movimiento = await req(`/api/finance${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`, { method: 'POST', body: { action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', originalAmount: '10000', exchangeRatePyg: '1', description: `QA 204 ${sufijo} gasto`, ...(branchId ? { branchId } : {}) } })
  check(movimiento.status === 201, `gasto ${movimiento.status}: ${JSON.stringify(movimiento.data)}`)
  const despues = Number((await req(`/api/cash${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`)).data?.session?.expectedPyg || 0)
  check(despues === antes - 10000, `esperado no bajó: ${antes} → ${despues}`)
  return `esperado ${antes} → ${despues}`
})

// ── Seguro / margen ─────────────────────────────────────────────────
await probe('seguro: validación y efecto en reportes y finanzas', async () => {
  // Las acciones sensibles exigen reautenticación reciente (#172).
  const reauth = await req('/api/account', { method: 'POST', body: { password: PASSWORD } })
  check(reauth.status === 200, `reauth ${reauth.status}: ${JSON.stringify(reauth.data)}`)
  const invalido = await req('/api/account', { method: 'PATCH', body: { action: 'updateLimits', insurancePct: 150 } })
  check(invalido.status === 400, `insurancePct 150 debía 400: ${invalido.status} ${JSON.stringify(invalido.data)}`)
  const ok = await req('/api/account', { method: 'PATCH', body: { action: 'updateLimits', insurancePct: 25 } })
  check(ok.status === 200, `insurancePct 25 debía 200: ${ok.status}`)
  const leido = await req('/api/account')
  const persistido = leido.data?.tenant?.insurancePct
  check(persistido === 25, `GET /api/account no devuelve insurancePct (leyó ${persistido})`)

  // El default de la empresa rige para clientes con seguro activo y sin tasa propia (#160).
  const cliente = await req('/api/customers', { method: 'POST', body: { name: `QA 204 ${sufijo} cliente`, phone: '0981000000', insuranceEnabled: true } })
  check([200, 201].includes(cliente.status), `cliente ${cliente.status}: ${JSON.stringify(cliente.data)}`)
  const producto = await crearProducto(150000, 100000)
  const orden = (await crearOrden(producto, [{ method: 'CASH', amountPyg: 150000, status: 'CONFIRMED' }], { customerId: cliente.data.id })).data
  const item = orden.items[0]
  check(item.baseUnitCostPyg === 100000, `base ${item.baseUnitCostPyg}`)
  check(item.insurancePyg === 25000, `seguro ${item.insurancePyg}`)
  check(item.unitCostPyg === 125000, `costo real ${item.unitCostPyg}`)
  const r = await req(`/api/reports?from=${new Date(Date.now() - 3600000).toISOString().slice(0, 10)}&to=${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)}&groupBy=product`)
  const grupo = (r.data.groups || []).find((g) => g.key === producto.id)
  check(grupo?.costPyg === 125000 && grupo?.profitPyg === 25000, `reporte cost=${grupo?.costPyg} profit=${grupo?.profitPyg}`)
  return `base=100.000 seguro=25.000 real=125.000 · reporte cost=125.000 profit=25.000`
})

await probe('seguro: vendido sin seguro no aplica', async () => {
  const producto = await crearProducto(200000, 100000)
  const orden = (await crearOrden(producto, [{ method: 'CASH', amountPyg: 200000, status: 'CONFIRMED' }], { items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 200000, soldWithoutInsurance: true }] })).data
  const item = orden.items[0]
  check(item.insurancePyg === 0 && item.unitCostPyg === 100000, `item con seguro: ${JSON.stringify({ base: item.baseUnitCostPyg, seguro: item.insurancePyg, real: item.unitCostPyg })}`)
  return 'sin seguro ok'
})

// ── Medios ──────────────────────────────────────────────────────────
await probe('medios: Pix en BRL con llave y snapshot completo', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} pix`, kind: 'PIX', currency: 'BRL', holder: 'Titular QA', pixKey: `qa-${sufijo}@example.com` })).data
  const producto = await crearProducto(140000, 60000)
  const orden = await crearOrden(producto, [{ accountId: cuenta.id, originalAmount: '20', exchangeRatePyg: '7000', amountPyg: 140000, method: 'PIX', status: 'CONFIRMED' }])
  check(orden.status === 201, `orden ${orden.status}: ${JSON.stringify(orden.data)}`)
  const pago = orden.data.payments[0]
  check(pago.currency === 'BRL' && pago.amountPyg === 140000, `pago ${JSON.stringify(pago)}`)
  check(pago.accountSnapshot?.pixKey === `qa-${sufijo}@example.com`, 'snapshot sin llave Pix')
  return 'BRL + llave en snapshot'
})

await probe('medios: USDT requiere cotización y canje requiere ficha', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} usdt`, kind: 'CRYPTO', currency: 'USD', holder: 'Titular QA', reference: 'TRC20 · QA' })).data
  const producto = await crearProducto(100000, 60000)
  const sinCotizacion = await crearOrden(producto, [{ accountId: cuenta.id, originalAmount: '15', amountPyg: 105000, method: 'CRYPTO', status: 'CONFIRMED' }])
  check(sinCotizacion.status === 400, `USDT sin cotización debía 400: ${sinCotizacion.status}`)
  const canje = (await crearCuenta({ name: `QA 204 ${sufijo} canje`, kind: 'TRADE_IN', currency: 'PYG', reference: 'Equipo recibido' })).data
  const producto2 = await crearProducto(100000, 60000)
  const sinFicha = await crearOrden(producto2, [{ accountId: canje.id, originalAmount: '50000', exchangeRatePyg: '1', amountPyg: 50000, method: 'TRADE_IN', status: 'CONFIRMED' }])
  check(sinFicha.status === 400, `canje sin ficha debía 400: ${sinFicha.status}`)
  return 'ambos rechazos ok'
})

await probe('medios: método tiene que coincidir con la cuenta', async () => {
  const cuenta = (await crearCuenta({ name: `QA 204 ${sufijo} card2`, kind: 'CARD', currency: 'PYG', processor: 'Dinelco' })).data
  const producto = await crearProducto(100000, 60000)
  const r = await crearOrden(producto, [{ accountId: cuenta.id, originalAmount: '100000', exchangeRatePyg: '1', amountPyg: 100000, method: 'TRANSFER', status: 'CONFIRMED' }])
  check(r.status === 400 || r.status === 409, `método cruzado debía fallar: ${r.status} ${JSON.stringify(r.data)}`)
  return `${r.status}`
})

console.log('\n=== RESUMEN ===')
for (const r of resultados) console.log(`${r.ok ? 'OK   ' : 'FALLO'} ${r.probe}${r.ok && r.detalle ? ` — ${r.detalle}` : ''}${!r.ok ? ` — ${r.detalle}` : ''}`)
console.log(`\n${resultados.filter((r) => r.ok).length}/${resultados.length} probes OK`)
