import assert from 'node:assert/strict'
import test from 'node:test'
import { crearConsultaEstadoAgente } from './healthAgente.js'

const sinConfig = { url: 'http://127.0.0.1:17890', token: '', impresora: '' }
const configurado = { ...sinConfig, impresora: 'ticket' }

test('sin configuración no consulta localhost; detección explícita sigue disponible', async () => {
  let llamadas = 0
  const consultar = crearConsultaEstadoAgente({ fetchImpl: async () => { llamadas++; return Response.json({ ok: true, version: '1' }) } })
  assert.deepEqual(await consultar(sinConfig), { disponible: false })
  assert.equal(llamadas, 0)
  assert.equal((await consultar(sinConfig, { forzar: true })).disponible, true)
  assert.equal(llamadas, 1)
})

test('agente ausente conserva fallback y enfría reintentos durante un minuto', async () => {
  let reloj = 0; let llamadas = 0
  const consultar = crearConsultaEstadoAgente({ now: () => reloj, fetchImpl: async () => { llamadas++; throw new Error('ECONNREFUSED') } })
  assert.deepEqual(await consultar(configurado), { disponible: false })
  reloj = 59999
  assert.deepEqual(await consultar(configurado), { disponible: false })
  assert.equal(llamadas, 1)
  await consultar(configurado, { forzar: true })
  assert.equal(llamadas, 2)
  reloj += 60000
  await consultar(configurado)
  assert.equal(llamadas, 3)
})

test('consumidores simultáneos comparten petición y la salud no cruza contexto', async () => {
  let llamadas = 0; let completar
  const consultar = crearConsultaEstadoAgente({ fetchImpl: () => { llamadas++; return new Promise(resolve => { completar = resolve }) } })
  const primera = consultar(configurado)
  const segunda = consultar(configurado)
  assert.equal(llamadas, 1)
  completar(Response.json({ ok: true }))
  assert.deepEqual(await primera, await segunda)
  const otraEmpresa = consultar(configurado, { contexto: 1 })
  assert.equal(llamadas, 2)
  completar(Response.json({ ok: true }))
  await otraEmpresa
})

test('token configurado permite consulta y sólo envía el token del puente', async () => {
  const consultar = crearConsultaEstadoAgente({ fetchImpl: async (url, options) => {
    assert.equal(url, `${sinConfig.url}/health`)
    assert.deepEqual(options.headers, { 'x-mobos-print-token': 'token-prueba' })
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json({ ok: true })
  } })
  assert.equal((await consultar({ ...sinConfig, token: 'token-prueba' })).disponible, true)
})

// Los documentos pueden pasar una impresora explícita sin guardarla en caché.
test('la acción de imprimir descubre el agente sin configuración global y comparte su caché', async () => {
  let llamadas = 0
  const consultar = crearConsultaEstadoAgente({ fetchImpl: async () => { llamadas++; return Response.json({ ok: true }) } })
  assert.equal((await consultar(sinConfig)).disponible, false)
  assert.equal(llamadas, 0)
  assert.equal((await consultar(sinConfig, { accionExplicita: true })).disponible, true)
  assert.equal((await consultar(sinConfig, { accionExplicita: true })).disponible, true)
  assert.equal(llamadas, 1)
})


test('una impresión explícita reintenta al arrancar el agente antes del minuto sin duplicar peticiones', async () => {
  let reloj = 0; let llamadas = 0; let online = false; let completar
  const consultar = crearConsultaEstadoAgente({ now: () => reloj, fetchImpl: () => {
    llamadas++
    if (!online) return Promise.reject(new Error('ECONNREFUSED'))
    return new Promise(resolve => { completar = resolve })
  } })
  assert.deepEqual(await consultar(configurado), { disponible: false })
  reloj = 1000
  online = true
  assert.deepEqual(await consultar(configurado), { disponible: false })
  assert.equal(llamadas, 1, 'el sondeo pasivo conserva el enfriamiento negativo')
  const primera = consultar(configurado, { accionExplicita: true })
  const simultanea = consultar(configurado, { accionExplicita: true })
  assert.equal(llamadas, 2, 'la impresión explícita vuelve a detectar el agente recién iniciado')
  completar(Response.json({ ok: true }))
  assert.deepEqual(await primera, { ok: true, disponible: true })
  assert.deepEqual(await simultanea, { ok: true, disponible: true })
  assert.equal((await consultar(configurado, { accionExplicita: true })).disponible, true)
  assert.equal(llamadas, 2, 'la salud positiva sigue compartida durante cinco segundos')
})
