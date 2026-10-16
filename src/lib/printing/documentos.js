// Documentos no fiscales (nota de entrega, remisión, recibo interno, proforma):
// flujo común de emisión desde la UI. Primero intenta la térmica (agente local
// o puente); solo cuando el fallo fue CLARO cae al diálogo del navegador con el
// HTML de respaldo. Tras encolar o un resultado incierto no abre nada: el
// reintento del agente ya podría imprimir el papel.
import { imprimirConDialogo, imprimirDocumento } from './agent'
import { puedeCaerAlDialogo } from './ruteo'
import { ticketsDesdeHtml } from './htmlEscpos'

// Una sola fuente HTML para vista previa, salida térmica rasterizada y diálogo.
// El respaldo conserva exactamente el documento que se intentó enviar.
export async function imprimirHtmlComun(html, { tipo = '', formato = 'thermal-80', contexto, ref = '', etiquetas = false } = {}) {
  const resultado = await imprimirDocumento(
    ({ impresora }) => ticketsDesdeHtml(html, { impresora, formato, etiquetas }),
    { tipo, contexto, ref },
  )
  if (resultado?.ok || !puedeCaerAlDialogo(resultado)) return { ...resultado, dialogo: false }
  return { ...resultado, dialogo: Boolean(imprimirConDialogo(html)) }
}

export async function imprimirDocumentoNoFiscal(ticket, { tipo = '', respaldo = null } = {}) {
  const resultado = await imprimirDocumento(ticket, { tipo })
  if (resultado?.ok || !puedeCaerAlDialogo(resultado)) return { ...resultado, dialogo: false }
  const abierto = typeof respaldo === 'function' ? await respaldo() : false
  return { ...resultado, dialogo: Boolean(abierto) }
}
