// Etiqueta de envío 10 × 15 cm: armado de campos, contra reembolso vs pagado,
// bultos, tamaño de página, QR con logo que decodifica y plantillas Pro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import {
  ETIQUETA_ENVIO_MM,
  MAX_BULTOS,
  PAGINA_CSS_ENVIO,
  QR_ETIQUETA_ENVIO,
  datosEtiquetaEnvio,
  datosPlantillaEnvio,
  etiquetasDeEnvio,
  htmlEtiquetasEnvio,
  metodoEnvio,
} from './etiquetaEnvio.js'
import { PRESETS_PRO_PLANTILLA, disenosPro, erroresPlantilla } from './plantillas.js'
import { cajaLogoQr, configurarLogoQr, qrDataUrl } from '../qr.js'

const { default: jsQR } = await import('jsqr')
const { PNG } = await import('pngjs')

const EMPRESA = {
  tenant: { name: 'Tienda Demo', address: 'Av. España 100', city: 'Asunción', phone: '021 555 000', ruc: '80000000-1' },
  branch: { name: 'Central', phone: '0981 000 111', address: 'Av. España 100' },
}
const ENLACE = 'https://moboss.online/pedidos/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const pedido = (extra = {}) => ({
  id: 'p1',
  orderNumber: 'AUR-#0003',
  deliveryType: 'Delivery',
  deliveryNotes: 'Llamar al llegar.',
  customer: {
    name: 'Juan Pereira',
    phone: '0981222333',
    countryCode: '+595',
    addresses: [{ address: 'Av. Mcal. López 1234', city: 'Asunción', department: 'Capital', notes: 'Portón negro' }],
  },
  totalPyg: 1000000,
  payments: [{ status: 'CONFIRMED', amountPyg: 400000 }],
  ...extra,
})

test('el tamaño de página es exactamente 100 × 150 mm sin márgenes', () => {
  assert.deepEqual({ ...ETIQUETA_ENVIO_MM }, { ancho: 100, alto: 150 })
  assert.equal(PAGINA_CSS_ENVIO, '@page{size:100mm 150mm;margin:0}')
  const html = htmlEtiquetasEnvio([{ datos: datosEtiquetaEnvio(pedido(), { empresa: EMPRESA }) }])
  assert.match(html, /@page\{size:100mm 150mm;margin:0\}/)
  assert.match(html, /\.etiqueta\{[^}]*width:100mm;height:150mm/)
})

test('arma remitente, destinatario, pedido, método, fecha y código del pedido', () => {
  const d = datosEtiquetaEnvio(pedido(), { empresa: EMPRESA, enlace: ENLACE, fecha: new Date('2026-10-15T15:00:00Z') })
  assert.equal(d.pedido, 'AUR-0003')
  assert.equal(d.codigoBarras, 'AUR-0003')
  assert.equal(d.remitente.nombre, 'Tienda Demo')
  assert.equal(d.remitente.telefono, '0981 000 111')
  assert.equal(d.remitente.ruc, '80000000-1')
  assert.equal(d.destinatario.nombre, 'Juan Pereira')
  assert.equal(d.destinatario.telefono, '+595 981 222 333')
  assert.equal(d.destinatario.direccion, 'Av. Mcal. López 1234')
  assert.equal(d.destinatario.ciudad, 'Asunción, Capital')
  assert.equal(d.destinatario.referencia, 'Portón negro')
  assert.equal(d.metodo, 'DELIVERY')
  assert.equal(d.fecha, '15/10/2026')
  assert.equal(d.enlace, ENLACE)
})

test('contra reembolso con el saldo a cobrar y PAGADO cuando no queda saldo', () => {
  const debe = datosEtiquetaEnvio(pedido(), { empresa: EMPRESA })
  assert.equal(debe.contraReembolso, true)
  assert.equal(debe.saldo, 600000)
  assert.equal(debe.leyendaCobro, 'CONTRA REEMBOLSO')
  assert.match(debe.saldoTexto, /600\.000/)
  const html = htmlEtiquetasEnvio([{ datos: debe }])
  assert.match(html, /Contra reembolso · cobrar/)
  assert.match(html, /600\.000/)
  assert.doesNotMatch(html, />PAGADO</)

  const pago = datosEtiquetaEnvio(pedido({ payments: [{ status: 'CONFIRMED', amountPyg: 1000000 }] }), { empresa: EMPRESA })
  assert.equal(pago.contraReembolso, false)
  assert.equal(pago.saldo, 0)
  assert.equal(pago.leyendaCobro, 'PAGADO')
  assert.match(htmlEtiquetasEnvio([{ datos: pago }]), />PAGADO</)

  // En reparto, lo cobrado en la calle (sin verificar) tampoco se vuelve a cobrar.
  const calle = datosEtiquetaEnvio(pedido({ delivery: { pendingPyg: 0 } }), { empresa: EMPRESA })
  assert.equal(calle.contraReembolso, false)
})

test('método de entrega: delivery propio, encomienda con transportadora y retiro', () => {
  assert.equal(metodoEnvio({ deliveryType: 'DELIVERY' }), 'DELIVERY')
  assert.equal(metodoEnvio({ deliveryType: 'Retiro en tienda' }), 'RETIRO')
  assert.equal(metodoEnvio({ deliveryType: 'Delivery', shippingCarrier: 'Nuestra Señora' }), 'ENCOMIENDA')
  const enc = datosEtiquetaEnvio(pedido({ shippingCarrier: 'Nuestra Señora', shippingBranch: 'Ciudad del Este', shippingAddress: 'Terminal CDE' }), { empresa: EMPRESA })
  assert.equal(enc.metodoRotulo, 'Encomienda')
  assert.equal(enc.transportadora, 'Nuestra Señora · Ciudad del Este')
  assert.equal(enc.destinatario.direccion, 'Terminal CDE')
  assert.match(htmlEtiquetasEnvio([{ datos: enc }]), /Nuestra Señora · Ciudad del Este/)
})

test('bultos: una etiqueta por bulto y pedido, «1 de 2», con tope', () => {
  const lista = etiquetasDeEnvio([pedido(), pedido({ id: 'p2', orderNumber: 'AUR-#0004' })], { bultos: { p1: 2, p2: 1 }, empresa: EMPRESA })
  assert.deepEqual(lista.map(({ datos }) => `${datos.pedido} ${datos.posicion}`), ['AUR-0003 1 de 2', 'AUR-0003 2 de 2', 'AUR-0004 1 de 1'])
  assert.equal(etiquetasDeEnvio(pedido(), { bultos: 999, empresa: EMPRESA }).length, MAX_BULTOS)
  assert.equal(etiquetasDeEnvio(pedido(), { bultos: 0, empresa: EMPRESA }).length, 1)
  assert.throws(() => etiquetasDeEnvio([], { empresa: EMPRESA }), /al menos un pedido/)
  assert.throws(() => etiquetasDeEnvio(Array.from({ length: 11 }, (_, i) => pedido({ id: `x${i}` })), { bultos: 20, empresa: EMPRESA }), /hasta 200/)
  const html = htmlEtiquetasEnvio(lista.map(({ datos }) => ({ datos })))
  assert.equal((html.match(/<section class="etiqueta"/g) || []).length, 3)
  assert.match(html, /1 de 2/)
})

test('el texto del cliente va escapado en el HTML', () => {
  const d = datosEtiquetaEnvio(pedido({ customer: { name: '<img src=x onerror=alert(1)>', addresses: [] } }), { empresa: EMPRESA })
  const html = htmlEtiquetasEnvio([{ datos: d }])
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;img src=x/)
})

// ---- QR con logo: el enlace de seguimiento se sigue leyendo ----
function leer(dataUrl) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data
}
function componerPng({ qrUrl, caja }) {
  const png = PNG.sync.read(Buffer.from(qrUrl.split(',')[1], 'base64'))
  for (let y = caja.y; y < caja.y + caja.lado; y++) {
    for (let x = caja.x; x < caja.x + caja.lado; x++) {
      const interior = x >= caja.x + caja.relleno && x < caja.x + caja.lado - caja.relleno && y >= caja.y + caja.relleno && y < caja.y + caja.lado - caja.relleno
      const i = (y * png.width + x) * 4
      png.data[i] = png.data[i + 1] = png.data[i + 2] = interior ? 30 : 255
      png.data[i + 3] = 255
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

test('el QR de la etiqueta (30 mm) lleva el logo y decodifica al enlace de seguimiento', async () => {
  let compuestos = 0
  configurarLogoQr({ obtenerLogo: async () => 'data:image/png;base64,AAAA', componer: (datos) => { compuestos++; return componerPng(datos) } })
  try {
    const imagen = await qrDataUrl(ENLACE, QR_ETIQUETA_ENVIO)
    assert.equal(compuestos, 1, 'se pintó el logo en el centro')
    assert.equal(leer(imagen), ENLACE)
    const png = PNG.sync.read(Buffer.from(imagen.split(',')[1], 'base64'))
    const c = Math.floor(png.width / 2)
    assert.equal(png.data[(c * png.width + c) * 4], 30)
    assert.ok(cajaLogoQr(png.width).lado / png.width <= 0.22)
  } finally {
    configurarLogoQr({})
  }
})

// ---- Impresión Pro: 2 variantes válidas ----
test('galería pro: 2 variantes de etiqueta de envío, válidas y de 100 × 150 mm', () => {
  const lista = disenosPro('etiquetas-envio')
  assert.equal(lista.length, 2)
  for (const diseno of lista) {
    assert.deepEqual(erroresPlantilla('etiquetas-envio', diseno.definition), [], diseno.name)
    assert.equal(diseno.definition.page.widthMm, 100)
    assert.equal(diseno.definition.page.heightMm, 150)
  }
  assert.equal(new Set(PRESETS_PRO_PLANTILLA.map((p) => `${p.kind}:${p.name}`)).size, PRESETS_PRO_PLANTILLA.length)
})

test('los datos para la plantilla Pro traen QR, código de barras y cobro', () => {
  const d = datosEtiquetaEnvio(pedido(), { empresa: EMPRESA, enlace: ENLACE, bulto: 1, bultos: 2 })
  const plantilla = datosPlantillaEnvio(d)
  assert.equal(plantilla.qr, ENLACE)
  assert.equal(plantilla.barcode, 'AUR-0003')
  assert.equal(plantilla.packages, 'BULTO 1 de 2')
  assert.match(plantilla.cod, /CONTRA REEMBOLSO\nCOBRAR /)
  assert.match(plantilla.sender, /Tienda Demo/)
  assert.match(plantilla.address, /Ref\.: Portón negro/)
})
