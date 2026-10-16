import test from 'node:test'
import assert from 'node:assert/strict'
import { crearRetornoGoogle, esRetornoGoogle } from './inicioSesion.js'

const diferida = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
test('ready se reconoce solo en login y no autoriza por sí mismo', () => {
  assert.equal(esRetornoGoogle({ pathname: '/login', search: '?google=ready&next=/ventas' }), true)
  for (const location of [{ pathname: '/ventas', search: '?google=ready' }, { pathname: '/login', search: '?google=false' }, undefined]) assert.equal(esRetornoGoogle(location), false)
})
test('StrictMode comparte POST y la segunda suscripción recibe la continuación', async () => {
  let generacion = 0, llamadas = 0
  const inicio = crearRetornoGoogle(() => generacion), espera = diferida()
  const soltar = inicio.suscribir()
  const primera = inicio.ejecutar(async ({ aplicarContexto }) => { llamadas++; await espera.promise; return aplicarContexto(() => { generacion++; return 'PIN' }) })
  soltar()
  const soltarSegunda = inicio.suscribir()
  const segunda = inicio.ejecutar(() => assert.fail('POST duplicado'))
  await Promise.resolve()
  espera.resolve()
  assert.equal(await primera, 'PIN'); assert.equal(await segunda, 'PIN'); assert.equal(llamadas, 1)
  assert.equal(inicio.vigente(), true); soltarSegunda()
})
for (const motivo of ['tenant A→B→A', 'sucursal', 'rol/permisos', 'logout']) test(`respuesta tardía de ${motivo} no aplica DTO`, async () => {
  let generacion = 0, aplicado = false
  const inicio = crearRetornoGoogle(() => generacion), espera = diferida()
  inicio.suscribir()
  const pendiente = inicio.ejecutar(async ({ aplicarContexto }) => { await espera.promise; return aplicarContexto(() => { aplicado = true }) })
  await Promise.resolve(); generacion += motivo === 'tenant A→B→A' ? 2 : 1; espera.resolve()
  await assert.rejects(pendiente, error => error.code === 'CONTEXT_CHANGED')
  assert.equal(aplicado, false)
})
test('desmontaje definitivo cancela el intento antes de persistir', async () => {
  const inicio = crearRetornoGoogle(() => 0), espera = diferida(); let aplicado = false
  const soltar = inicio.suscribir()
  const pendiente = inicio.ejecutar(async ({ aplicarContexto }) => { await espera.promise; return aplicarContexto(() => { aplicado = true }) })
  await Promise.resolve(); soltar(); await Promise.resolve(); espera.resolve()
  await assert.rejects(pendiente, error => error.code === 'CONTEXT_CHANGED'); assert.equal(aplicado, false)
})
test('desmontar durante selección posterior al primer resultado también cancela', async () => {
  const inicio = crearRetornoGoogle(() => 0)
  const soltar = inicio.suscribir()
  await inicio.ejecutar(({ aplicarContexto }) => aplicarContexto(() => ({ storeRequired: true })))
  soltar(); await Promise.resolve()
  assert.throws(() => inicio.aplicarContexto(() => assert.fail('DTO tardío')), error => error.code === 'CONTEXT_CHANGED')
})
