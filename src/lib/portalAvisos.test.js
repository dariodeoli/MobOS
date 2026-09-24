// #240 → portal: los avisos de la cuenta derivan de lo que el portal ya
// muestra; la misma función alimenta la cuenta real y la demo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDeCuenta } from './portalAvisos.js'
import { demoCuentaPayload } from './demoClientes.js'

const AHORA = Date.parse('2026-09-23T12:00:00.000Z')
const DIA = 86400000
const enDias = (dias) => new Date(AHORA + dias * DIA).toISOString()

const base = (extra = {}) => ({ dueDates: [], orders: [], servicios: [], warranties: [], ...extra })

test('sin nada pendiente no hay avisos', () => {
  assert.deepEqual(avisosDeCuenta(null), [])
  assert.deepEqual(avisosDeCuenta(base()), [])
  assert.deepEqual(avisosDeCuenta(base({ dueDates: [{ orderNumber: 'MOB-0001', dueAt: enDias(10), pendingPyg: 100000 }] })), [])
})

test('el pago vencido va primero y con tono de alerta', () => {
  const avisos = avisosDeCuenta(base({
    dueDates: [
      { orderNumber: 'MOB-0001', dueAt: enDias(-3), pendingPyg: 150000 },
      { orderNumber: 'MOB-0002', dueAt: enDias(2), pendingPyg: 50000 },
    ],
    orders: [{ orderNumber: 'MOB-0003', fulfillmentStatus: 'IN_TRANSIT' }],
  }), AHORA)
  assert.equal(avisos.length, 3)
  assert.equal(avisos[0].tipo, 'pago_vencido')
  assert.equal(avisos[0].tono, 'bad')
  assert.match(avisos[0].titulo, /MOB-#0001/)
  assert.match(avisos[0].detalle, /Venció el/)
  assert.match(avisos[0].detalle, /150\.000/)
  assert.equal(avisos[1].tipo, 'pago_por_vencer')
  assert.match(avisos[1].titulo, /en 2 días/)
  assert.equal(avisos[2].tipo, 'pedido_en_camino')
  assert.equal(avisos[2].destino, '#pedidos')
})

test('vence hoy y vence en 7 días entran; en 8 no', () => {
  const hoy = avisosDeCuenta(base({ dueDates: [{ orderNumber: 'MOB-0001', dueAt: enDias(0), pendingPyg: 1000 }] }), AHORA)
  assert.match(hoy[0].titulo, /vence hoy/)
  const siete = avisosDeCuenta(base({ dueDates: [{ orderNumber: 'MOB-0001', dueAt: enDias(7), pendingPyg: 1000 }] }), AHORA)
  assert.equal(siete[0].tipo, 'pago_por_vencer')
  const ocho = avisosDeCuenta(base({ dueDates: [{ orderNumber: 'MOB-0001', dueAt: enDias(8), pendingPyg: 1000 }] }), AHORA)
  assert.equal(ocho.length, 0)
})

test('el taller y los pedidos listos para retirar avisan con atajo a su sección', () => {
  const avisos = avisosDeCuenta(base({
    servicios: [{ serviceNumber: 'OS-0004', device: 'iPhone 12', status: 'LISTO', statusLabel: 'Listo para retirar' }],
    orders: [{ orderNumber: 'MOB-0004', fulfillmentStatus: 'READY_FOR_PICKUP' }],
  }), AHORA)
  assert.equal(avisos.length, 2)
  assert.ok(avisos.every((aviso) => aviso.tipo === 'listo_para_retirar'))
  assert.equal(avisos[0].destino, '#servicio-tecnico')
  assert.match(avisos[0].titulo, /iPhone 12/)
  assert.equal(avisos[1].destino, '#pedidos')
  assert.match(avisos[1].titulo, /MOB-#0004/)
})

test('la reserva por vencer entra como aviso accionable', () => {
  const porVencer = avisosDeCuenta(base({ reservas: [{ serial: 'A1', model: 'iPhone 13', reservedUntil: enDias(2) }] }), AHORA)
  assert.equal(porVencer[0].tipo, 'reserva_por_vencer')
  assert.equal(porVencer[0].tono, 'warn')
  assert.match(porVencer[0].titulo, /vence en 2 días/)
  assert.equal(porVencer[0].destino, '#reservas')
  const vencida = avisosDeCuenta(base({ reservas: [{ serial: 'A1', model: 'iPhone 13', reservedUntil: enDias(0) }] }), AHORA)
  assert.equal(vencida[0].tono, 'bad')
  assert.match(vencida[0].titulo, /vence hoy/)
  const lejos = avisosDeCuenta(base({ reservas: [{ serial: 'A1', model: 'iPhone 13', reservedUntil: enDias(10) }] }), AHORA)
  assert.equal(lejos.length, 0)
  // La reserva va antes que los pedidos en camino (accionable).
  const orden = avisosDeCuenta(base({ reservas: [{ serial: 'A1', model: 'iPhone 13', reservedUntil: enDias(1) }], orders: [{ orderNumber: 'MOB-0003', fulfillmentStatus: 'IN_TRANSIT' }] }), AHORA)
  assert.equal(orden[0].tipo, 'reserva_por_vencer')
})

test('la garantía avisa si está vencida o vence dentro de 30 días', () => {
  const porVencer = avisosDeCuenta(base({ warranties: [{ serial: 'A1', description: 'iPhone 15', daysRemaining: 12 }] }), AHORA)
  assert.equal(porVencer[0].tipo, 'garantia_por_vencer')
  assert.match(porVencer[0].titulo, /en 12 días/)
  assert.equal(porVencer[0].destino, '#garantias')
  const vencida = avisosDeCuenta(base({ warranties: [{ serial: 'A1', description: 'iPhone 15', daysRemaining: 0 }] }), AHORA)
  assert.match(vencida[0].titulo, /venció/i)
  assert.equal(vencida[0].tono, 'bad')
  const lejos = avisosDeCuenta(base({ warranties: [{ serial: 'A1', daysRemaining: 120 }] }), AHORA)
  assert.equal(lejos.length, 0)
})

test('la cuenta demo muestra avisos con la misma lógica', () => {
  // El demo arma sus fechas con el ahora real: se evalúa con ese mismo ahora
  // (un AHORA fijo envejece y el aviso deja de corresponder).
  const lucia = avisosDeCuenta(demoCuentaPayload('demo-demo-cliente-lucia-rapido'))
  assert.ok(lucia.some((aviso) => aviso.tipo === 'pago_por_vencer'), 'Lucía tiene un pago por vencer')
  assert.ok(lucia.some((aviso) => aviso.tipo === 'pedido_en_camino'), 'Lucía tiene el pedido en camino')
  const carlos = avisosDeCuenta(demoCuentaPayload('demo-demo-cliente-carlos-rapido'))
  assert.ok(carlos.some((aviso) => aviso.tipo === 'listo_para_retirar'), 'Carlos tiene el pedido listo para retirar')
  const maria = avisosDeCuenta(demoCuentaPayload('demo-demo-cliente-maria-completo'))
  assert.ok(maria.some((aviso) => aviso.tipo === 'garantia_por_vencer'), 'María tiene la garantía por vencer')
})
