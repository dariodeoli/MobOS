import { qrDataUrl } from '@/lib/qr'
import { printHtml, escapeHtml } from '@/utils/printHtml'
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { datosEncabezado } from '@/lib/printing/empresaImpresion'
import { acentoDeEmpresa } from '@/lib/printing/ventaPapel'
import { documentoCambio, documentoDevolucion, documentoRegalo, documentoTarjetaRegalo } from '@/lib/printing/operacionPapel'
import { cuerpoCambioHtml, cuerpoDevolucionHtml, cuerpoRegaloHtml, cuerpoTarjetaRegaloHtml, pieOperacionHtml } from '@/lib/printing/operacionHtml'
import { header, styles, trackingUrlFor } from './OrderReceipt'

// Papeles por tipo de operación (#426): devolución, cambio, recibo de regalo y
// tarjeta de regalo, con el mismo sistema de estilos de la venta (#402).
const ANCHOS = { 'thermal-80': 80, 'thermal-58': 58, 'thermal-55': 55, thermal: 58 }

async function envolver(doc, cuerpo, { format = 'a4' } = {}) {
  const logo = await getLogoDataUrl()
  const encabezado = datosEncabezado({ tenant: doc.tenant, branch: doc.branch })
  const cuando = doc.fecha ? new Date(doc.fecha).toLocaleString('es-PY') : ''
  const termico = Boolean(ANCHOS[format])
  const numero = doc.tipo === 'giftcard' ? '' : doc.pedido || ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(doc.titulo)} ${escapeHtml(numero)}</title><style>${styles(format, acentoDeEmpresa(doc.tenant))}</style></head><body class="${termico ? `rollo t${ANCHOS[format]}` : 'hoja a4'}">
    ${header(doc.titulo, cuando, logo, doc.empresa, { razon: encabezado.razon || doc.empresa, numero, lineas: encabezado.lineas })}
    ${cuerpo}
    ${pieOperacionHtml(doc)}
  </body></html>`
}

// Enlace público del pedido de origen (el mismo QR «Comprobante y seguimiento»
// de la venta). Sin token público no hay enlace ni QR.
const enlaceDe = (orden) => trackingUrlFor(orden)
async function qrDe(enlace) {
  try { return enlace ? await qrDataUrl(enlace, { nivel: 'H', margen: 2, ancho: 320 }) : '' } catch { return '' }
}

export async function buildDevolucionHtml(orden, opciones = {}) {
  const enlace = opciones.enlace ?? enlaceDe(orden)
  const doc = documentoDevolucion(orden, { ...opciones.datos, enlace })
  const termico = Boolean(ANCHOS[opciones.format])
  return envolver(doc, cuerpoDevolucionHtml(doc, { termico, qrSrc: await qrDe(enlace) }), opciones)
}

export async function buildCambioHtml(orden, opciones = {}) {
  const enlace = opciones.enlace ?? enlaceDe(orden)
  const doc = documentoCambio(orden, { ...opciones.datos, enlace })
  const termico = Boolean(ANCHOS[opciones.format])
  return envolver(doc, cuerpoCambioHtml(doc, { termico, qrSrc: await qrDe(enlace) }), opciones)
}

export async function buildReciboRegaloHtml(orden, opciones = {}) {
  const enlace = opciones.enlace ?? enlaceDe(orden)
  const doc = documentoRegalo(orden, { enlace })
  const termico = Boolean(ANCHOS[opciones.format])
  return envolver(doc, cuerpoRegaloHtml(doc, { termico, qrSrc: await qrDe(enlace) }), opciones)
}

export async function buildTarjetaRegaloHtml(tarjeta, opciones = {}) {
  const doc = documentoTarjetaRegalo(tarjeta, opciones.contexto)
  const qrSrc = doc.qr ? await qrDataUrl(doc.qr, { nivel: 'H', margen: 2, ancho: 320 }) : ''
  return envolver(doc, cuerpoTarjetaRegaloHtml(doc, { qrSrc }), opciones)
}

export const printDevolucion = async (orden, opciones = {}) => printHtml(await buildDevolucionHtml(orden, opciones))
export const printCambio = async (orden, opciones = {}) => printHtml(await buildCambioHtml(orden, opciones))
export const printReciboRegalo = async (orden, opciones = {}) => printHtml(await buildReciboRegaloHtml(orden, opciones))
export const printTarjetaRegalo = async (tarjeta, opciones = {}) => printHtml(await buildTarjetaRegaloHtml(tarjeta, opciones))
