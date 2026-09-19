import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { crearCola } from '../cola.mjs'

// Tests unitarios del contrato honesto de la cola:
// - desconocido ≠ impreso
// - aceptado por transporte ≠ confirmado en papel
// - resultado incierto NUNCA se reintenta solo

const ticket = () => Buffer.from('ESC/POS de prueba').toString('base64')

function colaDe(enviar, { reintentos = 2, esperaMs = 10 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-'))
  return crearCola({ ruta: join(dir, 'cola.json'), rutaHistorial: join(dir, 'historial.json'), enviar, reintentos, esperaMs })
}

test('el sufijo secreto impreso valida la confirmación en papel', async () => {
  const cola = colaDe(async () => true)
  const resultado = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket(), validacion: '4535', sufijo: '5' })
  assert.equal(cola.estado(resultado.jobId).estado, 'aceptado')
  // Sufijo incorrecto: no confirma (nadie podría adivinarlo sin ver el papel).
  assert.deepEqual(cola.confirmar(resultado.jobId, '7'), { ok: false, motivo: 'sufijo-incorrecto' })
  assert.equal(cola.estado(resultado.jobId).estado, 'aceptado')
  // Sufijo correcto: confirma.
  assert.deepEqual(cola.confirmar(resultado.jobId, '5'), { ok: true })
  assert.equal(cola.estado(resultado.jobId).estado, 'confirmado')
  // Un trabajo sin sufijo guardado no exige número.
  const sinSufijo = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket() })
  assert.deepEqual(cola.confirmar(sinSufijo.jobId, ''), { ok: true })
})

test('un ID desconocido devuelve "no-encontrado", nunca "impreso"', () => {
  const cola = colaDe(async () => true)
  assert.deepEqual(cola.estado('id-que-no-existe'), { estado: 'no-encontrado' })
})

test('un envío aceptado queda como "aceptado" y solo el operador lo confirma en papel', async () => {
  const cola = colaDe(async () => true)
  const resultado = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket(), cliente: 'Caja' })
  assert.equal(resultado.encolado, false)
  assert.equal(cola.estado(resultado.jobId).estado, 'aceptado')
  assert.deepEqual(cola.confirmar(resultado.jobId), { ok: true })
  const confirmado = cola.estado(resultado.jobId)
  assert.equal(confirmado.estado, 'confirmado')
  assert.ok(confirmado.confirmadoEn, 'guarda la fecha de confirmación')
  assert.deepEqual(cola.confirmar(resultado.jobId), { ok: false, motivo: 'ya-confirmado' }, 'no se confirma dos veces')
})

test('un resultado incierto no se reintenta solo y requiere acción manual', async () => {
  let intentos = 0
  const cola = colaDe(async () => {
    intentos += 1
    const error = new Error('Timeout tras conectar')
    error.incierto = true
    throw error
  })
  const resultado = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket() })
  assert.equal(resultado.encolado, true)
  assert.equal(resultado.estado, 'incierto')
  assert.equal(cola.estado(resultado.jobId).estado, 'incierto')
  assert.equal(intentos, 1, 'no hubo reintento automático')
  assert.equal(cola.resumen().pendientes, 0)
  assert.equal(cola.resumen().inciertos, 1)
  // El reintento manual es la única vía y lo devuelve a pendiente.
  assert.equal(cola.reintentarFallidos(), 1)
  assert.equal(cola.resumen().pendientes, 1)
})

test('un fallo claro agota los reintentos y queda fallido', async () => {
  let intentos = 0
  const cola = colaDe(async () => {
    intentos += 1
    throw new Error('EHOSTUNREACH 10.0.0.1:9100')
  }, { reintentos: 1 })
  const resultado = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket() })
  assert.equal(resultado.estado, 'fallido')
  assert.equal(intentos, 1)
  assert.equal(cola.resumen().fallidos, 1)
})

test('la limpieza de fallidos no toca pendientes ni aceptados', async () => {
  let modo = 'ok'
  const cola = colaDe(async () => {
    if (modo === 'fallo') throw new Error('sin ruta')
    return true
  }, { reintentos: 1 })
  await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket() })
  modo = 'fallo'
  await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket() })
  assert.equal(cola.resumen().fallidos, 1)
  assert.equal(cola.resumen().sinConfirmar, 1)
  assert.equal(cola.limpiarFallidos(), 1)
  assert.equal(cola.resumen().fallidos, 0)
  assert.equal(cola.resumen().sinConfirmar, 1, 'el aceptado sigue esperando confirmación')
})
