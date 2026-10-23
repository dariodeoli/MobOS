import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoQuedan, debeLatir, desfaseReloj, diferenciaDeRetencion, estadoApartado, formatoContador,
  retenidaPorOtro, segundosRestantes, serialesDelCarrito, textoRetenida, vencimientoLocal,
} from './posRetencion.js'
import { obtenerCartId, soltarCartId } from './posCart.js'

function mockStorage() {
  const datos = new Map()
  return { getItem: k => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: k => datos.delete(k) }
}

test('el contador usa el reloj del servidor: un celular adelantado no acorta el apartado', () => {
  const servidor = Date.parse('2026-10-22T12:00:00Z')
  const celular = servidor + 3 * 60_000 // el celular va 3 minutos adelantado
  const desfase = desfaseReloj(new Date(servidor).toISOString(), celular)
  assert.equal(desfase, -3 * 60_000)
  const vence = vencimientoLocal(new Date(servidor + 300_000).toISOString(), desfase)
  assert.equal(segundosRestantes(vence, celular), 300)
  assert.equal(segundosRestantes(vence, celular + 61_000), 239)
})

test('formato m:ss y estados (advertencia por debajo de 1 min, vencido en 0)', () => {
  assert.equal(formatoContador(252), '4:12')
  assert.equal(formatoContador(59), '0:59')
  assert.equal(formatoContador(0), '0:00')
  assert.equal(estadoApartado(300), 'ok')
  assert.equal(estadoApartado(60), 'ok')
  assert.equal(estadoApartado(59), 'aviso')
  assert.equal(estadoApartado(0), 'vencido')
  assert.equal(segundosRestantes(1000, 5000), 0, 'nunca negativo')
})

test('«Retenida por Ana · 3:42» sale de reservedUntil y serverNow de la unidad', () => {
  const ahora = Date.parse('2026-10-22T12:00:00Z')
  const unidad = { serverNow: '2026-10-22T12:00:00.000Z', reservedUntil: '2026-10-22T12:03:42.000Z', reservedBy: { id: 'u2', name: 'Ana' }, status: 'RESERVED', reservationKind: 'CART_HOLD' }
  assert.equal(textoRetenida(unidad, ahora), 'Retenida por Ana · 3:42')
  assert.equal(retenidaPorOtro(unidad, 'u1'), true)
  assert.equal(retenidaPorOtro(unidad, 'u2'), false)
  assert.equal(retenidaPorOtro({ ...unidad, reservationKind: 'CUSTOMER' }, 'u1'), false, 'una reserva de cliente no es una retención de carrito')
})

test('el latido solo corre visible, en línea, con retenciones y actividad en los últimos 10 min', () => {
  const base = { visible: true, ultimaActividadMs: 1_000_000, ahoraMs: 1_000_000 + 5 * 60_000, retenciones: 1, enLinea: true }
  assert.equal(debeLatir(base), true)
  assert.equal(debeLatir({ ...base, visible: false }), false)
  assert.equal(debeLatir({ ...base, enLinea: false }), false)
  assert.equal(debeLatir({ ...base, retenciones: 0 }), false)
  assert.equal(debeLatir({ ...base, ahoraMs: 1_000_000 + 10 * 60_000 + 1 }), false)
})

test('reconciliar: se retiene lo nuevo y se libera lo que salió del carrito', () => {
  const items = [{ serials: ['A1'] }, { serials: ['B2', 'A1'] }, { serials: [] }, {}]
  assert.deepEqual(serialesDelCarrito(items), ['A1', 'B2'])
  assert.deepEqual(diferenciaDeRetencion(['A1', 'B2'], ['A1', 'C3']), { retener: ['B2'], liberar: ['C3'] })
  assert.deepEqual(diferenciaDeRetencion([], ['A1']), { retener: [], liberar: ['A1'] })
})

test('sin serial: solo aviso «Quedan N» cuando queda poco', () => {
  assert.equal(avisoQuedan(2), 'Quedan 2')
  assert.equal(avisoQuedan(3), 'Quedan 3')
  assert.equal(avisoQuedan(4), '')
  assert.equal(avisoQuedan(0), '')
})

test('cartId: uno por carrito activo, compartido entre pestañas y distinto por vendedor', () => {
  globalThis.localStorage = mockStorage()
  const a = obtenerCartId('emp-a', 'suc-1', 'vendedor-1')
  assert.match(a, /^cart-/)
  // Otra pestaña del mismo vendedor lee el mismo id (mismo localStorage).
  assert.equal(obtenerCartId('emp-a', 'suc-1', 'vendedor-1'), a)
  // Otro vendedor o sucursal: otro carrito, otro id.
  assert.notEqual(obtenerCartId('emp-a', 'suc-1', 'vendedor-2'), a)
  assert.notEqual(obtenerCartId('emp-a', 'suc-2', 'vendedor-1'), a)
  // Cerrado el carrito (cobro/vaciado/suspensión) nace uno nuevo.
  soltarCartId('emp-a', 'suc-1', 'vendedor-1')
  assert.notEqual(obtenerCartId('emp-a', 'suc-1', 'vendedor-1'), a)
  assert.equal(obtenerCartId(null, 'suc-1', 'vendedor-1'), null)
})
