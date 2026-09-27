import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeCotizacion } from './mensajeCotizacion.js'

const COTIZACION = {
  number: 'COT-0007',
  customerName: 'Juan Pérez',
  seller: { name: 'Lucía Benítez' },
  tenant: { name: 'Móvil Center' },
  totalPyg: 6_000_000,
  discountPyg: 250_000,
  validUntil: '2026-10-03T00:00:00.000Z',
  items: [
    { description: 'iPhone 15 Pro Max 256 GB', quantity: 1, unitPricePyg: 5_450_000, totalPyg: 5_450_000 },
    { description: 'AirPods Pro 2', quantity: 1, unitPricePyg: 800_000, totalPyg: 800_000 },
  ],
}

test('el mensaje de la cotización es profesional y lleva el detalle', () => {
  const mensaje = mensajeCotizacion(COTIZACION, { enlace: 'https://app.moboss.online/cotizacion/tok' })
  assert.match(mensaje, /^Hola Juan Pérez, te comparto la cotización COT-0007 de Móvil Center\./)
  assert.match(mensaje, /• 1 × iPhone 15 Pro Max 256 GB — Gs 5\.450\.000/)
  assert.match(mensaje, /• 1 × AirPods Pro 2 — Gs 800\.000/)
  assert.match(mensaje, /Total: Gs 6\.000\.000/)
  assert.match(mensaje, /Incluye un descuento de Gs 250\.000\./)
  assert.match(mensaje, /Válida hasta el \d{1,2}\/\d{1,2}\/\d{4}\./)
  assert.match(mensaje, /Te atiende Lucía Benítez\./)
  assert.match(mensaje, /Revisala y aceptala en línea: https:\/\/app\.moboss\.online\/cotizacion\/tok/)
})

test('sin enlace, cliente ni vendedor el mensaje no inventa líneas', () => {
  const mensaje = mensajeCotizacion({ number: 'COT-1', totalPyg: 1000, items: [{ description: 'Cable', quantity: 2, unitPricePyg: 500 }] })
  assert.match(mensaje, /^Hola, te comparto la cotización COT-1\./)
  assert.match(mensaje, /• 2 × Cable — Gs 1\.000/)
  assert.match(mensaje, /Total: Gs 1\.000/)
  assert.doesNotMatch(mensaje, /Válida/)
  assert.doesNotMatch(mensaje, /en línea/)
})

test('una cotización con muchos ítems resume el resto', () => {
  const items = Array.from({ length: 12 }, (_, indice) => ({ description: `Producto ${indice + 1}`, quantity: 1, unitPricePyg: 1000, totalPyg: 1000 }))
  const mensaje = mensajeCotizacion({ number: 'COT-9', totalPyg: 12000, items }, { maxItems: 5 })
  assert.equal((mensaje.match(/• 1 × Producto/g) || []).length, 5)
  assert.match(mensaje, /• y 7 ítem\(s\) más/)
})
