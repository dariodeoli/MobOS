// Historiales de las fichas en la demo: cliente (todos los tipos, filtros,
// pedido con productos y referencia), proveedor (compras, pagos, saldo y
// productos) y funcionario (ventas, comisiones y totales). Sin red ni storage.
import test from 'node:test'
import assert from 'node:assert/strict'

const memoriaSesion = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => (memoriaSesion.has(clave) ? memoriaSesion.get(clave) : null),
  setItem: (clave, valor) => memoriaSesion.set(clave, String(valor)),
  removeItem: (clave) => memoriaSesion.delete(clave),
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.window = { location: { pathname: '/demo' }, addEventListener: () => {}, dispatchEvent: () => {} }

const { listarClientesDemo, buildDemoTimeline } = await import('../demoClientes.js')
const { grupoEvento, filtrarEventos, GRUPOS_HISTORIAL } = await import('../historialCliente.js')
const { historialDemo } = await import('./historial.js')
const { DEMO_PURCHASES } = await import('./compras.js')
const { EQUIPO_DEMO } = await import('./iphones.js')

test('los clientes de la demo cubren compras, pagos, saldo, cotizaciones, taller, garantías, trade-in, mensajes y notas', () => {
  const grupos = new Set(listarClientesDemo().flatMap((cliente) => buildDemoTimeline(cliente).map((evento) => grupoEvento(evento))))
  for (const grupo of GRUPOS_HISTORIAL.map((item) => item.key).filter((key) => key !== 'todo')) assert.ok(grupos.has(grupo), `ningún cliente demo tiene eventos de ${grupo}`)
})

test('cada pedido de la cronología demo trae sus productos, montos coherentes y referencia para abrirlo', () => {
  let vistos = 0
  for (const cliente of listarClientesDemo()) {
    const pedidos = cliente.demoProfile?.orders || []
    for (const evento of buildDemoTimeline(cliente).filter((item) => item.type === 'order' && item.ref?.kind === 'order' && item.amounts)) {
      const pedido = pedidos.find((p) => p.id === evento.ref.id)
      assert.ok(pedido, `${cliente.id}: el pedido ${evento.ref.id} no existe en su ficha`)
      assert.equal(evento.amounts.totalPyg, Number(pedido.totalPyg) || 0)
      if (pedido.status === 'CANCELLED') assert.equal(evento.amounts.balancePyg, 0)
      else assert.equal(evento.amounts.paidPyg + evento.amounts.balancePyg, evento.amounts.totalPyg)
      assert.equal(evento.items.length, (pedido.items || []).length)
      vistos += 1
    }
  }
  assert.ok(vistos > 20, `pocos pedidos con detalle: ${vistos}`)
})

test('filtrar por tipo y período devuelve solo lo pedido', () => {
  const cliente = listarClientesDemo().find((c) => (c.demoProfile?.orders || []).length >= 3)
  const eventos = buildDemoTimeline(cliente)
  const compras = filtrarEventos(eventos, { grupos: ['compras'] })
  assert.ok(compras.length > 0 && compras.every((e) => grupoEvento(e) === 'compras'))
  const reciente = filtrarEventos(eventos, { periodo: '30' })
  assert.ok(reciente.length <= eventos.length)
  assert.ok(reciente.every((e) => Date.now() - new Date(e.createdAt).getTime() <= 30 * 86400000 + 60000))
})

test('proveedor demo: compras, pagos, saldo pendiente y productos comprados cierran con las compras', () => {
  const ids = [...new Set(DEMO_PURCHASES.map((compra) => compra.supplierId))]
  assert.ok(ids.length > 0)
  for (const id of ids) {
    const { events, summary } = historialDemo(`/api/suppliers/${id}/history`, { compras: DEMO_PURCHASES })
    const propias = DEMO_PURCHASES.filter((compra) => compra.supplierId === id)
    assert.ok(events.some((e) => e.type === 'purchase'), `${id}: sin compras`)
    assert.equal(summary.totalPurchasedPyg, propias.reduce((suma, compra) => suma + Number(compra.finalCostPyg || 0), 0))
    assert.equal(summary.outstandingPyg, propias.reduce((suma, compra) => suma + Number(compra.outstandingPyg || 0), 0))
    assert.ok(summary.products.length > 0, `${id}: sin productos comprados`)
    assert.equal(summary.products.reduce((suma, p) => suma + p.quantity, 0), propias.flatMap((c) => c.lines).reduce((suma, l) => suma + l.quantity, 0))
    for (let i = 1; i < events.length; i += 1) assert.ok(new Date(events[i - 1].createdAt) >= new Date(events[i].createdAt), `${id}: desordenado`)
  }
})

test('funcionario demo: ventas propias con su pedido y totales que coinciden', () => {
  const vendedor = EQUIPO_DEMO.find((p) => p.id === 'demo-user-vendedor')
  const ventas = [
    { id: 'v1', vendedorId: vendedor.id, creadoEn: new Date(Date.now() - 86400000).toISOString(), numero: 'MO-1', total: 1500000, precio: 1500000, precioCosto: 1200000 },
    { id: 'v2', vendedorId: vendedor.id, creadoEn: new Date(Date.now() - 2 * 86400000).toISOString(), numero: 'MO-2', total: 500000, precio: 500000, precioCosto: 400000 },
    { id: 'v3', vendedorId: 'otro', creadoEn: new Date().toISOString(), numero: 'MO-3', total: 9, precio: 9, precioCosto: 0 },
  ]
  const { events, summary } = historialDemo(`/api/users/${vendedor.id}/history`, { ventas })
  assert.equal(summary.ventas, 2)
  assert.equal(summary.ventasPyg, 2000000)
  const filas = events.filter((e) => e.type === 'sale' && e.ref)
  assert.deepEqual(filas.map((e) => e.ref.id).sort(), ['v1', 'v2'])
  assert.ok(events.some((e) => e.action === 'Comisión liquidada'))
  assert.deepEqual(historialDemo('/api/users/no-existe/history').events, [])
})
