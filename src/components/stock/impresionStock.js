import { configImpresora, imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { accessUrlFor, buildUnitLabelsHtml, printOrderReceipt, printRemisionReceipt, tokenDeNivel } from '@/components/shared/OrderReceipt'
import { ticketComprobante, ticketEtiquetaUbicacion, ticketEtiquetaUnidad, ticketEtiquetasUnidad, ticketRemision } from '@/lib/printing/tickets'
import { qrDataUrl } from '@/lib/qr'
import { APP_NAME } from '@/lib/brand'
import { api } from '@/lib/api/client'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { safe } from './stockHelpers'

// Impresión masiva de etiquetas de unidades (#220): sale directo por la
// impresora configurada (agente o puente) y el diálogo queda solo como respaldo
// de un fallo claro. Una página por etiqueta, con el ancho real del rollo.
export async function printLabels(units = []) {
  if (!units.length) return
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml(units, { ancho })
  const resultado = await imprimirDocumento(ticketEtiquetasUnidad(units, { ancho }), { tipo: 'etiquetas-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}
export async function printLocationLabel(location) {
  const code = `MOBOS:UBI:${location.id}`
  let qr = ''
  try { qr = await qrDataUrl(code, { margen: 0, ancho: 190 }) } catch { /* La etiqueta conserva el texto aunque el QR no se renderice. */ }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ubicación ${safe(location.name)}</title><style>@page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{width:54mm;margin:0;font:11px/1.4 ui-sans-serif,system-ui,sans-serif;color:#0f1720;text-align:center}.brand{display:flex;justify-content:space-between;font-size:7.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c8876;border-bottom:1px solid #d5dbe0;padding-bottom:1.5mm;margin-bottom:2.5mm}.name{font-size:15px;font-weight:900;letter-spacing:-.01em}.meta{font-size:8.5px;color:#66707a;margin-top:1mm}.qr{width:26mm;height:26mm;margin:3mm auto 2mm;display:block}footer{margin-top:2mm;border-top:1px dashed #999;padding-top:1.5mm;font-size:7px;color:#66707a}</style></head><body><div class="brand"><span>${safe(APP_NAME)} · UBICACIÓN</span><span>STOCK</span></div><div class="name">${safe(location.name)}</div><div class="meta">${safe(location.branch?.name || '')}${location.code ? ` · ${safe(location.code)}` : ''}</div>${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}<footer>Escaneá al recibir o trasladar para asignar esta ubicación.</footer></body></html>`
  const resultado = await imprimirDocumento(ticketEtiquetaUbicacion(location), { tipo: 'etiqueta-ubicacion' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}
// Reimprimir la etiqueta de una unidad (#220): sale directo por la impresora
// configurada, sin diálogo; el respaldo abre el HTML solo ante un fallo claro.
// La usa la ficha y la recepción en tránsito (reimprimir al llegar).
export async function printLabel(unit) {
  const { ancho } = configImpresora()
  const html = await buildUnitLabelsHtml([unit], { ancho })
  const resultado = await imprimirDocumento(ticketEtiquetaUnidad(unit, { ancho }), { tipo: 'etiqueta-stock' })
  // Diálogo solo si el fallo fue CLARO (nada se envió ni quedó en cola):
  // tras un resultado incierto o encolado abrirlo podría duplicar el ticket.
  if (puedeCaerAlDialogo(resultado)) imprimirConDialogo(html)
  return resultado
}
// Comprobante rápido de una venta (#215 §10): se dispara desde la lista de
// Vendidos sin abrir la ficha. Reutiliza el mismo comprobante que el resto de
// la app (nivel Rápido): directo por la impresora configurada (80 mm por
// defecto) y, ante un fallo claro, el PDF con OrderReceipt.
export async function printQuickReceipt(unit) {
  const venta = unit?.sale
  if (!venta?.orderId) return { ok: false, motivo: 'sin-pedido', error: 'La unidad no tiene un pedido asociado.' }
  const { ancho } = configImpresora()
  const formato = ancho === 58 ? 'thermal-58' : 'thermal-80'
  const orden = await api.get(`/api/orders/${encodeURIComponent(venta.orderId)}`)
  // El QR del nivel rápido: mismo token de impresión que emite el comprobante.
  const token = await tokenDeNivel(orden.id, 'rapido')
  const link = token ? accessUrlFor(token) : ''
  const resultado = await imprimirDocumento(ticketComprobante(orden, { nivel: 'rapido', ancho, link }), { tipo: 'comprobante', ref: orden.orderNumber || venta.orderNumber || '' })
  if (resultado?.ok || !puedeCaerAlDialogo(resultado)) return resultado
  const abierto = await printOrderReceipt(orden, { level: 'rapido', format: formato, token })
  return { ...resultado, dialogo: Boolean(abierto) }
}
// Resultado ficticio del demo para las impresiones que no están disponibles:
// el rack del taller lo anuncia con el texto canónico de fallo (#323).
export const IMPRESION_DEMO = { ok: false, motivo: 'demo', error: 'La impresión no está disponible en el demo.' }
// Remisión interna del traslado: primero la térmica (agente o puente) y solo
// si el fallo fue claro cae al diálogo con el A4. Tras encolar o un resultado
// incierto no se abre nada: el reintento podría duplicar el papel.
export async function imprimirRemision(transfer) {
  const { ancho } = configImpresora()
  return imprimirDocumentoNoFiscal(ticketRemision(transfer, { ancho }), {
    tipo: 'remision',
    respaldo: () => printRemisionReceipt(transfer, { format: 'a4' }),
  })
}
