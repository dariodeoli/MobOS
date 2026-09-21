import assert from 'node:assert/strict'
import test from 'node:test'
import { borradorInicial, claveDeOperacion, inicializarBorradores } from './auditoriaEfectivo.js'

// #199: un refresco de la auditoría de efectivo no pisa lo que la persona ya
// eligió; solo agrega las operaciones nuevas.

const operacion = (over = {}) => ({ id: 'op-1', kind: 'PAYMENT', status: 'PENDING', notaAuditoria: '', ...over })

test('la clave y el borrador inicial siguen el contrato de la pantalla', () => {
  assert.equal(claveDeOperacion(operacion()), 'PAYMENT:op-1')
  assert.deepEqual(borradorInicial(operacion({ status: 'VERIFIED', notaAuditoria: 'ok' })), { status: 'VERIFIED', note: 'ok' })
  assert.deepEqual(borradorInicial(undefined), { status: 'PENDING', note: '' })
})

test('conserva el borrador existente y agrega los nuevos', () => {
  const actuales = { 'PAYMENT:op-1': { status: 'DIFFERENCE', note: 'Faltó vuelto' } }
  const resultado = inicializarBorradores([
    operacion({ status: 'PENDING' }),
    operacion({ id: 'op-2', kind: 'MOVEMENT', status: 'VERIFIED', notaAuditoria: 'auditado' }),
  ], actuales)
  assert.deepEqual(resultado['PAYMENT:op-1'], { status: 'DIFFERENCE', note: 'Faltó vuelto' })
  assert.deepEqual(resultado['MOVEMENT:op-2'], { status: 'VERIFIED', note: 'auditado' })
})

test('tolera listas y borradores inválidos', () => {
  assert.deepEqual(inicializarBorradores(null, null), {})
  assert.deepEqual(inicializarBorradores([operacion()], null)['PAYMENT:op-1'], { status: 'PENDING', note: '' })
  assert.deepEqual(inicializarBorradores([], { viejo: {} }), {})
})
