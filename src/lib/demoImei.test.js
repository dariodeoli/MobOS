// Pruebas del mock funcional de IMEI del demo (#219): contrato, idempotencia y
// marcado de simulado. Sin navegador: storage falso.
import test from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: clave => (store.has(clave) ? store.get(clave) : null),
  setItem: (clave, valor) => store.set(clave, String(valor)),
  removeItem: clave => store.delete(clave),
}

const { consultasDemoImei, postDemoImei, validarImeiDemo } = await import('./demoImei.js')
const SERIAL = 'AUR0001000000000'.slice(0, 16)

test('valida igual que el backend y acepta los seriales ficticios del demo', () => {
  assert.equal(validarImeiDemo('490154203237518').ok, true)
  assert.equal(validarImeiDemo(SERIAL).ok, true)
  assert.equal(validarImeiDemo('123').ok, false)
  assert.match(String(validarImeiDemo('490154203237519').error), /Luhn/)
})

test('precheck no registra la consulta y muestra el costo', async () => {
  const precheck = await postDemoImei({ action: 'precheck', imei: SERIAL })
  assert.equal(precheck.esMock, true)
  assert.equal(precheck.costoEstimadoUsd, 0.06)
  assert.equal(precheck.servicio.precioConfirmado, true)
  assert.equal(consultasDemoImei(SERIAL).length, 0)
})

test('sin confirmación no ejecuta y con requestId no se cobra dos veces', async () => {
  await assert.rejects(() => postDemoImei({ action: 'checks', imei: SERIAL, requestId: 'r-1' }), /confirmación explícita/)
  const primera = await postDemoImei({ action: 'checks', imei: SERIAL, confirm: true, requestId: 'r-1' })
  assert.equal(primera.status, 'verificado')
  assert.equal(primera.costUsd, 0.06)
  assert.equal(primera.normalized.length, 3)
  assert.ok(primera.verificador?.nombre, 'la verificación la firma un usuario demo')
  const repetida = await postDemoImei({ action: 'checks', imei: SERIAL, confirm: true, requestId: 'r-1' })
  assert.equal(repetida.id, primera.id)
  assert.equal(consultasDemoImei(SERIAL).length, 1)
})

test('un IMEI inválido se rechaza antes de registrar', async () => {
  await assert.rejects(() => postDemoImei({ action: 'precheck', imei: '123' }), /15 dígitos/)
})
