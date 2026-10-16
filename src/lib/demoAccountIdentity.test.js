import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { limpiarMemoriaDemo } from './demoStorage.js'
import { leerIdentidadCuentaDemo, guardarIdentidadCuentaDemo } from './demoAccountIdentity.js'
beforeEach(() => limpiarMemoriaDemo())
test('perfil demo guarda por empresa y conserva fiscal raw separado sin almacenamiento real', () => {
  const raw = '  EMPRESA CONSULTADA S.A.  '
  const result = guardarIdentidadCuentaDemo('empresa-a', { name: 'Empresa consultada', ruc: '80012345-0', nameOfficial: raw, password: 'No guardar' })
  assert.deepEqual(result, { name: 'Empresa consultada', ruc: '80012345-0', nameOfficial: raw })
  assert.deepEqual(leerIdentidadCuentaDemo('empresa-b'), {})
  result.name = 'No mutar almacenamiento'
  assert.equal(leerIdentidadCuentaDemo('empresa-a').name, 'Empresa consultada')
  guardarIdentidadCuentaDemo('empresa-a', { email: 'qa@example.invalid' })
  assert.equal(leerIdentidadCuentaDemo('empresa-a').ruc, '80012345-0')
  guardarIdentidadCuentaDemo('empresa-a', { ruc: '123', nameOfficial: null })
  assert.equal(Object.hasOwn(leerIdentidadCuentaDemo('empresa-a'), 'nameOfficial'), false)
  limpiarMemoriaDemo()
  assert.deepEqual(leerIdentidadCuentaDemo('empresa-a'), {})
})
