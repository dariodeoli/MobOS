import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVISO_VALOR_ESTIMADO, faltanteCotizacion, mensajeCotizacion, nombreEquipoEntrega } from './mensajeCotizacion.js'

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
const TIENDA = { nombre: 'Móvil Center', direccion: 'Av. Mcal. López 1234, Asunción', telefono: '0981 123 456' }
const EQUIPO = { model: 'iPhone 13', storage: '128GB', condition: 'USED', estimatedValuePyg: 2_100_000, maxValuePyg: 2_400_000 }

test('el mensaje de WhatsApp lleva número, productos, total, validez, tienda y enlace, con emojis y negritas', () => {
  const mensaje = mensajeCotizacion(COTIZACION, { enlace: 'https://app.moboss.online/cotizacion/tok', tienda: TIENDA })
  assert.match(mensaje, /^🧾 \*Cotización COT-0007\*\nHola Juan Pérez, te comparto tu cotización de Móvil Center\./)
  assert.match(mensaje, /📱 \*Detalle\*/)
  assert.match(mensaje, /• 1 × iPhone 15 Pro Max 256 GB — Gs 5\.450\.000/)
  assert.match(mensaje, /• 1 × AirPods Pro 2 — Gs 800\.000/)
  assert.match(mensaje, /• Descuento: −Gs 250\.000/)
  assert.match(mensaje, /💰 \*Total: Gs 6\.000\.000\*/)
  assert.match(mensaje, /📅 Válida hasta el \d{1,2}\/\d{1,2}\/\d{4}/)
  assert.match(mensaje, /📍 Móvil Center · Av\. Mcal\. López 1234, Asunción · Tel\. 0981 123 456/)
  assert.match(mensaje, /🔗 Ver y aprobar: https:\/\/app\.moboss\.online\/cotizacion\/tok$/)
})

test('el mensaje no lleva datos internos ni bloques de equipo cuando no hay equipo que entrega', () => {
  const mensaje = mensajeCotizacion({ ...COTIZACION, costPyg: 1, margin: 20, internalNotes: 'secreto' }, { enlace: 'https://x/c/tok' })
  assert.doesNotMatch(mensaje, /Lucía Benítez|secreto|costo|margen/i)
  assert.doesNotMatch(mensaje, /🔄|✅|sujeto a revisión/)
})

test('con equipo que entrega: valor estimado, faltante y aviso fijo de revisión', () => {
  const mensaje = mensajeCotizacion({ ...COTIZACION, totalPyg: 8_000_000, tradeIn: EQUIPO }, { enlace: 'https://x/c/tok', tienda: TIENDA })
  assert.match(mensaje, /🔄 \*Equipo que entregás\*\n• iPhone 13 128GB \(Seminuevo\)\n• Valor estimado: Gs 2\.100\.000/)
  assert.match(mensaje, /✅ \*Faltante a pagar: Gs 5\.900\.000\*/)
  assert.ok(mensaje.includes(`_${AVISO_VALOR_ESTIMADO}_`))
  assert.equal(AVISO_VALOR_ESTIMADO, 'Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas).')
})

test('el faltante nunca es negativo y es el total menos el valor estimado', () => {
  assert.equal(faltanteCotizacion(8_000_000, EQUIPO), 5_900_000)
  assert.equal(faltanteCotizacion(1_000_000, EQUIPO), 0)
  assert.equal(faltanteCotizacion(1_000_000, null), 1_000_000)
  assert.equal(nombreEquipoEntrega(EQUIPO), 'iPhone 13 128GB (Seminuevo)')
  assert.equal(nombreEquipoEntrega(null), '')
})

test('usa la plantilla editada de la empresa y no pierde el equipo ni el aviso si la plantilla no los trae', () => {
  const plantilla = '¡Hola {{cliente}}! Tu cotización {{cotizacion}} por {{total}} está lista. {{enlace}}'
  const sinEquipo = mensajeCotizacion(COTIZACION, { enlace: 'https://x/c/tok', plantilla })
  assert.equal(sinEquipo, '¡Hola Juan Pérez! Tu cotización COT-0007 por Gs 6.000.000 está lista. https://x/c/tok')
  const conEquipo = mensajeCotizacion({ ...COTIZACION, totalPyg: 8_000_000, tradeIn: EQUIPO }, { enlace: 'https://x/c/tok', plantilla })
  assert.match(conEquipo, /Faltante a pagar: Gs 5\.900\.000/)
  assert.match(conEquipo, /sujeto a revisión/)
})

test('sin enlace, cliente ni tienda el mensaje no inventa líneas', () => {
  const mensaje = mensajeCotizacion({ number: 'COT-1', totalPyg: 1000, items: [{ description: 'Cable', quantity: 2, unitPricePyg: 500 }] })
  assert.match(mensaje, /^🧾 \*Cotización COT-1\*\nHola cliente, te comparto tu cotización de nuestra tienda\./)
  assert.match(mensaje, /• 2 × Cable — Gs 1\.000/)
  assert.match(mensaje, /💰 \*Total: Gs 1\.000\*/)
  assert.doesNotMatch(mensaje, /📅|📍|🔗|enlace/)
})

test('una cotización con muchos ítems resume el resto', () => {
  const items = Array.from({ length: 12 }, (_, indice) => ({ description: `Producto ${indice + 1}`, quantity: 1, unitPricePyg: 1000, totalPyg: 1000 }))
  const mensaje = mensajeCotizacion({ number: 'COT-9', totalPyg: 12000, items }, { maxItems: 5 })
  assert.equal((mensaje.match(/• 1 × Producto/g) || []).length, 5)
  assert.match(mensaje, /• y 7 ítem\(s\) más/)
})
