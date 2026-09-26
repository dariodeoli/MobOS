// Pruebas del correo de cotización: armado del mensaje (detalle, totales y
// enlace público con respaldo visible) y la clave idempotente por versión.
import assert from 'node:assert/strict'
import { armarCorreoCotizacion, claveIdempotenciaCotizacion, enlacePublicoCotizacion, itemsDeCotizacion, versionCotizacion } from '../lib/quote-email'

const COTIZACION = {
  id: 'quote-1',
  number: 'COT-0001',
  customerName: 'María González',
  customerId: 'customer-1',
  publicToken: 'token-publico-123',
  subtotalPyg: 1000000,
  discountPyg: 100000,
  totalPyg: 900000,
  validUntil: new Date('2026-10-30T12:00:00.000Z'),
  notes: 'Precio sujeto a stock.',
  items: [
    { productId: 'prod-1', description: 'iPhone 15 · 128 GB', quantity: 1, unitPricePyg: 800000 },
    { description: 'Funda de silicona', quantity: 2, unitPricePyg: 100000 },
    { description: 'Ítem inválido sin cantidad', quantity: 0, unitPricePyg: 50000 },
  ],
  status: 'DRAFT',
  updatedAt: new Date('2026-09-26T12:00:00.000Z'),
}

// ── Enlace y limpieza de ítems ──────────────────────────────────────────────
assert.equal(enlacePublicoCotizacion(null), null, 'sin token no hay enlace')
assert.equal(enlacePublicoCotizacion('abc'), 'https://app.moboss.online/cotizacion/abc')
assert.deepEqual(itemsDeCotizacion(COTIZACION.items).map((item) => item.quantity), [1, 2], 'descarta los ítems sin cantidad')
assert.deepEqual(itemsDeCotizacion('no-es-lista'), [])

// ── Armado del correo ───────────────────────────────────────────────────────
const correo = armarCorreoCotizacion({ cotizacion: COTIZACION, customerName: COTIZACION.customerName, to: 'cliente@ejemplo.com', companyName: 'Celulares del Este', token: COTIZACION.publicToken })
assert.ok(correo, 'el correo se arma con correo, ítems y enlace')
assert.equal(correo.subject, 'Cotización COT-0001 · Celulares del Este')
assert.ok(correo.html.includes('iPhone 15 · 128 GB') && correo.html.includes('Funda de silicona'), 'lleva el detalle de los ítems')
assert.ok(correo.html.includes('2 × Funda de silicona') && correo.html.includes('800.000'), 'lleva cantidades e importes unitarios')
assert.ok(correo.html.includes('Descuento') && correo.html.includes('- Gs. 100.000'), 'muestra el descuento cuando existe')
assert.ok(correo.html.includes('Subtotal') && correo.html.includes('Total'), 'muestra subtotal y total')
assert.ok(correo.html.includes('Celulares del Este') && correo.html.includes('30 de octubre de 2026'), 'lleva comercio y validez')
assert.ok(correo.html.includes('Precio sujeto a stock.'), 'las notas viajan como condiciones')
assert.ok(correo.html.includes('https://app.moboss.online/cotizacion/token-publico-123'), 'el botón apunta al enlace público')
assert.ok(correo.html.includes('Si el botón no funciona, copiá y pegá este enlace:'), 'deja el enlace de respaldo visible')
assert.ok(correo.text.includes('Cotización: COT-0001') && correo.text.includes('Total: Gs. 900.000'), 'la versión de texto conserva el detalle')
assert.ok(correo.text.includes('Ver la cotización: https://app.moboss.online/cotizacion/token-publico-123'), 'la versión de texto conserva la acción')

assert.equal(armarCorreoCotizacion({ cotizacion: COTIZACION, customerName: '', to: 'no-es-mail', token: COTIZACION.publicToken }), null, 'rechaza una casilla inválida')
assert.equal(armarCorreoCotizacion({ cotizacion: { ...COTIZACION, items: [] }, customerName: '', to: 'cliente@ejemplo.com', token: COTIZACION.publicToken }), null, 'sin ítems no hay correo')
assert.equal(armarCorreoCotizacion({ cotizacion: COTIZACION, customerName: '', to: 'cliente@ejemplo.com', token: null }), null, 'sin enlace público no hay correo')

// ── Idempotencia ────────────────────────────────────────────────────────────
const version = versionCotizacion(COTIZACION)
assert.match(version, /^[0-9a-f]{16}$/, 'la versión es un hash corto')
const conEstado = { ...COTIZACION, status: 'SENT' }
const conFechaInterna = { ...COTIZACION, updatedAt: new Date('2026-10-01T00:00:00.000Z') }
assert.equal(version, versionCotizacion(conEstado), 'el cambio de estado no mueve la versión')
assert.equal(version, versionCotizacion(conFechaInterna), 'el cambio de fecha interna no mueve la versión')
assert.notEqual(version, versionCotizacion({ ...COTIZACION, items: [{ description: 'Otro ítem', quantity: 1, unitPricePyg: 500000 }] }), 'editar ítems permite reenviar')
assert.notEqual(version, versionCotizacion({ ...COTIZACION, totalPyg: 950000 }), 'cambiar el total permite reenviar')

const clave = claveIdempotenciaCotizacion('quote-1', version)
assert.equal(clave, `quote-email:quote-1:${version}`)
assert.equal(clave, claveIdempotenciaCotizacion('quote-1', version), 'el mismo contenido da la misma clave')
assert.notEqual(clave, claveIdempotenciaCotizacion('quote-1', version, true), 'el reenvío explícito usa otra clave')

console.log('quote-email: armado, enlace e idempotencia ok')
