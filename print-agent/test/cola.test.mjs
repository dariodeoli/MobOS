import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { crearCola } from '../cola.mjs'

// Tests unitarios del contrato honesto de la cola:
// - desconocido ≠ impreso
// - aceptado por transporte ≠ confirmado en papel
// - resultado incierto NUNCA se reintenta solo
// - un trabajo remoto deduplica por id, vacía su payload tras el intento y
//   espera en el outbox hasta que el backend acepta el reporte

const ticket = () => Buffer.from('ESC/POS de prueba').toString('base64')

function colaDe(enviar, { reintentos = 2, esperaMs = 10 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-'))
  return crearCola({ ruta: join(dir, 'cola.json'), rutaHistorial: join(dir, 'historial.json'), enviar, reintentos, esperaMs })
}

function colaEn(dir, enviar = async () => true) {
  return crearCola({ ruta: join(dir, 'cola.json'), rutaHistorial: join(dir, 'historial.json'), enviar, reintentos: 1, esperaMs: 10 })
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

test('un trabajo remoto deduplica por id, borra el payload y espera en el outbox', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-remoto-'))
  const cola = colaEn(dir)
  const job = { id: 'job-1', destination: 'lan:10.0.0.1:9100', payload: ticket(), leaseId: 'lease-1', attempts: 1, copies: 1, requestedByName: 'Dueño', reference: 'REF-1' }
  assert.deepEqual(cola.encolarRemoto(job), { encolado: true, jobId: 'job-1' })
  // El backend puede repetir el mismo trabajo: no se reimprime ni se pisa.
  assert.equal(cola.encolarRemoto(job).duplicado, true)
  // El poller imprimió: el resultado queda en el outbox y el payload local se borra.
  assert.deepEqual(cola.resultadoRemoto('job-1', { estado: 'ACEPTADO', transporte: 'directo' }), { ok: true, estado: 'aceptado' })
  const pendientes = cola.pendientesDeReporte()
  assert.equal(pendientes.length, 1)
  assert.deepEqual({ id: pendientes[0].id, leaseId: pendientes[0].leaseId, resultado: pendientes[0].resultado, transporte: pendientes[0].transporte }, { id: 'job-1', leaseId: 'lease-1', resultado: 'ACEPTADO', transporte: 'directo' })
  const guardado = JSON.parse(readFileSync(join(dir, 'cola.json'), 'utf8'))
  assert.equal(guardado[0].data, '', 'el payload no queda en disco tras el intento')
  assert.equal(guardado[0].usuario, 'Dueño')
  // Reportado: sale del outbox y queda asentado como remoto, sin confirmación local.
  assert.deepEqual(cola.marcarReportado('job-1'), { ok: true })
  assert.equal(cola.pendientesDeReporte().length, 0)
  assert.equal(cola.estado('job-1').estado, 'remoto')
  assert.equal(cola.confirmar('job-1').motivo, 'no-confirmable')
  // Un estado inválido no se acepta.
  assert.equal(cola.resultadoRemoto('job-2', { estado: 'CUALQUIERA' }).motivo, 'estado-invalido')
})

test('el dedupe remoto sobrevive al reinicio (misma cola en disco)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-reinicio-'))
  const primero = colaEn(dir)
  primero.encolarRemoto({ id: 'job-2', destination: 'usb:CUPS_FALSA', payload: ticket(), leaseId: 'lease-2' })
  primero.resultadoRemoto('job-2', { estado: 'FALLIDO', error: 'impresora apagada' })
  primero.marcarReportado('job-2')
  const reiniciada = colaEn(dir)
  assert.equal(reiniciada.encolarRemoto({ id: 'job-2', destination: 'usb:CUPS_FALSA', payload: ticket(), leaseId: 'lease-3' }).duplicado, true)
})

test('un reinicio con un reclamado sin resultado se reporta incierto y nunca se reimprime', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-reconciliar-'))
  let impresiones = 0
  const cola = colaEn(dir, async () => { impresiones += 1; return 'directo' })
  cola.encolarRemoto({ id: 'job-3', destination: 'lan:10.0.0.1:9100', payload: ticket(), leaseId: 'lease-3' })
  assert.equal(cola.reconciliarRemotos(), 1)
  const pendiente = cola.pendientesDeReporte()[0]
  assert.equal(pendiente.resultado, 'INCIERTO')
  assert.match(pendiente.error, /reinició/)
  assert.equal(cola.reconciliarRemotos(), 0, 'idempotente')
  cola.reanudar()
  await new Promise((listo) => setTimeout(listo, 30))
  assert.equal(impresiones, 0, 'el camino local nunca imprime trabajos remotos')
})

test('la limpieza y el reintento manual no tocan trabajos remotos sin reportar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-limpiar-'))
  const cola = colaEn(dir)
  cola.encolarRemoto({ id: 'job-4', destination: 'lan:10.0.0.1:9100', payload: ticket(), leaseId: 'lease-4' })
  cola.resultadoRemoto('job-4', { estado: 'FALLIDO', error: 'sin ruta' })
  assert.equal(cola.limpiarFallidos(), 0)
  assert.equal(cola.reintentarFallidos(), 0)
  assert.equal(cola.pendientesDeReporte().length, 1, 'el outbox conserva el resultado')
})

test('cola, historial y config se escriben con permisos 0600', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-cola-permisos-'))
  const cola = colaEn(dir)
  cola.encolarRemoto({ id: 'job-5', destination: 'lan:10.0.0.1:9100', payload: ticket(), leaseId: 'lease-5' })
  cola.resultadoRemoto('job-5', { estado: 'ACEPTADO' })
  cola.marcarReportado('job-5')
  const permisos = (archivo) => statSync(join(dir, archivo)).mode & 0o777
  assert.equal(permisos('cola.json'), 0o600)
  assert.equal(permisos('historial.json'), 0o600)
})

test('un trabajo sin ack del puente se confirma con el número del papel', async () => {
  // El transporte no reportó el resultado (quedó incierto), pero el operador vio
  // el ticket: la confirmación la decide el papel, no el ack del transporte.
  const cola = colaDe(async () => {
    const error = new Error('Sin respuesta del puente')
    error.incierto = true
    throw error
  })
  const resultado = await cola.encolar({ impresora: 'lan:10.0.0.1:9100', data: ticket(), validacion: '4618', sufijo: '18' })
  assert.equal(cola.estado(resultado.jobId).estado, 'incierto')
  assert.deepEqual(cola.confirmar(resultado.jobId, '00'), { ok: false, motivo: 'sufijo-incorrecto' })
  assert.deepEqual(cola.confirmar(resultado.jobId, '18'), { ok: true })
  assert.equal(cola.estado(resultado.jobId).estado, 'confirmado')
})
