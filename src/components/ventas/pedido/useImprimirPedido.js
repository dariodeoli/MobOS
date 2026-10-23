import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@/components/ui'
import {
  buildDeliveryNoteHtml,
  buildOrderReceiptHtml,
  formatoPreferido,
  nivelPreferido,
  tokenDeNivel,
} from '@/components/shared/OrderReceipt'
import { printHtml } from '@/utils/printHtml'
import { aplicarDisenoPredeterminado } from '@/lib/printing/disenoPro'
import { configImpresora } from '@/lib/printing/agent'
import { imprimirHtmlComun } from '@/lib/printing/documentos'
import { documentoDeVenta } from '@/lib/printing/ventaComprobanteLocal'
import { conBandaDemo } from '@/lib/printing/bandaDemo'
import {
  FORMATOS_IMPRESION_PEDIDO,
  etiquetaFormatoPedido,
  formatoPedidoEfectivo,
  formatoPredeterminadoEmpresa,
  recordarFormatoPedido,
} from '@/lib/printing/ultimoFormatoPedido'
import { useSesion } from '@/lib/sesion'

// Imprimir un pedido con un formato ya elegido. El botón principal usa el último
// formato de ESTA persona (guardado por usuario); elegir otro en el ▾ imprime con
// ese y pasa a ser el último. Sin historial, el predeterminado de la empresa.
// Demo: vista de impresión del navegador con datos ficticios y banda «Demo».
export function predeterminadoDeLaEmpresa() {
  let ancho = 0
  try { ancho = Number(configImpresora()?.ancho) || 0 } catch { ancho = 0 }
  return formatoPredeterminadoEmpresa({ ancho, formatoPreferido: formatoPreferido() })
}

export default function useImprimirPedido({ order, ordenComprobante, esDemo, imprimirNotaEntrega }) {
  const toast = useToast()
  const { usuario, empresa, sucursal, sesion } = useSesion()
  const contexto = useMemo(() => ({ empresa, sucursal, vendedor: sesion?.nombre }), [empresa, sucursal, sesion?.nombre])
  // Se relee al renderizar: tras imprimir, `version` fuerza el cambio del botón principal.
  const [version, setVersion] = useState(0)
  const [imprimiendo, setImprimiendo] = useState(false)
  const formatoActual = useMemo(
    () => formatoPedidoEfectivo(usuario?.id, predeterminadoDeLaEmpresa()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuario?.id, version],
  )

  const armarHtml = useCallback(async (formato) => {
    if (formato === 'nota-entrega') return buildDeliveryNoteHtml(ordenComprobante, { format: 'a4' })
    const documento = documentoDeVenta(ordenComprobante, contexto)
    const nivel = formato === 'pagina' ? 'detallado' : nivelPreferido()
    const formatoFisico = formato === 'ticket-80' ? 'thermal-80' : 'a4'
    const token = await tokenDeNivel(documento.id, nivel)
    const html = await buildOrderReceiptHtml(documento, { level: nivel, format: formatoFisico, token, contexto })
    return formatoFisico.startsWith('thermal') ? aplicarDisenoPredeterminado('ticket', html) : html
  }, [ordenComprobante, contexto])

  const imprimir = useCallback(async (formato = formatoActual) => {
    if (imprimiendo || !order) return
    setImprimiendo(true)
    recordarFormatoPedido(usuario?.id, formato)
    setVersion((valor) => valor + 1)
    const nombre = etiquetaFormatoPedido(formato)
    try {
      if (formato === 'nota-entrega' && !esDemo) { await imprimirNotaEntrega(); return }
      const html = await armarHtml(formato)
      if (esDemo) {
        const abierto = printHtml(conBandaDemo(html))
        if (abierto) toast.success(`${nombre} listo (demo)`, 'Datos ficticios: elegí «Guardar como PDF» o la impresora en el diálogo.')
        else toast.error('No se pudo abrir la impresión', 'Probá de nuevo.')
        return
      }
      if (formato === 'ticket-80') {
        const referencia = String(order.orderNumber || order.codigo || order.id || '')
        const resultado = await imprimirHtmlComun(html, { tipo: 'comprobante', formato: 'thermal-80', ref: referencia })
        if (resultado.ok) toast.success(resultado.encolado ? 'Ticket encolado' : 'Ticket enviado a la impresora', resultado.encolado ? 'Lo imprime el puente cuando la impresora responda.' : '')
        else if (!resultado.dialogo) toast.error('No se pudo imprimir el ticket', resultado.error || 'Revisá la impresora.')
        return
      }
      const abierto = printHtml(html)
      if (abierto) toast.success(`${nombre} listo`, 'Elegí la impresora o «Guardar como PDF» en el diálogo.')
      else toast.error('No se pudo abrir la impresión', 'Probá de nuevo o usá la vista previa.')
    } catch (cause) {
      toast.error('No se pudo preparar la impresión', cause?.message || 'Probá de nuevo.')
    } finally { setImprimiendo(false) }
  }, [armarHtml, esDemo, formatoActual, imprimiendo, imprimirNotaEntrega, order, toast, usuario?.id])

  return { formatoActual, etiquetaActual: etiquetaFormatoPedido(formatoActual), formatos: FORMATOS_IMPRESION_PEDIDO, imprimir, imprimiendo }
}
