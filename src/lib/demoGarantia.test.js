// #240 §3/§4 — Garantía pública en modo demo: la credencial del QR se arma con
// los datos del navegador (portal → «Ver garantía») sin tocar el API real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoGarantiaPayload } from './demoGarantia.js'

test('la garantía demo sale con cobertura, días restantes y la tienda', () => {
  const garantia = demoGarantiaPayload('demo-garantia-lucia')
  assert.ok(garantia, 'el token demo de Lucía tiene garantía')
  assert.equal(garantia.customerName, 'Lucía Fernández')
  assert.match(garantia.productName, /iPhone 15/)
  assert.equal(garantia.serial, '356789012345678')
  assert.equal(garantia.status, 'DIAGNOSIS')
  assert.ok(garantia.daysRemaining > 0, 'la garantía demo está vigente')
  assert.match(garantia.coverage, /Fallas de fábrica/)
  assert.match(garantia.exclusions, /golpes|líquidos/i)
  assert.equal(garantia.store.name, 'Aurora Móviles')
  assert.equal(garantia.orderNumber, 'MOB-0008', 'la credencial enlaza la compra del serial')
  assert.equal(garantia.demo, true)
})

test('un token de garantía que no existe no devuelve nada', () => {
  assert.equal(demoGarantiaPayload('demo-garantia-nadie'), null)
  assert.equal(demoGarantiaPayload(''), null)
})
