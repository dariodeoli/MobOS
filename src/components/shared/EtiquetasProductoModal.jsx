import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import { gs } from '@/utils/calculos'
import { printHtml } from '@/utils/printHtml'
import { configImpresora, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { ticketEtiquetasProducto } from '@/lib/printing/tickets'
import { buildProductLabelsHtml } from '@/components/shared/OrderReceipt'
import { CELDA_IDENTIDAD_GRANDE } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { PIE_ACCIONES } from '@/components/shared/formulario'

// Etiquetas de producto/góndola: se eligen productos (o un rango por búsqueda),
// se define cuántas etiquetas por producto y salen por la térmica configurada
// (58/80 mm) o por el diálogo del navegador si no hay agente. El precio que se
// imprime es `precioPyg` del producto o el que venga ya resuelto por lista.
const claveDe = (product) => String(product?.id || product?.sku || product?.nombre || product?.name || '')
const nombreDe = (product) => product?.name || product?.nombre || 'Producto'
const precioDe = (product) => Number(product?.precioEtiqueta ?? product?.precioPyg ?? product?.pricePyg ?? product?.precioVenta ?? 0)
const formatosPorAncho = (ancho) => (Number(ancho) === 80 ? 'thermal-80' : 'thermal-58')

export default function EtiquetasProductoModal({ open, onClose, productos = [], seleccionInicial = [] }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [elegidos, setElegidos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [enviando, setEnviando] = useState(false)

  // La selección inicial se lee al abrir: el llamador puede recrear el array
  // en cada render (ids derivados de la lista visible) y no debe pisar la
  // selección que el operador ya está ajustando en el modal.
  const inicialRef = useRef(seleccionInicial)
  inicialRef.current = seleccionInicial
  useEffect(() => {
    if (!open) return
    setQuery('')
    setElegidos(Array.isArray(inicialRef.current) ? [...inicialRef.current] : [])
    setCantidades({})
  }, [open])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    const lista = Array.isArray(productos) ? productos : []
    if (!q) return lista
    return lista.filter((product) => `${nombreDe(product)} ${product?.sku || ''}`.toLowerCase().includes(q))
  }, [productos, query])

  const items = useMemo(
    () => elegidos
      .map((id) => productos.find((product) => claveDe(product) === id))
      .filter(Boolean)
      .map((product) => ({ product, cantidad: Math.max(1, Number(cantidades[claveDe(product)]) || 1) })),
    [elegidos, productos, cantidades],
  )
  const totalEtiquetas = items.reduce((suma, item) => suma + item.cantidad, 0)
  const alternar = (id) => setElegidos((actuales) => (actuales.includes(id) ? actuales.filter((actual) => actual !== id) : [...actuales, id]))
  const setCantidad = (id, valor) => setCantidades((actuales) => ({ ...actuales, [id]: valor.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2) }))
  async function conDialogo() {
    const { ancho } = configImpresora()
    await printHtml(await buildProductLabelsHtml(items, { format: formatosPorAncho(ancho) }))
  }
  async function imprimir() {
    if (!items.length || enviando) return
    setEnviando(true)
    try {
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumento(ticketEtiquetasProducto(items, { ancho }), { tipo: 'etiquetas-producto' })
      if (resultado?.ok) {
        if (resultado.encolado) toast.success('Etiquetas encoladas', resultado.remoto ? 'Las imprime el puente cuando las reclame.' : 'La impresora no respondió; se reintenta solo.')
        else toast.success('Etiquetas enviadas', `${totalEtiquetas} etiqueta(s) de ${items.length} producto(s).`)
        return
      }
      if (puedeCaerAlDialogo(resultado)) { await conDialogo(); return }
      toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas de góndola" size="amplio">
      <div className="space-y-4">
        <p className="text-sm text-mute">Elegí los productos y cuántas etiquetas de cada uno. El código de barras sale sobre el SKU (EAN-13 si el SKU lo es; si no, CODE128) y el precio es el de venta del producto.</p>
        <SearchField ariaLabel="Buscar por nombre o SKU" placeholder="Buscar por nombre o SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-ink-600 p-2">
          {visibles.map((product) => {
            const id = claveDe(product)
            const precio = precioDe(product)
            const marcado = elegidos.includes(id)
            return (
              <div key={id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 transition ${marcado ? 'border-fono/40 bg-fono/5' : 'border-ink-600'}`}>
                <label className="flex min-w-0 flex-1 items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-fono" checked={marcado} onChange={() => alternar(id)} aria-label={`Seleccionar ${nombreDe(product)}`} />
                  <span className="min-w-0">
                    <span className={cn('block', CELDA_IDENTIDAD_GRANDE)} title={nombreDe(product)}>{nombreDe(product)}</span>
                    <span className="block truncate text-[11px] text-mute">{product?.sku ? `SKU ${product.sku}` : 'Sin SKU'} · {precio > 0 ? gs(precio) : 'sin precio'}</span>
                  </span>
                </label>
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-mute">
                  Etiquetas
                  <Input className="h-8 w-14 text-center" inputMode="numeric" maxLength={2} disabled={!marcado} aria-label={`Cantidad de etiquetas de ${nombreDe(product)}`} value={cantidades[id] ?? '1'} onChange={(event) => setCantidad(id, event.target.value)} />
                </label>
              </div>
            )
          })}
          {!visibles.length && <p className="px-2 py-6 text-center text-sm text-mute">Ningún producto coincide con la búsqueda.</p>}
        </div>
        {items.length > 0 && <p className="text-xs text-mute">{items.length} producto(s) · {totalEtiquetas} etiqueta(s) en total.</p>}
        <div className={PIE_ACCIONES}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="outline" disabled={!items.length || enviando} onClick={conDialogo}><Icon name="download" className="h-4 w-4" />Descargar PDF</Button>
          <Button type="button" disabled={!items.length || enviando} onClick={imprimir}><Icon name="printer" className="h-4 w-4" />{enviando ? 'Enviando…' : 'Imprimir etiquetas'}</Button>
        </div>
      </div>
    </Modal>
  )
}
