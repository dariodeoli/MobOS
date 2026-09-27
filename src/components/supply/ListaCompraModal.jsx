import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Select, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import VistaPreviaPapel from '@/components/shared/VistaPreviaPapel'
import CompartirImagen from '@/components/shared/CompartirImagen'
import CompartirPdf from '@/components/shared/CompartirPdf'
import { FORMATOS_COMPROBANTE, buildListaCompraHtml } from '@/components/shared/OrderReceipt'
import { datosListaCompra } from '@/lib/printing/listaCompra'
import { ticketListaCompra } from '@/lib/printing/tickets'
import { configImpresora } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { getProductos } from '@/lib/storage'
import { printHtml } from '@/utils/printHtml'

// #278 (lista de compra de #250 §11): el papel que el comprador lleva al
// proveedor — productos agrupados con cantidades y prioridades, IMEI cargados o
// pendientes, recorrido y el código `COM-…`. La vista previa usa el mismo HTML
// que el PDF y la imagen compartida; la impresión directa sale por la impresora
// del tipo `lista-compra` (con el diálogo como respaldo honesto).
//
// Los datos salen del listado de compras: la API manda en cada línea la
// prioridad/origen/promesa/pedido de su necesidad y en la compra quién la cargó
// (ver `docs/LISTA-COMPRA.md` §1).

// El catálogo local aporta el color de la variante; la API, nombre y capacidad.
function productosDeLaCompra(compra) {
  const catalogo = getProductos()
  return (compra?.lines || []).map((linea) => {
    const local = catalogo.find((item) => item.id === linea.productId) || {}
    return {
      id: linea.productId,
      name: linea.product?.name || local.nombre || local.name,
      capacity: linea.product?.capacity || local.capacidad || local.capacity,
      color: linea.product?.color || local.color,
    }
  })
}

export default function ListaCompraModal({ compra, open, onClose }) {
  const toast = useToast()
  const [formato, setFormato] = useState('a4')
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)
  const [imprimiendo, setImprimiendo] = useState(false)

  const datos = useMemo(() => {
    if (!compra) return null
    const origen = (compra.lines || []).map((linea) => linea.needOrigin).find(Boolean) || ''
    return datosListaCompra(compra, { productos: productosDeLaCompra(compra), comprador: compra.createdBy?.name || '', origen })
  }, [compra])

  useEffect(() => {
    if (!open || !datos) return undefined
    let activo = true
    setCargando(true)
    setHtml('')
    buildListaCompraHtml(datos, { format: formato })
      .then((construido) => { if (activo) { setHtml(construido); setCargando(false) } })
      .catch(() => { if (activo) { setCargando(false); toast.error('No se pudo preparar la lista', 'Reintentá en un momento.') } })
    return () => { activo = false }
    // `datos` es estable por compra; el formato es el que rearma el papel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compra?.id, formato])

  // Impresión directa (agente/puente) con el diálogo como respaldo: mismo
  // camino que el manifiesto y el comprobante de recepción.
  async function imprimir() {
    if (!datos || imprimiendo) return
    setImprimiendo(true)
    try {
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumentoNoFiscal(ticketListaCompra(datos, { ancho }), {
        tipo: 'lista-compra',
        respaldo: () => printHtml(html),
      })
      if (resultado?.dialogo) toast.info('Lista lista', 'Se abrió para imprimir o guardar en PDF.')
      else if (resultado?.ok) toast.success('Lista enviada', `${datos.code} · ${datos.resumen.unidades} unidad(es).`)
      else toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } catch (causa) {
      toast.error('No se pudo imprimir', causa?.message || 'Reintentá en un momento.')
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Lista de compra · ${compra?.code || ''}`} size="amplio">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <Select aria-label="Formato de la lista" className="w-auto" value={formato} onChange={(evento) => setFormato(evento.target.value)}>
              {FORMATOS_COMPROBANTE.map(([id, etiqueta]) => <option key={id} value={id}>{etiqueta}</option>)}
            </Select>
          </label>
          <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <CompartirPdf
              construirHtml={() => html}
              nombre={`lista-compra-${compra?.code || 'compra'}`}
              titulo="Lista de compra"
              texto={`Lista de compra ${compra?.code || ''}`.trim()}
              formato={formato}
              disabled={!html || cargando}
            />
            <CompartirImagen
              construirHtml={() => html}
              nombre={`lista-compra-${compra?.code || 'compra'}`}
              titulo="Lista de compra"
              texto={`Lista de compra ${compra?.code || ''}`.trim()}
              formato={formato}
              disabled={!html || cargando}
            />
            <Button type="button" onClick={imprimir} disabled={!html || cargando || imprimiendo} data-testid="lista-compra-imprimir">
              <Icon name="printer" className="h-4 w-4" />{imprimiendo ? 'Enviando…' : 'Imprimir'}
            </Button>
          </span>
        </div>
        <p className="text-[11px] text-mute">
          El papel sale por la impresora del tipo «Lista de compra»; sin impresora configurada se abre el diálogo para imprimir o guardar en PDF.
        </p>
        <VistaPreviaPapel formato={formato} contenido={html} titulo="Vista previa de la lista de compra" />
      </div>
    </Modal>
  )
}
