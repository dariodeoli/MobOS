import assert from 'node:assert/strict'

// #148 §18: panel «Ventas por caja» — corte por sesión sobre el endpoint de
// caja: efectivo y pedidos del turno, esperado en vivo, y al cerrar el contado
// con su diferencia. Corre contra el seed del arnés (tenant-a-it).
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
const rama = 'branch-a-it'
let checks = 0
async function req(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const dia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
const hoy = dia()
const sufijo = Date.now().toString(36).toUpperCase()

// Turno del administrador: se reutiliza solo si la caja abierta es suya.
const yo = await req('/api/auth/me')
const userId = yo.user?.id || yo.id
const estado = await req(`/api/cash?branchId=${rama}`)
let turno = estado.session && estado.session.status === 'OPEN' && estado.session.openedById === userId ? estado.session : null
if (!turno) {
  await req(`/api/cash?branchId=${rama}`, 'POST', { action: 'open', openingPyg: 100000 }, 201)
  turno = (await req(`/api/cash?branchId=${rama}`)).session
}
assert.equal(turno.status, 'OPEN', 'debe quedar un turno abierto del administrador')
assert.equal(turno.openedById, userId, 'el turno es del responsable que cobra')
const apertura = Number(turno.openingPyg)

// Venta en efectivo del turno (mismo responsable que abrió la caja).
const producto = await req('/api/products', 'POST', { name: `Producto caja ${sufijo}`, sku: `CAJA-${sufijo}`, pricePyg: 300000, stock: 5 }, 201)
const orden = await req('/api/orders', 'POST', {
  items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 300000 }],
  payments: [{ method: 'CASH', amountPyg: 300000, status: 'CONFIRMED' }],
}, 201)

// El corte por sesión muestra el turno con su efectivo, pedidos y esperado.
const corte = await req(`/api/cash?sesiones=1&from=${hoy}&to=${hoy}&branchId=${rama}`)
const fila = corte.sesiones.find((sesion) => sesion.id === turno.id)
assert.ok(fila, 'el turno aparece en el corte por sesión')
assert.equal(fila.status, 'OPEN')
assert.ok(fila.openedByName, 'la sesión trae el responsable')
assert.ok(fila.efectivoPyg >= 300000, `efectivo del turno: ${fila.efectivoPyg}`)
assert.ok(fila.pagosEfectivo >= 1, 'cuenta los cobros en efectivo')
assert.ok(fila.pedidos >= 1, 'cuenta los pedidos del turno')
assert.ok(fila.ventasPyg >= 300000, `ventas del turno: ${fila.ventasPyg}`)
assert.equal(fila.esperadoPyg, apertura + fila.efectivoPyg + fila.movimientosPyg, 'esperado = apertura + efectivo + movimientos')
assert.equal(fila.diferenciaPyg, null, 'un turno abierto no tiene diferencia')

// Al cerrar con un faltante, el corte devuelve el contado y su diferencia.
const contado = fila.esperadoPyg + 5000
await req(`/api/cash?branchId=${rama}`, 'POST', { action: 'close', countedPyg: contado })
const cerrado = (await req(`/api/cash?sesiones=1&from=${hoy}&to=${hoy}&branchId=${rama}`)).sesiones.find((sesion) => sesion.id === turno.id)
assert.equal(cerrado.status, 'CLOSED')
assert.equal(cerrado.contadoPyg, contado)
assert.equal(cerrado.diferenciaPyg, 5000, 'la diferencia es contado − esperado')
assert.equal(cerrado.esperadoPyg, fila.esperadoPyg, 'el esperado auditado no cambia al cerrar')
assert.ok(cerrado.closedAt, 'el turno cerrado trae la hora de cierre')

// Bordes: rango inválido y fechas fuera de formato.
await req('/api/cash?sesiones=1&from=2026-02-30&to=2026-03-01', 'GET', null, 400)
await req('/api/cash?sesiones=1&from=hoy&to=ayer', 'GET', null, 400)

console.log(`Cash sesiones (#148 §18): ${checks} checks OK · pedido ${orden.orderNumber} · efectivo ${fila.efectivoPyg} · diferencia ${cerrado.diferenciaPyg}`)
