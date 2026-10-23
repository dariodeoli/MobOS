// Armado e impresión de la etiqueta de envío 10 × 15 cm (DOM): QR con logo del
// seguimiento público, código de barras Code128 del pedido y logo de la tienda.
// La parte pura (datos, contra reembolso, bultos, HTML) está en `etiquetaEnvio.js`.
//
// Salida: el diálogo del navegador con `@page { size: 100mm 150mm }`. El agente
// de impresión todavía no tiene un perfil validado de impresora de etiquetas
// 4×6" (solo ZKP8008 de 80 mm), así que no se manda una imagen a otro tamaño: la
// etiqueta sale por el navegador (o «Guardar como PDF») al tamaño exacto.
import JsBarcode from 'jsbarcode'
import { qrDataUrl } from '@/lib/qr'
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { datosEncabezado } from '@/lib/printing/empresaImpresion'
import { imprimirConDialogo } from '@/lib/printing/agent'
import { formatoDeTipo, recordarFormatoDeTipo } from '@/lib/printing/preferencias'
import { accessUrlFor, tokenDeNivel, trackingUrlFor } from '@/components/shared/OrderReceipt'
import { QR_ETIQUETA_ENVIO, TIPO_IMPRESION_ENVIO, VARIANTES_ENVIO, etiquetasDeEnvio, htmlEtiquetasEnvio } from '@/lib/printing/etiquetaEnvio'

/** Último diseño usado por el usuario (mecanismo de «último formato», #209). */
export const varianteEnvioRecordada = () => {
  const guardada = formatoDeTipo(TIPO_IMPRESION_ENVIO)
  return guardada in VARIANTES_ENVIO ? guardada : 'estandar'
}

function barrasDe(valor) {
  if (!valor) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, String(valor), { format: 'CODE128', displayValue: false, width: 2, height: 60, margin: 0 })
    svg.setAttribute('preserveAspectRatio', 'none')
    return svg.outerHTML
  } catch { return '' }
}

/** Enlace del QR: el mismo seguimiento público del comprobante (token impreso, nunca el del panel). */
async function enlaceDe(orden) {
  const token = orden?.id ? await tokenDeNivel(orden.id, 'rapido') : ''
  return (token ? accessUrlFor(token, orden) : trackingUrlFor(orden)) || ''
}

/**
 * HTML de las etiquetas de uno o varios pedidos (una página por bulto).
 * @param {object[]} ordenes pedidos en la forma del API o de la demo.
 * @param {object} [opciones] `bultos` (número o `{ [id]: n }`), `variante`.
 */
export async function armarEtiquetasEnvioHtml(ordenes, { bultos = 1, variante = 'estandar' } = {}) {
  const empresa = datosEncabezado()
  const logoSrc = (await getLogoDataUrl().catch(() => '')) || ''
  const enlaces = new Map()
  for (const orden of [].concat(ordenes).filter(Boolean)) {
    if (!enlaces.has(orden.id)) enlaces.set(orden.id, await enlaceDe(orden))
  }
  const lista = etiquetasDeEnvio(ordenes, { bultos, empresa })
  const qrs = new Map()
  const items = []
  for (const { orden, datos } of lista) {
    const enlace = enlaces.get(orden.id) || ''
    if (!qrs.has(orden.id)) {
      let qr = ''
      try { qr = enlace ? await qrDataUrl(enlace, QR_ETIQUETA_ENVIO) : '' } catch { /* la etiqueta sale con el aviso de QR no disponible */ }
      qrs.set(orden.id, qr)
    }
    items.push({ datos: { ...datos, enlace }, qrSrc: qrs.get(orden.id), logoSrc, barrasSvg: barrasDe(datos.codigoBarras) })
  }
  return { html: htmlEtiquetasEnvio(items, { variante }), total: items.length }
}

/** Arma e imprime (diálogo del navegador al tamaño exacto). Recuerda el diseño usado. */
export async function imprimirEtiquetasEnvio(ordenes, { bultos = 1, variante = varianteEnvioRecordada() } = {}) {
  const { html, total } = await armarEtiquetasEnvioHtml(ordenes, { bultos, variante })
  recordarFormatoDeTipo(TIPO_IMPRESION_ENVIO, variante)
  const abierto = imprimirConDialogo(html)
  return { ok: Boolean(abierto), total, html }
}

/**
 * Enganche mínimo para el detalle del pedido: imprime 1 bulto con el último
 * diseño usado y avisa por `toast`. Quien rediseñe esa pantalla puede montar
 * `EtiquetaEnvioPopup` (components/delivery) para elegir bultos y diseño.
 */
export async function imprimirEtiquetaEnvioPedido(orden, { toast = null } = {}) {
  try {
    const resultado = await imprimirEtiquetasEnvio([orden])
    if (resultado.ok) toast?.success?.('Etiqueta de envío lista', 'Elegí el papel 100 × 150 mm en el diálogo de impresión.')
    else toast?.error?.('No se pudo imprimir la etiqueta', 'Revisá el bloqueo de ventanas del navegador.')
    return resultado
  } catch (cause) {
    toast?.error?.('No se pudo armar la etiqueta', cause?.message || 'Intentá de nuevo.')
    return { ok: false, total: 0 }
  }
}
