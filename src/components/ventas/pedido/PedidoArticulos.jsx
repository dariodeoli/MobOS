import { Link, useLocation } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import FotoProducto from '@/components/shared/FotoProducto'
import { Badge, Button, Money } from '@/components/ui'
import { ESTADO_LABEL, ESTADO_TONO, plazoPrometido } from '@/lib/ventaSinStock'

// Artículos del pedido estilo Shopify: miniatura, nombre (abre la ficha del
// producto), IMEI/variante en gris chico (cada IMEI abre su unidad), «Gs precio × [cant]»
// y el total a la derecha. Los enlaces solo existen donde el rol llega a esa pantalla.
export default function PedidoArticulos({ items = [], cantidad = 0, esDemo = false, puedeVerStock = false, sobrePedido = null, onAvisar = null, avisando = false }) {
  const ubicacion = useLocation()
  const volverA = `${ubicacion.pathname}${ubicacion.search}`
  return (
    <section className="ventas-f3-detail-section" data-testid="pedido-articulos">
      <h3 className="ventas-f3-card-title"><Icon name="box" className="h-3.5 w-3.5" /> Artículos preparados <span className="ventas-f3-card-sub">{items.length ? `${cantidad} artículo${cantidad === 1 ? '' : 's'}` : ''}</span></h3>
      <div className="divide-y divide-ink-600/70 px-3 pb-1">
        {items.map((item, index) => {
          const serials = Array.isArray(item.serials) ? item.serials : []
          const productoId = item.productId || item.productoId || ''
          const fichaProducto = productoId ? `/productos?producto=${encodeURIComponent(productoId)}` : ''
          const miniatura = <FotoProducto src={item.thumbUrl || item.imageUrl || item.imagen || ''} size={40} icono="box" />
          const descuento = Number(item.discountPyg || 0)
          // Venta sin stock: estado en vivo de la línea (sin costos) y, al llegar, el aviso al cliente.
          const seguimiento = (sobrePedido?.lineas || []).find((fila) => fila.itemId === item.id && fila.estado)
          const plazo = seguimiento && seguimiento.estado !== 'LLEGO' && seguimiento.estado !== 'ENTREGADO' ? plazoPrometido(seguimiento.prometidaEl) : null
          return (
            <article key={item.id || index} className="ventas-f3-detail-item items-start py-2.5" data-testid="pedido-articulo">
              <div className="flex min-w-0 items-start gap-3">
                {fichaProducto
                  ? <Link to={fichaProducto} state={{ volverA }} aria-label={`Ver ficha de ${item.description}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">{miniatura}</Link>
                  : miniatura}
                <div className="min-w-0">
                  {fichaProducto
                    ? <Link to={fichaProducto} state={{ volverA }} data-testid="pedido-articulo-ficha" className="ventas-f3-name block text-fono-light hover:underline">{item.description}</Link>
                    : <p className="ventas-f3-name">{item.description}</p>}
                  {serials.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-mute">
                      {serials.map((serial) => (puedeVerStock && !esDemo
                        ? <Link key={serial} to={`/stock/unidades?q=${encodeURIComponent(serial)}`} state={{ volverA }} data-testid="pedido-imei-ficha" className="font-mono hover:text-fono-light hover:underline">IMEI {serial}</Link>
                        : <span key={serial} className="font-mono">IMEI {serial}</span>))}
                    </p>
                  )}
                  {item.variant && <p className="mt-0.5 text-[11px] text-mute">{item.variant}</p>}
                  {seguimiento && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" data-testid="pedido-articulo-sobre-pedido">
                      <Badge color={ESTADO_TONO[seguimiento.estado] || 'slate'}>{ESTADO_LABEL[seguimiento.estado]}</Badge>
                      {plazo && <span className={plazo.tono}>{plazo.texto}</span>}
                      {seguimiento.avisadoEl && <span className="text-ok">Cliente avisado</span>}
                      {seguimiento.estado === 'LLEGO' && onAvisar && (
                        <Button type="button" variant="outline" className="min-h-11" disabled={avisando} onClick={onAvisar} data-testid="pedido-avisar-llegada">
                          {avisando ? 'Preparando…' : seguimiento.avisadoEl ? 'Volver a avisar' : 'Avisar al cliente'}
                        </Button>
                      )}
                    </p>
                  )}
                  {(item.costPending || Number(item.serialsPending || 0) > 0 || Number(item.stockPending || 0) > 0) && !seguimiento && (
                    <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-warn">
                      {Number(item.serialsPending || 0) > 0 && <span>{item.serialsPending} sin IMEI (sobre pedido)</span>}
                      {Number(item.stockPending || 0) > 0 && <span>{item.stockPending} sobre pedido</span>}
                      {item.costPending && <span>costo pendiente</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums"><Money value={Number(item.totalPyg ?? 0)} /></p>
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-mute tabular-nums">
                  <Money value={Number(item.unitPricePyg ?? 0)} />
                  <span aria-hidden="true">×</span>
                  <span className="grid min-w-5 place-items-center rounded border border-ink-500 px-1 text-fore" aria-label={`Cantidad ${item.quantity || 1}`}>{item.quantity || 1}</span>
                  {descuento > 0 && <span> · −<Money value={descuento} /></span>}
                </p>
              </div>
            </article>
          )
        })}
        {!items.length && <p className="py-3 text-sm text-mute">Sin artículos detallados.</p>}
      </div>
    </section>
  )
}
