import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoClienteBloqueado, datosEncomienda, empresasRecientes, entregaCobraEnvio, montoEnvioEfectivo, pagaAlRecibirVigente, recordarEmpresa } from './cobroPos.js'

test('el envío solo suma con Delivery o Encomienda (#390)', () => {
  assert.equal(montoEnvioEfectivo('Delivery', '30000'), 30000)
  assert.equal(montoEnvioEfectivo('Encomienda', 15000), 15000)
  for (const tipo of ['Retiro en tienda', 'Retiro en otra sucursal', 'Envío entre sucursales', undefined])
    assert.equal(montoEnvioEfectivo(tipo, '30000'), 0, String(tipo))
  assert.equal(entregaCobraEnvio('Delivery'), true)
})

test('«Paga al recibir» nunca oculta pagos cargados (#390)', () => {
  assert.equal(pagaAlRecibirVigente(true, []), true)
  assert.equal(pagaAlRecibirVigente(true, [{ accountId: 'x' }]), false)
  assert.equal(pagaAlRecibirVigente(false, []), false)
})

test('encomienda: solo viaja con Encomienda y la dirección debe ser del cliente (#399)', () => {
  const f = { encEmpresa: ' Nuestra Señora ', encSucursal: 'Ciudad del Este', encDireccionId: 'a2' }
  const direcciones = [{ id: 'a1', address: 'X' }, { id: 'a2', address: 'Y' }]
  assert.deepEqual(datosEncomienda('Encomienda', f, direcciones), { shippingCarrier: 'Nuestra Señora', shippingBranch: 'Ciudad del Este', shippingAddressId: 'a2' })
  assert.deepEqual(datosEncomienda('Delivery', f, direcciones), {})
  assert.deepEqual(datosEncomienda('Encomienda', { ...f, encDireccionId: 'ajena' }, direcciones), { shippingCarrier: 'Nuestra Señora', shippingBranch: 'Ciudad del Este' })
  assert.deepEqual(datosEncomienda('Encomienda', {}, []), {})
})

test('aviso de cliente bloqueado con motivo (#399)', () => {
  assert.equal(avisoClienteBloqueado({ blocked: true, blockedReason: 'Deuda vencida' }), 'Cliente bloqueado: Deuda vencida')
  assert.equal(avisoClienteBloqueado({ blocked: true }), 'Cliente bloqueado')
  assert.equal(avisoClienteBloqueado({ blocked: false, blockedReason: 'x' }), '')
  assert.equal(avisoClienteBloqueado(null), '')
})

test('empresas recientes: sin repetidos, la última primero (#399)', () => {
  const mem = new Map()
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  recordarEmpresa('Nuestra Señora'); recordarEmpresa('Flecha de Oro'); recordarEmpresa('nuestra señora'); recordarEmpresa('  ')
  assert.deepEqual(empresasRecientes(), ['nuestra señora', 'Flecha de Oro'])
  delete globalThis.localStorage
})
