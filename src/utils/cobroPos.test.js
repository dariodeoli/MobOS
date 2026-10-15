import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoClienteBloqueado, detalleCredito, puedeOfrecerCredito, datosEncomienda, direccionDeEntrega, notasDeEntrega, empresasRecientes, entregaCobraEnvio, montoEnvioEfectivo, pagaAlRecibirVigente, recordarEmpresa } from './cobroPos.js'

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

test('delivery: la dirección guardada o escrita y el repartidor van en las indicaciones (#461)', () => {
  const direcciones = [{ id: 'a1', address: 'Calle 1 123', city: 'Asunción' }]
  assert.equal(direccionDeEntrega({ entregaDireccionId: 'a1' }, direcciones), 'Calle 1 123, Asunción')
  assert.equal(direccionDeEntrega({ entregaDireccion: '  Av. Mcal. López 456 ' }, direcciones), 'Av. Mcal. López 456')
  assert.equal(direccionDeEntrega({ entregaDireccionId: 'ajena' }, direcciones), '')
  assert.equal(notasDeEntrega('Delivery', { observacion: 'Llamar antes', entregaDireccionId: 'a1' }, direcciones), 'Llamar antes · Entregar en: Calle 1 123, Asunción')
  assert.equal(notasDeEntrega('Delivery', { entregaDireccion: 'X' }, [], { name: 'Marcos' }), 'Entregar en: X · Repartidor: Marcos')
  assert.equal(notasDeEntrega('Retiro en tienda', { observacion: 'Nota', entregaDireccion: 'X' }, [], { name: 'Marcos' }), 'Nota')
  assert.equal(notasDeEntrega('Delivery', {}, []), '')
})

test('crédito / fiado: se ofrece con cualquier cliente de la ficha y dice el límite o que falta autorización (#461)', () => {
  assert.equal(puedeOfrecerCredito({ id: 'c1' }), true)
  assert.equal(puedeOfrecerCredito({ name: 'Sin ficha' }), false)
  assert.equal(puedeOfrecerCredito(null), false)
  assert.equal(detalleCredito({ id: 'c1', creditLimitPyg: 5000000, creditDays: 30 }, n => `Gs ${n}`), 'límite Gs 5000000 · 30 días')
  assert.match(detalleCredito({ id: 'c1' }), /sin límite cargado/)
})
