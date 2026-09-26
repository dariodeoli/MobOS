import assert from 'node:assert/strict'
import { consolidarNecesidades } from '../lib/supply'
import { necesidadesDeVenta, necesidadDeReservaFaltante, puedeVerCliente } from '../lib/supply-demand'

// Abastecimiento F1 (#254): el vínculo venta/reserva → necesidad y los datos
// del cliente según permiso, sin tocar el stock.

// ── Venta sin stock (producto sin unidades serializadas, «sobre pedido») ────
assert.deepEqual(
  necesidadesDeVenta([{ id: 'i1', productId: 'p1', stockPending: 3, serialsPending: 0 }]),
  [{ productId: 'p1', quantity: 3, source: 'SALE_NO_STOCK', dedupeKey: 'SALE_NO_STOCK:i1', orderItemId: 'i1' }],
  'la venta sobre pedido deja su necesidad SALE_NO_STOCK con la cantidad pendiente',
)

// ── Venta serializada sin unidades/IMEI suficientes ─────────────────────────
assert.deepEqual(
  necesidadesDeVenta([{ id: 'i2', productId: 'p2', stockPending: 0, serialsPending: 2 }]),
  [{ productId: 'p2', quantity: 2, source: 'QUANTITY_OVER_STOCK', dedupeKey: 'QUANTITY_OVER_STOCK:i2', orderItemId: 'i2' }],
  'faltar unidades de un serializado deja QUANTITY_OVER_STOCK',
)

// ── Líneas completas o sin producto no generan nada ─────────────────────────
assert.deepEqual(necesidadesDeVenta([{ id: 'i3', productId: 'p3', stockPending: 0, serialsPending: 0 }]), [], 'una línea completa no genera compra')
assert.deepEqual(necesidadesDeVenta([{ id: 'i4', productId: null, stockPending: 2 }]), [], 'sin producto no hay necesidad')
assert.deepEqual(necesidadesDeVenta([]), [], 'sin líneas no hay necesidades')
const mixta = necesidadesDeVenta([
  { id: 'i1', productId: 'p1', stockPending: 1 },
  { id: 'i2', productId: 'p2', serialsPending: 4 },
  { id: 'i3', productId: 'p1', stockPending: 0, serialsPending: 0 },
])
assert.equal(mixta.length, 2, 'una necesidad por línea pendiente')
assert.ok(mixta.every((n) => n.dedupeKey.startsWith(n.source)), 'la clave de deduplicación nace de la fuente y la línea')

// ── Reservas: la unidad existente no compra; el faltante sí ─────────────────
assert.equal(necesidadDeReservaFaltante({ productId: 'p1', faltante: 0 }), null, 'reservar una unidad existente no genera compra')
assert.equal(necesidadDeReservaFaltante({ productId: null, faltante: 2 }), null)
assert.deepEqual(
  necesidadDeReservaFaltante({ productId: 'p1', faltante: 2 }),
  { productId: 'p1', quantity: 2, source: 'RESERVATION_NO_STOCK' },
  'la diferencia faltante de la reserva sí se compra',
)

// ── Cliente con permiso ─────────────────────────────────────────────────────
assert.equal(puedeVerCliente(['*']), true, 'el dueño ve el cliente')
assert.equal(puedeVerCliente(['customers:manage']), true, 'quien gestiona clientes ve el cliente')
assert.equal(puedeVerCliente(['stock:manage']), false, 'comprar sin acceso a clientes no expone el nombre')
assert.equal(puedeVerCliente([]), false)

// ── La tarjeta sabe que hay cliente aunque el nombre no viaje ───────────────
const [grupo] = consolidarNecesidades([
  { id: 'n1', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: null },
])
assert.equal(grupo.destinos[0]?.clienteOculto, true, 'sin permiso, la tarjeta marca el cliente oculto')
const [visible] = consolidarNecesidades([
  { id: 'n2', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: 'Juan Pérez' },
])
assert.equal(visible.destinos[0]?.clienteOculto, false, 'con el nombre visible no se marca oculto')
const [sinCliente] = consolidarNecesidades([
  { id: 'n3', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'MANUAL', sucursalId: 'b1', sucursal: 'Casa Central' },
])
assert.equal(sinCliente.destinos[0]?.clienteOculto, false, 'una reposición sin cliente no marca oculto')

console.log('supply-demand: venta/reserva → necesidad y cliente con permiso OK')
