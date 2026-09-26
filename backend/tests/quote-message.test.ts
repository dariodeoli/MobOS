import assert from 'node:assert/strict'
import { mensajeCotizacion } from '../lib/quote-message'

// #261: la plantilla profesional del mensaje de cotización (WhatsApp y la
// versión de texto del correo) — número, detalle, total, validez y enlace.

const base = {
  quoteNumber: 'COT-#0042',
  customerName: 'Juan Pérez',
  companyName: 'Celulares del Este',
  items: [
    { description: 'iPhone 15 · 128 GB', quantity: 1, totalPyg: 4850000 },
    { description: 'Funda de silicona', quantity: 2, totalPyg: 180000 },
  ],
  totalPyg: 5030000,
  validUntil: '2026-10-15T12:00:00.000Z',
  link: 'https://app.moboss.online/cotizacion/token-123',
}

const mensaje = mensajeCotizacion(base)
assert.ok(mensaje.includes('Hola Juan Pérez'), 'saluda por nombre')
assert.ok(mensaje.includes('COT-#0042'), 'lleva el número')
assert.ok(mensaje.includes('Celulares del Este'), 'lleva la tienda')
assert.ok(mensaje.includes('• 1 × iPhone 15 · 128 GB — Gs. 4.850.000'), `detalla los ítems: ${mensaje}`)
assert.ok(mensaje.includes('• 2 × Funda de silicona — Gs. 180.000'), 'detalla cantidades')
assert.ok(mensaje.includes('Total: Gs. 5.030.000'), 'lleva el total')
assert.ok(/Válida hasta el \d+ de \p{L}+ de \d{4}/u.test(mensaje), `lleva la validez en texto: ${mensaje}`)
assert.ok(mensaje.includes('https://app.moboss.online/cotizacion/token-123'), 'lleva el enlace público')
assert.ok(!mensaje.includes('unitPricePyg') && !mensaje.includes('cost'), 'sin datos internos')

// Sin cliente ni tienda el mensaje sigue siendo profesional.
const sinDatos = mensajeCotizacion({ quoteNumber: 'COT-#0001', items: [], totalPyg: 0, link: 'https://x' })
assert.ok(sinDatos.startsWith('Te compartimos la cotización COT-#0001'), 'sin nombre arranca sin saludo nominal')
assert.ok(sinDatos.includes('Total: Gs. 0'), 'con total en cero, igual informa')
assert.ok(!sinDatos.includes('Válida'), 'sin validez no inventa la línea')

// Muchos ítems: se listan los primeros y se avisa cuántos quedan.
const muchos = mensajeCotizacion({ ...base, items: Array.from({ length: 11 }, (_, i) => ({ description: `Producto ${i + 1}`, quantity: 1, totalPyg: 1000 })) })
assert.ok(muchos.includes('Producto 8') && !muchos.includes('Producto 9'), 'lista hasta ocho ítems')
assert.ok(muchos.includes('y 3 ítems más'), 'avisa cuántos quedan')
assert.ok(muchos.includes('•'), 'usa viñetas')

console.log('quote-message: plantilla profesional del mensaje OK')
