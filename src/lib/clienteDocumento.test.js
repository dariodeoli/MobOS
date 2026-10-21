import assert from 'node:assert/strict'
import test from 'node:test'
import { detectarDocumento, fichaTieneDocumento, nombreVisibleDesdeRuc } from './clienteDocumento.js'

test('personas: «APELLIDOS, NOMBRES» pasa a «Nombres Apellidos» sin coma', () => {
  assert.equal(nombreVisibleDesdeRuc('PEREZ GOMEZ, JUAN CARLOS'), 'Juan Carlos Perez Gomez')
  assert.ok(!nombreVisibleDesdeRuc('LOPEZ, ANA').includes(','))
  assert.equal(nombreVisibleDesdeRuc('LOPEZ, ANA'), 'Ana Lopez')
})

test('empresas: la razón social va tal cual', () => {
  assert.equal(nombreVisibleDesdeRuc('DISTRIBUIDORA AURORA S.A.'), 'DISTRIBUIDORA AURORA S.A.')
  assert.equal(nombreVisibleDesdeRuc('COMERCIAL, IMPORTADORA S.R.L.'), 'COMERCIAL, IMPORTADORA S.R.L.')
  assert.equal(nombreVisibleDesdeRuc('  '), '')
})

test('detectarDocumento: CI/RUC válidos, DV inválido y texto que no es documento', () => {
  assert.equal(detectarDocumento('5215244').identity.fullRuc, '5215244-8')
  assert.equal(detectarDocumento('5.215.244').estado, 'valido')
  assert.equal(detectarDocumento('5215244-8').identity.fullRuc, '5215244-8')
  assert.equal(detectarDocumento('5215244-1').estado, 'dv_invalido')
  assert.equal(detectarDocumento('5215244-'), null)
  assert.equal(detectarDocumento('1234'), null)
  assert.equal(detectarDocumento('0981123456'), null)
  assert.equal(detectarDocumento('Juan Perez'), null)
  assert.equal(detectarDocumento('juan@correo.com'), null)
})

test('fichaTieneDocumento compara la base con o sin DV', () => {
  const identity = detectarDocumento('5215244').identity
  assert.equal(fichaTieneDocumento({ document: '5215244-8' }, identity), true)
  assert.equal(fichaTieneDocumento({ document: '5.215.244' }, identity), true)
  assert.equal(fichaTieneDocumento({ document: '9999999' }, identity), false)
})
