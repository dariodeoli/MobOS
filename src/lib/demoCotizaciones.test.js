// #314: fixtures demo de cotizaciones y estado de la pestaña (lista, etapas,
// historial y conversión). El módulo es puro: no toca API ni storage.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listDemoCotizaciones,
  buscarDemoCotizacion,
  buscarDemoCotizacionPorToken,
  actualizarDemoCotizacion,
  crearDemoCotizacion,
  historialDemoCotizacion,
  aprobarDemoCotizacion,
} from './demoCotizaciones.js'

const etapas = (filas) => new Set(filas.map((fila) => fila.status))

test('la demo trae cotizaciones en todas las etapas del pipeline', () => {
  const filas = listDemoCotizaciones()
  assert.ok(filas.length >= 6, `esperaba varias cotizaciones demo (encontré ${filas.length})`)
  const estados = etapas(filas)
  for (const etapa of ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']) {
    assert.ok(estados.has(etapa), `falta la etapa ${etapa}`)
  }
  // Las cotizaciones que ya cuelgan de una ficha (Lucía/Carlos) entran a la lista.
  assert.ok(filas.some((fila) => fila.publicToken === 'demo-cot-lucia' && fila.customerName === 'Lucía Fernández'))
  assert.ok(filas.some((fila) => fila.publicToken === 'demo-cot-carlos' && fila.status === 'CONVERTED'))
  // Cada una tiene ítems con totales coherentes.
  for (const fila of filas) {
    assert.ok(Array.isArray(fila.items), `${fila.number} sin ítems`)
    const suma = fila.items.reduce((total, item) => total + Number(item.totalPyg || 0), 0)
    assert.equal(Number(fila.subtotalPyg), suma, `${fila.number}: subtotal = suma de ítems`)
    assert.equal(Number(fila.totalPyg), Math.max(0, suma - Number(fila.discountPyg || 0)), `${fila.number}: total con descuento`)
  }
})

test('crear una cotización demo la agrega como borrador y el borrador es interno', () => {
  const nueva = crearDemoCotizacion({
    customerName: 'Cliente de prueba',
    items: [{ description: 'Producto demo', quantity: 2, unitPricePyg: 100000 }],
    discountPyg: 50000,
  })
  assert.equal(nueva.status, 'DRAFT')
  assert.match(nueva.number, /^COT-#\d{4}$/)
  assert.equal(nueva.totalPyg, 150000)
  assert.ok(listDemoCotizaciones().some((fila) => fila.id === nueva.id), 'la nueva entra al listado')
  assert.ok(buscarDemoCotizacionPorToken(nueva.publicToken), 'el borrador tiene token para compartir')
  assert.ok(historialDemoCotizacion(nueva.id).length >= 1)
})

test('los cambios de estado y la conversión quedan con historial', () => {
  const enviada = listDemoCotizaciones().find((fila) => fila.status === 'SENT')
  const actualizada = actualizarDemoCotizacion(enviada.id, { status: 'CANCELLED' }, { action: 'Cotización cancelada', detail: 'Prueba unitaria' })
  assert.equal(actualizada.status, 'CANCELLED')
  assert.equal(buscarDemoCotizacion(enviada.id).status, 'CANCELLED')
  const historial = historialDemoCotizacion(enviada.id)
  assert.equal(historial[0].action, 'Cotización cancelada')
})

test('la aprobación pública demo deja la evidencia y resuelve el token', () => {
  const nueva = crearDemoCotizacion({ customerName: 'Aprobación demo', items: [{ description: 'Producto demo', quantity: 1, unitPricePyg: 250000 }] })
  actualizarDemoCotizacion(nueva.id, { status: 'SENT' })
  const abierta = buscarDemoCotizacion(nueva.id)
  const resuelta = aprobarDemoCotizacion(abierta.publicToken, { at: new Date().toISOString(), method: 'OTP_EMAIL', version: 1, destination: 'demo@ejemplo.com' })
  assert.equal(resuelta.status, 'ACCEPTED')
  assert.equal(resuelta.resolution.method, 'OTP_EMAIL')
  assert.ok(buscarDemoCotizacionPorToken(abierta.publicToken), 'el token sigue resolviendo')
  assert.equal(aprobarDemoCotizacion('token-inexistente', {}), null)
})
