// #240 ítem 3 (acceso CRM): el informe demo sale de los pedidos del navegador.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoInformePayload } from './demoInforme.js'
import { demoCuentaPayload } from './demoClientes.js'

test('el informe demo arma el equipo vendido con serial enmascarado y su venta', () => {
  const informe = demoInformePayload('356789012345678')
  assert.ok(informe, 'el serial del pedido demo MOB-0008 tiene informe')
  assert.equal(informe.store.name, 'Aurora Móviles')
  assert.match(informe.unit.model, /iPhone 15/)
  assert.equal(informe.unit.serialMasked, '3567…678')
  assert.equal(informe.unit.imeiMasked, '3567…678')
  assert.equal(informe.sale.orderNumber, 'MOB-0008')
  assert.match(informe.disclaimer, /demostración/i)
  assert.equal(informe.demo, true)
})

test('un serial que no existe no devuelve informe', () => {
  assert.equal(demoInformePayload('999999999999999'), null)
  assert.equal(demoInformePayload(''), null)
})

test('la cuenta demo lista los informes de los equipos comprados', () => {
  const cuenta = demoCuentaPayload('demo-demo-cliente-lucia-rapido')
  assert.ok(cuenta.informes.some((informe) => informe.serial === '356789012345678' && informe.orderNumber === 'MOB-0008'))
})
