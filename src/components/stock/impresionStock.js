import JsBarcode from 'jsbarcode'
import { ticketsDesdeHtml } from '@/lib/printing/htmlEscpos'
import { capturarContextoImpresion, configImpresora, imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { formatoPermitido } from '@/lib/printing/preferencias'
import { buildOrderReceiptHtml, buildProductLabelsHtml, buildRemisionHtml, buildUnitLabelsHtml, tokenDeNivel } from '@/components/shared/OrderReceipt'
import { qrDataUrl } from '@/lib/qr'
import { APP_NAME } from '@/lib/brand'
import { api } from '@/lib/api/client'
import { imprimirHtmlComun } from '@/lib/printing/documentos'
import { etiquetasDeFilasStock } from '@/lib/printing/etiquetasStock'
import { safe } from './stockHelpers'

// Impresión masiva de etiquetas de unidades (#220): sale directo por la
// impresora configurada (agente o puente) y el diálogo queda solo como respaldo
// de un fallo claro. Una página por etiqueta, con el ancho real del rollo.
export async function printLabels(units = []) {
  const contexto = capturarContextoImpresion()
  if (!units.length) return
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml(units, { ancho })
  const resultado = await imprimirDocumento(({ impresora }) => ticketsDesdeHtml(html, { impresora, formato: `thermal-${ancho}`, etiquetas: true }), { contexto, tipo: 'etiquetas-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}
export async function printLocationLabel(location) {
  const contexto = capturarContextoImpresion()
  const { ancho } = configImpresora()
  const code = `MOBOS:UBI:${location.id}`
  let qr = ''
  try { qr = await qrDataUrl(code, { margen: 0, ancho: 190, mm: 26 }) } catch { /* La etiqueta conserva el texto aunque el QR no se renderice. */ }
  const barcode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(barcode, code, { format: 'CODE128', displayValue: false, width: 1.4, height: 38, margin: 0 })
  const barras = barcode.outerHTML
  const anchoUtil = ancho === 80 ? 72 : 48
  const margen = (ancho - anchoUtil) / 2
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ubicación ${safe(location.name)}</title><style>@page{size:${ancho}mm auto;margin:0}*{box-sizing:border-box}body{width:${anchoUtil}mm;margin:0 ${margen}mm;font:11px/1.4 ui-sans-serif,system-ui,sans-serif;color:#0e1116;text-align:center}.brand{display:flex;justify-content:space-between;font-size:7.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#047857;border-bottom:1px solid #d5dce6;padding-bottom:1.5mm;margin-bottom:2.5mm}.name{font-size:15px;font-weight:900;letter-spacing:-.01em}.meta{font-size:8.5px;color:#475569;margin-top:1mm}.qr{width:26mm;height:26mm;margin:3mm auto 2mm;display:block}.barcode{margin-top:2mm}.barcode svg{width:100%;height:auto;max-height:12mm}footer{margin-top:2mm;border-top:1px dashed #999;padding-top:1.5mm;font-size:7px;color:#475569}</style></head><body><div class="brand"><span>${safe(APP_NAME)} · UBICACIÓN</span><span>STOCK</span></div><div class="name">${safe(location.name)}</div><div class="meta">${safe(location.branch?.name || '')}${location.code ? ` · ${safe(location.code)}` : ''}</div>${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}<div class="barcode">${barras}<span>${safe(code)}</span></div><footer>Escaneá al recibir o trasladar para asignar esta ubicación.</footer></body></html>`
  return imprimirHtmlComun(html, { contexto, tipo: 'etiqueta-ubicacion', formato: `thermal-${ancho}` })
}
// Reimprimir la etiqueta de una unidad (#220): sale directo por la impresora
// configurada, sin diálogo; el respaldo abre el HTML solo ante un fallo claro.
// La usa la ficha y la recepción en tránsito (reimprimir al llegar).
export async function printLabel(unit) {
  const contexto = capturarContextoImpresion()
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml([unit], { ancho })
  const resultado = await imprimirDocumento(({ impresora }) => ticketsDesdeHtml(html, { impresora, formato: `thermal-${ancho}`, etiquetas: true }), { contexto, tipo: 'etiqueta-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}
// Comprobante rápido de una venta (#215 §10): se dispara desde la lista de
// Vendidos sin abrir la ficha. Reutiliza el mismo comprobante que el resto de
// la app (nivel Rápido): directo por la impresora configurada (80 mm por
// defecto) y, ante un fallo claro, el PDF con OrderReceipt.
export async function printQuickReceipt(unit, { contexto = capturarContextoImpresion() } = {}) {
  const vigente = () => contexto === capturarContextoImpresion()
  const cancelado = () => ({ ok: false, motivo: 'contexto-cambiado', error: 'El contexto cambió. Volvé a abrir el comprobante.' })
  if (!vigente()) return cancelado()
  const venta = unit?.sale
  if (!venta?.orderId) return { ok: false, motivo: 'sin-pedido', error: 'La unidad no tiene un pedido asociado.' }
  const { ancho } = configImpresora()
  const formato = formatoPermitido(ancho === 58 ? 'thermal-58' : 'thermal-80')
  const orden = await api.get(`/api/orders/${encodeURIComponent(venta.orderId)}`)
  if (!vigente()) return cancelado()
  // Token impreso del nivel rápido, sin rotar ni reutilizar el del panel.
  const token = await tokenDeNivel(orden.id, 'rapido')
  if (!vigente()) return cancelado()
  const html = await buildOrderReceiptHtml(orden, { level: 'rapido', format: formato, token })
  if (!vigente()) return cancelado()
  return imprimirHtmlComun(html, { contexto, tipo: 'comprobante', formato, ref: orden.orderNumber || venta.orderNumber || '' })
}
// Resultado ficticio del demo para las impresiones que no están disponibles:
// el rack del taller lo anuncia con el texto canónico de fallo (#323).
export const IMPRESION_DEMO = { ok: false, motivo: 'demo', error: 'La impresión no está disponible en el demo.' }
// Remisión interna del traslado: primero la térmica (agente o puente) y solo
// si el fallo fue claro cae al diálogo con el A4. Tras encolar o un resultado
// incierto no se abre nada: el reintento podría duplicar el papel.
export async function imprimirRemision(transfer) {
  const contexto = capturarContextoImpresion()
  const { ancho } = configImpresora()
  const formato = formatoPermitido(ancho === 58 ? 'thermal-58' : 'thermal-80')
  const html = await buildRemisionHtml(transfer, { format: formato })
  return imprimirHtmlComun(html, { contexto, tipo: 'remision', formato })
}

// U4b: etiquetas de las filas elegidas en la lista de Stock. Una sola función
// pura decide QUÉ sale (etiquetasDeFilasStock, la misma de la vista previa) y
// acá solo se envía por el ruteo de impresión de siempre: unidades y accesorios
// en trabajos separados, cada uno con su tipo de documento. Ante un fallo claro
// cae al diálogo con el mismo HTML de etiquetas de la app. Si la selección está
// vacía lanza EtiquetasStockError y el llamador muestra su mensaje tal cual.
export async function imprimirEtiquetasStock(filas = []) {
  const contexto = capturarContextoImpresion()
  const { ancho } = configImpresora()
  const { trabajos, total, items } = etiquetasDeFilasStock(filas, { ancho })
  const resultados = []
  for (const trabajo of trabajos) {
    const esUnidad = trabajo.tipo === 'unidad'
    const html = esUnidad
      ? await buildUnitLabelsHtml(items.filter(item => item.tipo === 'unidad').map(item => item.unit), { ancho })
      : await buildProductLabelsHtml(items.filter(item => item.tipo === 'producto').map(item => ({ product: item.product, cantidad: item.cantidad })), { format: `thermal-${ancho}` })
    const resultado = await imprimirDocumento(({ impresora }) => ticketsDesdeHtml(html, { impresora, formato: `thermal-${ancho}`, etiquetas: true }), { contexto, tipo: esUnidad ? 'etiquetas-stock' : 'etiquetas-producto' })
    // Diálogo solo si el fallo fue CLARO: tras un resultado incierto o encolado
    // abrirlo podría duplicar el papel.
    if (puedeCaerAlDialogo(resultado)) {
      const html = esUnidad
        ? await buildUnitLabelsHtml(items.filter((item) => item.tipo === 'unidad').map((item) => item.unit), { ancho })
        : await buildProductLabelsHtml(items.filter((item) => item.tipo === 'producto').map((item) => ({ product: item.product, cantidad: item.cantidad })), { format: ancho === 80 ? 'thermal-80' : 'thermal-58' })
      imprimirConDialogo(html)
    }
    resultados.push({ tipo: trabajo.tipo, etiquetas: trabajo.etiquetas, resultado })
    if (!resultado.ok) break // no continuar otro grupo tras un rechazo o envío incierto
  }
  return { total, resultados }
}
