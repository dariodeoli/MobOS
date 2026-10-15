import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorModelo, estadoPlanilla, familiaCondicion, fechaCorta, garantiaPlanilla, imeiCorto, modeloPlanilla,
  quienVerifico, siglaUbicacion, textoBateria, textoGrupo, textoReserva, vistaUnidadesValida,
} from './planilla.js'

const AHORA = new Date('2026-10-14T12:00:00')
const unidad = (n, extra = {}) => ({ id: `u${n}`, kind: 'unit', name: 'iPhone 15 Pro', model: 'iPhone 15 Pro 256GB', condition: 'NEW', status: 'disponible', serial: `35690000000000${n}`, createdAt: `2026-10-0${n}T10:00:00Z`, ...extra })

test('condición: NEW es verde y todo lo demás (usado, reacondicionado) es semi nuevo', () => {
  assert.equal(familiaCondicion({ condition: 'NEW' }), 'new')
  assert.equal(familiaCondicion({ condition: 'USED' }), 'used')
  assert.equal(familiaCondicion({ condition: 'REFURBISHED' }), 'used')
})

test('reserva: «Atajando · cliente · vence dd/mm» con lo que haya', () => {
  assert.equal(textoReserva({ reservationCustomer: 'Edgar', reservedUntil: '2026-10-18T15:00:00' }, AHORA), 'Atajando · Edgar · vence 18/10')
  assert.equal(textoReserva({ reservationCustomer: 'Edgar' }, AHORA), 'Atajando · Edgar')
  assert.equal(textoReserva({}, AHORA), 'Atajando')
  assert.equal(textoReserva({ reservedUntil: '2027-01-05T10:00:00' }, AHORA), 'Atajando · vence 05/01/27')
})

test('estado: disponible sin chip; préstamo sale de la ubicación; el resto por estado', () => {
  assert.equal(estadoPlanilla(unidad(1), AHORA), null)
  assert.equal(estadoPlanilla(unidad(1, { locationIcon: 'PRESTAMO', locationName: 'Préstamo' }), AHORA).clave, 'prestamo')
  assert.equal(estadoPlanilla(unidad(1, { status: 'reservado', reservationCustomer: 'Edgar' }), AHORA).etiqueta, 'Atajando · Edgar')
  assert.equal(estadoPlanilla(unidad(1, { status: 'vendido' }), AHORA).clave, 'vendido')
  assert.equal(estadoPlanilla({ kind: 'product', status: 'disponible' }, AHORA), null)
})

test('garantía: mes/año, aviso a menos de 30 días y «expirada»', () => {
  assert.deepEqual(garantiaPlanilla(null, AHORA).texto, '')
  assert.deepEqual(garantiaPlanilla('2027-01-01T00:00:00.000Z', AHORA), { texto: 'ene 2027', tono: 'ok', detalle: 'Garantía hasta ene 2027' })
  // El mes de vencimiento cubre todo el mes: en octubre, «oct 2026» vence a fin de mes (17 días).
  assert.equal(garantiaPlanilla('2026-10-01T00:00:00.000Z', AHORA).tono, 'warn')
  assert.equal(garantiaPlanilla('2026-11-01T00:00:00.000Z', AHORA).tono, 'ok')
  assert.equal(garantiaPlanilla('2026-12-01T00:00:00.000Z', AHORA).tono, 'ok')
  assert.deepEqual(garantiaPlanilla('2026-09-01T00:00:00.000Z', AHORA).texto, 'expirada')
})

test('agrupa por modelo con disponibles, nuevos primero y accesorios al final', () => {
  const grupos = agruparPorModelo([
    unidad(1, { condition: 'USED' }),
    unidad(2),
    unidad(3, { status: 'reservado' }),
    unidad(4, { name: 'iPhone 13', model: 'iPhone 13 128GB' }),
    { id: 'a', kind: 'product', name: 'Funda', model: '', status: 'disponible', quantity: 5, createdAt: '2026-10-01T00:00:00Z' },
  ])
  assert.deepEqual(grupos.map((grupo) => grupo.nombre), ['iPhone 13 128GB', 'iPhone 15 Pro 256GB', 'Accesorios y otros (sin IMEI)'])
  const pro = grupos[1]
  assert.deepEqual([pro.disponibles, pro.total], [2, 3])
  assert.deepEqual(pro.items.map((fila) => fila.id), ['u3', 'u2', 'u1'])
  assert.equal(textoGrupo(pro), '2 disponibles de 3')
  assert.equal(textoGrupo({ disponibles: 1, total: 1 }), '1 disponible')
})

test('textos cortos: modelo, batería + ciclos, IMEI corto, sigla, verificó y fecha', () => {
  assert.equal(modeloPlanilla({ name: 'iPhone 15', model: 'iPhone 15 128GB Negro' }), 'iPhone 15 128GB Negro')
  assert.equal(modeloPlanilla({ name: 'iPhone 15', model: '128GB' }), 'iPhone 15 128GB')
  assert.equal(textoBateria({ batteryHealth: 94, batteryCycles: 212 }), '94% · 212 ciclos')
  assert.equal(textoBateria({ batteryHealth: 94, batteryCycles: 212 }, { corto: true }), '94% · 212c')
  assert.equal(textoBateria({ batteryHealth: 100 }), '100%')
  assert.equal(textoBateria({}), '')
  assert.equal(imeiCorto('356900000000123'), '…000123')
  assert.equal(imeiCorto(''), '—')
  assert.equal(siglaUbicacion({ locationCode: 'd1' }), 'D1')
  assert.equal(siglaUbicacion({ locationName: 'Piso de venta' }), 'PDV')
  assert.equal(siglaUbicacion({ locationName: 'Vitrina' }), 'VIT')
  assert.equal(siglaUbicacion({}), '')
  assert.equal(quienVerifico({ verifiedBy: 'vpc' }), 'VPC')
  assert.equal(quienVerifico({ verifiedBy: 'Hernán Acosta' }), 'Hernán')
  assert.equal(fechaCorta('2026-10-05T12:00:00', AHORA), '05/10')
  assert.equal(fechaCorta('2025-03-05T12:00:00', AHORA), '05/03/25')
  assert.equal(fechaCorta(null, AHORA), '')
})

test('preferencia de vista: solo tarjetas o planilla', () => {
  assert.equal(vistaUnidadesValida('planilla'), true)
  assert.equal(vistaUnidadesValida('lista'), false)
})
