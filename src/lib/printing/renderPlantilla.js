import JsBarcode from 'jsbarcode'
import { toJpeg } from 'html-to-image'
import { qrDataUrl } from '../qr.js'
import { baseDeApp, qrProducto } from './qr.js'
import { datosEtiquetaUnidad } from './etiquetaUnidad.js'
import { documentoImagen } from './compartirDocumento.js'
import { pdfDeJpegPaginas } from './pdfDocumento.js'
import { erroresPlantilla } from './plantillas.js'
import { MM_A_PX, mmAPuntos, paginaFisica, rotacionElemento } from './geometria.js'
const escape = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export const MAX_PAGINAS_PLANTILLA = 200
function urlQrValida(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\\]/.test(value))
    return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
export function datosProductoPlantilla(items = [], { brand = 'MobOS', base } = {}) {
  const candidate = base === undefined ? baseDeApp() : base
  // Una base inválida no activa el respaldo legacy MOBOS: del helper global.
  const validBase =
    urlQrValida(candidate) && !new URL(candidate).search && !new URL(candidate).hash
      ? candidate
      : ''
  const pages = []
  for (const { product = {}, cantidad = 1 } of items) {
    if (!Number.isInteger(Number(cantidad)) || Number(cantidad) < 1 || Number(cantidad) > 99)
      throw Error('La cantidad de etiquetas debe ser de 1 a 99.')
    const price =
      product.precioEtiqueta ?? product.precioPyg ?? product.pricePyg ?? product.precioVenta
    if (
      price !== undefined &&
      price !== null &&
      (!Number.isFinite(Number(price)) || Number(price) < 0)
    )
      throw Error('Precio de venta no válido para la etiqueta.')
    const row = {
      product: product.name || product.nombre || '',
      sku: product.sku || '',
      barcode: product.sku || '',
      qr: validBase ? qrProducto(product.sku, validBase) : '',
      brand: String(brand),
      price: price == null ? '' : `Gs ${new Intl.NumberFormat('es-PY').format(Number(price))}`,
    }
    for (let i = 0; i < Number(cantidad); i++) pages.push({ ...row })
  }
  if (pages.length > MAX_PAGINAS_PLANTILLA)
    throw Error(
      `El PDF admite hasta ${MAX_PAGINAS_PLANTILLA} etiquetas por lote; dividí la selección.`,
    )
  return pages
}
export function datosUnidadPlantilla(units = [], { brand = 'MobOS', base } = {}) {
  if (!Array.isArray(units) || units.length > MAX_PAGINAS_PLANTILLA)
    throw Error('El lote admite hasta 200 unidades.')
  const candidate = base === undefined ? baseDeApp() : base
  const validBase =
    urlQrValida(candidate) && !new URL(candidate).search && !new URL(candidate).hash
      ? candidate
      : ''
  return units.map(unit => {
    const d = datosEtiquetaUnidad(unit, { base: validBase })
    return {
      model: d.modelo,
      serial: d.serial,
      barcode: d.codigo,
      qr: validBase ? d.enlace : '',
      brand: String(brand),
      condition: d.condicion,
      battery: d.bateria,
      location: d.ubicacion,
      supplierCode: d.proveedor,
    }
  })
}
function barcodeSvg(value, widthMm, dpi) {
  const encoded = {}
  JsBarcode(encoded, String(value), { format: 'CODE128', displayValue: false, margin: 0 })
  const bits = encoded.encodings.map(e => e.data).join(''),
    quiet = 10
  if (((widthMm / (bits.length + quiet * 2)) * dpi) / 25.4 < 1.5)
    throw Error('Código de barras muy denso: ampliá su ancho lógico o usá otra distribución.')
  const bars = [...bits]
    .map((bit, i) => (bit === '1' ? `<rect x="${i + quiet}" y="0" width="1" height="40"/>` : ''))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bits.length + quiet * 2} 40" preserveAspectRatio="none" role="img" aria-label="Código de barras">${bars}</svg>`
}
export function htmlPaginaPlantilla(body, { widthMm, heightMm }, extra = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:${widthMm}mm ${heightMm}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${widthMm}mm;min-height:0;background:white;color:#111827;font-family:Arial,sans-serif}.plantilla-pagina{position:relative;width:${widthMm}mm;height:${heightMm}mm;break-after:page}.plantilla-elemento{position:absolute}.plantilla-contenido{position:absolute;left:0;top:0;transform-origin:0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.2}.plantilla-contenido>svg,.plantilla-contenido>img{width:100%;height:100%;display:block}.plantilla-elemento[data-tipo='qr'] img{object-fit:contain}${extra}</style></head><body>${body}</body></html>`
}
export async function renderPlantilla({ kind, definition, data = [], premiumBuilder } = {}) {
  const errors = erroresPlantilla(kind, definition)
  if (errors.length) throw Error(errors.join(' '))
  if (!Array.isArray(data) || !data.length || data.length > MAX_PAGINAS_PLANTILLA)
    throw Error('El lote debe contener de 1 a 200 documentos.')
  const size = paginaFisica(definition),
    pages = []
  if (kind === 'comprobante') {
    if (definition.page.orientation !== 0 || definition.elements.some(e => e.rotation !== 0))
      throw Error('El comprobante conserva flujo premium: no admite rotación en esta fase.')
    const build =
      premiumBuilder ||
      (await import('../../components/shared/OrderReceipt.jsx')).buildOrderReceiptHtml
    for (const order of data) {
      const html = await build(order, { format: 'thermal-80' })
      const m = definition.page.margins
      const css = `@page{size:${size.widthMm}mm ${definition.page.heightMm ? `${size.heightMm}mm` : 'auto'};margin:0}html,body{width:${size.widthMm}mm!important;max-width:none!important;margin:0!important;min-height:0!important}body{padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm!important;overflow-wrap:anywhere}${definition.elements
        .filter(e => e.binding === 'items')
        .map(e => `table{font-size:${e.fontSizePt}pt!important}`)
        .join('')}`
      pages.push({
        html: html.replace('</head>', `<style>${css}</style></head>`),
        size: { ...size, heightMm: definition.page.heightMm },
      })
    }
    return { kind, definition, pages, html: pages[0].html, count: pages.length }
  }
  for (const row of data) {
    const pieces = []
    for (const element of definition.elements.filter(e => e.visible)) {
      const value = row[element.binding]
      if (element.type === 'qr' && !urlQrValida(value))
        throw Error(
          'El QR requiere un enlace HTTP(S) absoluto sin credenciales. Revisá la base de la app; no se genera un código ficticio.',
        )
      if (
        (value === null || value === undefined || String(value) === '') &&
        ['product', 'sku', 'barcode', 'model', 'serial', 'qr'].includes(element.binding)
      )
        throw Error(`Falta un dato obligatorio: ${element.binding}. No se inventa ni se trunca.`)
      const rotation = rotacionElemento(element, definition.page)
      let content = escape(value)
      if (element.type === 'qr') {
        const url = await qrDataUrl(value, { ancho: 400, margen: 2 })
        if (!url) throw Error('No se pudo generar el QR.')
        content = `<img src="${url}" alt="Código QR">`
      } else if (element.type === 'barcode')
        content = barcodeSvg(value, rotation.widthMm, definition.profile.dpi)
      // La plantilla nunca contiene una URL ni HTML. El logo se representa por
      // nombre; el comprobante usa el logo autorizado de su builder premium.
      pieces.push(
        `<div class="plantilla-elemento" data-elemento="${escape(element.id)}" data-tipo="${element.type}" style="left:${element.xMm}mm;top:${element.yMm}mm;width:${element.widthMm}mm;height:${element.heightMm}mm"><div class="plantilla-contenido" style="width:${rotation.widthMm}mm;height:${rotation.heightMm}mm;transform:${rotation.transform};font-size:${element.fontSizePt}pt;text-align:${element.alignment}">${content}</div></div>`,
      )
    }
    const html = htmlPaginaPlantilla(
      `<main class="plantilla-pagina">${pieces.join('')}</main>`,
      size,
    )
    pages.push({ html, size: { ...size } })
  }
  return { kind, definition, pages, html: pages[0].html, count: pages.length }
}
// Mismo documento para preview y PDF. Un dato que no cabe bloquea exportación;
// nunca se oculta overflow ni se reduce toda la etiqueta silenciosamente.
export function desbordesPlantilla(doc) {
  const errors = []
  for (const node of doc.querySelectorAll('.plantilla-contenido')) {
    const range = doc.createRange()
    range.selectNodeContents(node)
    const rect = node.getBoundingClientRect(),
      content = range.getBoundingClientRect()
    if (
      node.scrollWidth > node.clientWidth + 1 ||
      node.scrollHeight > node.clientHeight + 1 ||
      content.left < rect.left - 1 ||
      content.right > rect.right + 1 ||
      content.top < rect.top - 1 ||
      content.bottom > rect.bottom + 1
    )
      errors.push(
        `El contenido no cabe: ${node.parentElement.dataset.elemento}. Aumentá su caja o modificá la tipografía.`,
      )
  }
  return errors
}
export async function pdfPlantilla(render, { entorno = globalThis } = {}) {
  if (!render?.pages?.length) throw Error('No hay documentos para exportar.')
  const pages = [],
    sizes = []
  const pixelRatio = render.definition.profile.dpi / 96
  for (const page of render.pages) {
    const width = page.size.widthMm * MM_A_PX
    let bad = [],
      height = page.size.heightMm ? page.size.heightMm * MM_A_PX : null
    const result = await documentoImagen(page.html, {
      ancho: width,
      pixelRatio,
      entorno,
      renderizar: async (node, options) => {
        bad = desbordesPlantilla(node.ownerDocument)
        if (bad.length) throw Error(bad.join(' '))
        if (height && node.scrollHeight > Math.ceil(height) + 1)
          throw Error('El documento excede el alto del papel.')
        height = height || Math.max(1, node.scrollHeight)
        if (width * height * pixelRatio * pixelRatio > 20000000)
          throw Error('El documento excede el presupuesto de imagen; dividí el contenido.')
        return toJpeg(node, {
          ...options,
          width,
          height,
          canvasWidth: Math.round(width * pixelRatio),
          canvasHeight: Math.round(height * pixelRatio),
          pixelRatio: 1,
          quality: 0.98,
        })
      },
    })
    if (!result)
      throw Error(
        bad.join(' ') ||
          'No se pudo generar el PDF completo. Revisá el tamaño y los recursos del documento.',
      )
    const raw = entorno.atob(result.dataUrl.split(',')[1]),
      bytes = Uint8Array.from(raw, c => c.charCodeAt(0))
    pages.push({
      bytes,
      anchoPx: Math.round(width * pixelRatio),
      altoPx: Math.round(height * pixelRatio),
    })
    sizes.push({ widthMm: page.size.widthMm, heightMm: height / MM_A_PX })
  }
  if (
    sizes.some(
      s =>
        Math.abs(s.widthMm - sizes[0].widthMm) > 0.001 ||
        Math.abs(s.heightMm - sizes[0].heightMm) > 0.01,
    )
  )
    throw Error('Separá los comprobantes de distintos altos en PDFs individuales.')
  return new entorno.Blob(
    [
      pdfDeJpegPaginas(pages, {
        anchoPagina: mmAPuntos(sizes[0].widthMm),
        altoPagina: mmAPuntos(sizes[0].heightMm),
        margenX: 0,
        margenY: 0,
      }),
    ],
    { type: 'application/pdf' },
  )
}
