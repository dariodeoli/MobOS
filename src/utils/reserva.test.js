import assert from 'node:assert/strict'
import test from 'node:test'
import { mensajeReserva } from './reserva.js'

// 14/10/2026 15:00 en Paraguay (UTC-3) = 18:00Z.
const ahora = Date.UTC(2026, 9, 14, 18, 0, 0)

test('la confirmación de una reserva dice qué, para quién y hasta cuándo (hora de Paraguay)', () => {
  const texto = mensajeReserva({ serials: ['356938035643809'], cliente: 'Lucía Benítez', horas: 3 }, ahora)
  assert.match(texto, /IMEI …3809 reservada para Lucía Benítez hasta 14\/10, 18:00 \(3 horas\)/)
})

test('sin cliente y varias unidades', () => {
  const texto = mensajeReserva({ serials: ['111', '222'], cliente: '', horas: 1 }, ahora)
  assert.match(texto, /^2 unidades reservadas sin cliente hasta 14\/10, 16:00 \(1 hora\)/)
})
