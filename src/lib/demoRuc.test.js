// Mock de RUC de la demo (#234): validación espejo del backend, dígito
// verificador, razón social ficticia estable y marcado de simulado. Sin
// navegador y sin red: no debe tocar `fetch` ni el almacenamiento.
import test from 'node:test'
import assert from 'node:assert/strict'

const { DEMO_RUC_DELAY_MS, consultarRucDemo, digitoVerificadorRuc, normalizarRucDemo } = await import('./demoRuc.js')

test('valida el RUC como el backend y agrega el dígito verificador', () => {
  assert.equal(normalizarRucDemo('80012345-6').fullRuc, '80012345-6')
  assert.equal(normalizarRucDemo('800.123.45 - 6').fullRuc, '80012345-6')
  assert.equal(normalizarRucDemo('80012345').fullRuc, `80012345-${digitoVerificadorRuc('80012345')}`)
  for (const invalido of ['', '1234', 'abc', '80012345-67', '80012345-6-7']) {
    assert.equal(normalizarRucDemo(invalido).ok, false, `${invalido} debe rechazarse`)
    assert.match(String(normalizarRucDemo(invalido).error), /RUC/)
  }
})

test('el dígito verificador sigue el módulo 11 paraguayo', () => {
  assert.equal(digitoVerificadorRuc('80012345'), '0')
  const completo = `80012345${digitoVerificadorRuc('80012345')}`
  assert.equal(digitoVerificadorRuc(completo).length, 1)
})

test('la consulta simulada no llama al API y se marca como simulada', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => { throw new Error('la demo no debe llamar al API') }
  try {
    const resultado = await consultarRucDemo('80012345-6')
    assert.equal(resultado.simulado, true)
    assert.equal(resultado.fullRuc, '80012345-6')
    assert.match(resultado.name, /[A-Z]/)
    // Estable para el mismo RUC: dos consultas seguidas dan el mismo nombre.
    assert.equal((await consultarRucDemo('80012345-6')).name, resultado.name)
  } finally {
    globalThis.fetch = original
  }
  assert.ok(DEMO_RUC_DELAY_MS > 0, 'la demo muestra «Consultando…» con una espera corta')
})

test('un RUC inválido se rechaza sin resultado', async () => {
  await assert.rejects(() => consultarRucDemo('123'), /RUC/)
})
