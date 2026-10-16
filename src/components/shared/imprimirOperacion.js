// Impresión de los papeles por operación (#426): primero la térmica (agente o
// puente) y solo si el fallo fue CLARO cae al diálogo con el HTML (A4/rollo).
// Tras encolar o un resultado incierto no se abre nada: el reintento del
// agente podría duplicar el papel.
import { api } from '@/lib/api'
import { formatoPermitido } from '@/lib/printing/preferencias'
import { capturarContextoImpresion, configImpresora } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal, imprimirHtmlComun } from '@/lib/printing/documentos'
import { documentoCambio, documentoDevolucion, documentoTarjetaRegalo } from '@/lib/printing/operacionPapel'
import { ticketCambio, ticketDevolucion, ticketTarjetaRegalo } from '@/lib/printing/ticketsOperacion'
import { buildReciboRegaloHtml, printCambio, printDevolucion, printTarjetaRegalo } from './OperacionReceipt'
import { trackingUrlFor } from './OrderReceipt'

const formatoDe = (ancho) => formatoPermitido(ancho === 58 ? 'thermal-58' : 'thermal-80')

export function textoResultado(resultado, nombre) {
  if (resultado?.ok) return resultado.encolado ? `${nombre} encolado: la impresora no respondió y se reintenta sola.` : `${nombre} enviado a la impresora.`
  return ''
}

export async function imprimirDevolucion(orden, datos = {}) {
  const { ancho } = configImpresora()
  return imprimirDocumentoNoFiscal(ticketDevolucion(documentoDevolucion(orden, { ...datos, enlace: trackingUrlFor(orden) }), { ancho }), {
    tipo: 'devolucion',
    respaldo: () => printDevolucion(orden, { format: formatoDe(ancho), datos }),
  })
}

export async function imprimirCambio(orden, datos = {}) {
  const { ancho } = configImpresora()
  return imprimirDocumentoNoFiscal(ticketCambio(documentoCambio(orden, { ...datos, enlace: trackingUrlFor(orden) }), { ancho }), {
    tipo: 'cambio',
    respaldo: () => printCambio(orden, { format: formatoDe(ancho), datos }),
  })
}

export async function imprimirReciboRegalo(orden) {
  const contexto = capturarContextoImpresion()
  const { ancho } = configImpresora()
  const formato = formatoDe(ancho)
  const html = await buildReciboRegaloHtml(orden, { format: formato })
  return imprimirHtmlComun(html, { contexto, tipo: 'recibo-regalo', formato })
}

export async function imprimirTarjetaRegalo(tarjeta, contexto = {}) {
  const { ancho } = configImpresora()
  return imprimirDocumentoNoFiscal(ticketTarjetaRegalo(documentoTarjetaRegalo(tarjeta, contexto), { ancho }), {
    tipo: 'tarjeta-regalo',
    respaldo: () => printTarjetaRegalo(tarjeta, { format: formatoDe(ancho), contexto }),
  })
}

// Pedido que reemplaza en un cambio: se busca por número y se trae completo
// (con artículos). Sin coincidencia devuelve null y el papel sale sin «Nuevos».
export async function cargarPedidoPorNumero(numero) {
  const buscado = String(numero || '').trim()
  if (!buscado) return null
  try {
    const filas = await api.get(`/api/orders?q=${encodeURIComponent(buscado)}&limit=20`)
    const fila = (Array.isArray(filas) ? filas : filas?.items || []).find((orden) => String(orden.orderNumber || orden.codigo || '').toLowerCase() === buscado.toLowerCase())
    return fila?.id ? await api.get(`/api/orders/${encodeURIComponent(fila.id)}`) : null
  } catch (cause) {
    console.error('No se pudo cargar el pedido del cambio para el papel.', cause)
    return null
  }
}
