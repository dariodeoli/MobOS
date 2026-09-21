import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { fechaHora } from '@/utils/fecha'
import { codigoPedido, totalesPedido } from '@/utils/pedido'
import { varianteDeTema } from '@/lib/tenantLogo'
import SeccionColapsable from '@/components/shared/SeccionColapsable'
import { Aviso, CeldaMoneda, FilaDato } from '@/components/ui'
import { CELDA_DATO, ROTULO_SECCION } from '@/components/shared/tabla'
import { ESTADO_ENTREGA, ESTADO_GARANTIA, ESTADO_PEDIDO } from '@/lib/estadosPedido'
const LEVELS = { rapido: 'Comprobante rápido', completo: 'Comprobante completo', detallado: 'Comprobante detallado' }
const PASOS = ['PROCESSING', 'IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'DELIVERED']

export default function PedidoPublico() {
  const { token } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [logoOk, setLogoOk] = useState(true)
  useEffect(() => {
    let active = true
    setError(''); setOrder(null); setLogoOk(true)
    fetch(`${API_URL}/api/orders/public/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Pedido no encontrado.'); if (active) setOrder(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar el pedido.') })
    return () => { active = false }
  }, [token])

  // Mismo cálculo que el comprobante impreso (utils/pedido): el cliente ve el
  // total, lo pagado y el saldo que salieron en el papel.
  const { total, pagado, pendiente } = totalesPedido(order)
  const aCredito = Boolean(order?.credit)
  const entregadoConSaldo = ['DELIVERED', 'PICKED_UP'].includes(order?.fulfillmentStatus) && pendiente > 0
  const tracking = order?.tracking
  const etiquetaSeguimiento = tracking?.estadoLabel || ESTADO_ENTREGA[order?.fulfillmentStatus] || order?.fulfillmentStatus
  const encabezadoSeguimiento = tracking?.encabezado || 'Seguimiento de pedido'
  const etiquetaEntrega = entregadoConSaldo
    ? `${etiquetaSeguimiento} · ${aCredito ? 'a crédito' : 'pagado parcialmente'}`
    : etiquetaSeguimiento
  const tonoEntrega = aCredito && entregadoConSaldo
    ? 'border-bad/30 bg-bad/10 text-bad'
    : entregadoConSaldo
      ? 'border-warn/30 bg-warn/10 text-warn'
      : order?.status === 'COMPLETED' ? 'border-ok/30 bg-ok/10 text-ok' : order?.status === 'CANCELLED' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-warn/30 bg-warn/10 text-warn'

  const pasoActual = PASOS.indexOf(order?.fulfillmentStatus)
  // Línea de progreso del método de entrega (#191): el backend manda los pasos
  // que aplican (delivery, retiro, retiro en otra sucursal o traslado) con su
  // fecha; sin ese dato se cae al listado histórico genérico.
  const pasosSeguimiento = tracking?.pasos?.length
    ? tracking.pasos
    : PASOS.map((step, index) => ({ key: step, label: ESTADO_ENTREGA[step], hecho: index <= pasoActual, actual: order?.fulfillmentStatus === step, at: null }))
  const items = order?.items || []
  const pagos = order?.payments || []
  const movimientos = order?.level === 'detallado' ? (order.timeline || []) : []
  const garantias = order?.warranties || []
  const cantidadArticulos = items.reduce((suma, item) => suma + Number(item.quantity || 1), 0)
  const facturacion = [order?.customer?.phone ? `${order.customer.countryCode || '+595'} ${order.customer.phone}` : '', order?.customer?.email || ''].filter(Boolean).join(' · ')
  const ultimoMovimiento = movimientos[0]?.at ? fechaHora(movimientos[0].at) : ''

  return (
    <main className="min-h-screen bg-ink-950 px-3 py-6 text-fore sm:px-4 sm:py-10">
      <style>{`@media print{body,main{background:#fff!important}main,main *{color:#000!important}section{background:#fff!important;border-color:#cbd5e1!important}section>div[hidden]{display:block!important}button[aria-expanded] svg{display:none!important}}`}</style>
      <div className="mx-auto max-w-xl space-y-3">
        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}
        {order && (
          <>
            {/* Encabezado: tienda, código y estado de un vistazo. */}
            <header className="rounded-2xl border border-ink-600 bg-ink-900 px-4 py-3">
              <div className="flex items-center gap-3">
                {logoOk && (
                  <>
                    {/* Pantalla: la variante sigue al fondo activo (#163). Papel:
                        siempre la variante para fondo claro. */}
                    <img
                      src={`${API_URL}/api/orders/public/${encodeURIComponent(token || '')}/logo?variant=${varianteDeTema()}`}
                      alt={`Logo de ${order.company?.name}`}
                      onError={() => setLogoOk(false)}
                      className="h-10 w-auto max-w-[120px] shrink-0 object-contain print:hidden"
                    />
                    <img
                      src={`${API_URL}/api/orders/public/${encodeURIComponent(token || '')}/logo?variant=light`}
                      alt=""
                      className="hidden h-10 w-auto max-w-[120px] shrink-0 object-contain print:block"
                    />
                  </>
                )}
                <div className="min-w-0 flex-1">
                  {order.company?.name && <p className="truncate text-sm font-bold">{order.company.name}</p>}
                  {order.branch && (
                    <p className={CELDA_DATO}>
                      {order.branch.name}
                      {[order.branch.address, order.branch.city, order.branch.department].filter(Boolean).length ? ` · ${[order.branch.address, order.branch.city, order.branch.department].filter(Boolean).join(', ')}` : ''}
                      {order.branch.phone ? ` · ${order.branch.phone}` : ''}
                      {order.branch.instagram ? ` · @${order.branch.instagram}` : ''}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold ${tonoEntrega}`}>{etiquetaEntrega}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-ink-600/70 pt-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[.2em] text-fono-light">{encabezadoSeguimiento}</p>
                  <h1 className="text-2xl font-bold tracking-tight">{codigoPedido(order.orderNumber) || 'Pedido'}</h1>
                  <p className="text-xs text-mute">
                    {order.customerName ? `Hola, ${order.customerName}` : 'Tu pedido'}
                    {order.level ? ` · ${LEVELS[order.level] || order.level}` : ''}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-mute">Saldo pendiente</p>
                  <p className={`text-lg font-bold tabular-nums ${pendiente > 0 ? 'text-warn' : 'text-ok'}`}>{gs(pendiente)}</p>
                </div>
              </div>
            </header>

            {/* Pedido: estado de la entrega y totales. Lo esencial, siempre visible. */}
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className={ROTULO_SECCION}>Estado del pedido</h2>
                <span className="text-[11px] text-mute">{ESTADO_PEDIDO[order.status] || order.status} · actualizado {fechaHora(order.updatedAt)}</span>
              </div>
              <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pasosSeguimiento.length}, minmax(0, 1fr))` }}>
                {pasosSeguimiento.map(paso => (
                  <div key={paso.key} className="text-center">
                    <div className={`h-1.5 rounded-full ${paso.hecho ? 'bg-fono-light' : 'bg-ink-600'} ${paso.actual ? 'ring-2 ring-fono/40' : ''}`} />
                    <p className={`mt-1.5 text-[9px] font-semibold leading-tight sm:text-[10px] ${paso.hecho ? 'text-fore' : 'text-mute'}`}>{paso.label}</p>
                    {paso.at && <p className="text-[9px] text-mute">{fechaHora(paso.at)}</p>}
                  </div>
                ))}
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-ink-600/70 pt-3 text-sm">
                <FilaDato etiqueta="Total" etiquetaComo="dt" valorComo="dd" valor={gs(total)} />
                <FilaDato etiqueta="Pagado" etiquetaComo="dt" valorComo="dd" valor={gs(pagado)} tono="ok" />
                <FilaDato etiqueta="Pendiente" etiquetaComo="dt" valorComo="dd" valor={gs(pendiente)} tono={pendiente > 0 ? 'warn' : 'ok'} />
                {Number(order.discountPyg || 0) > 0 && <FilaDato etiqueta="Descuento" etiquetaComo="dt" valorComo="dd" valor={`− ${gs(order.discountPyg)}`} tono="warn" />}
                {Number(order.deliveryPyg || 0) > 0 && <FilaDato etiqueta="Entrega" etiquetaComo="dt" valorComo="dd" valor={gs(order.deliveryPyg)} />}
              </dl>
              {aCredito && (
                <div className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
                  <p className="font-bold uppercase tracking-wider">{entregadoConSaldo ? 'Entregado a crédito' : 'A crédito'}</p>
                  <p className="mt-1">
                    Saldo {gs(pendiente)}
                    {order.credit.creditDays ? ` · plazo ${order.credit.creditDays} días` : ''}
                    {order.credit.dueAt ? ` · vence ${new Date(order.credit.dueAt).toLocaleDateString('es-PY')}` : ''}
                  </p>
                </div>
              )}
            </section>

            <SeccionColapsable
              id={`pedido-publico-${token}-articulos`}
              titulo="Artículos"
              icono="box"
              resumen={items.length ? `${cantidadArticulos} artículo${cantidadArticulos === 1 ? '' : 's'} · ${gs(total)}` : 'Sin artículos detallados'}
            >
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="rounded-xl bg-ink-800/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{item.description}</span>
                      <span className="shrink-0 text-mute">× {item.quantity}</span>
                    </div>
                    {order.level !== 'rapido' && (
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-mute">
                        <span>{item.quantity} × {gs(item.unitPricePyg)}{Number(item.discountPyg || 0) > 0 ? ` · descuento − ${gs(item.discountPyg)}` : ''}</span>
                        <CeldaMoneda valor={item.totalPyg} />
                      </div>
                    )}
                  </div>
                ))}
                {!items.length && <p className="text-sm text-mute">El detalle de artículos no está disponible en este enlace.</p>}
              </div>
            </SeccionColapsable>

            {pagos.length > 0 && (
              <SeccionColapsable
                id={`pedido-publico-${token}-pagos`}
                titulo="Pagos"
                icono="money"
                resumen={`${pagos.length} pago${pagos.length === 1 ? '' : 's'} · ${gs(pagado)}`}
              >
                <div className="space-y-2">
                  {pagos.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800/60 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{payment.methodLabel || payment.method}</p>
                        <p className="mt-0.5 text-xs text-mute">
                          {payment.paidAt ? new Date(payment.paidAt).toLocaleString('es-PY') : ''}
                          {payment.account ? ` · ${payment.account}` : ''}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                        </p>
                      </div>
                      <CeldaMoneda valor={payment.amountPyg} tono="ok" />
                    </div>
                  ))}
                </div>
              </SeccionColapsable>
            )}

            {(order.customer || order.billing) && (
              <SeccionColapsable
                id={`pedido-publico-${token}-cliente`}
                titulo="Tus datos"
                icono="user"
                resumen={[order.customer?.name || order.billing?.name, facturacion].filter(Boolean).join(' · ') || 'Datos de contacto y facturación'}
              >
                <div className="space-y-1.5 text-sm text-mute">
                  {order.customer?.name && <p><b className="text-fore">{order.customer.name}</b>{order.customer.document ? ` · ${order.customer.document}` : ''}</p>}
                  {order.customer?.phone && <p>{order.customer.countryCode || ''} {order.customer.phone}</p>}
                  {order.customer?.email && <p className="truncate">{order.customer.email}</p>}
                  {(order.customer?.addresses || []).map((address, index) => (
                    <p key={index}>{address.label ? `${address.label}: ` : ''}{[address.address, address.city, address.department, address.country].filter(Boolean).join(', ')}</p>
                  ))}
                  {order.billing && <p>Factura a: <b className="text-fore">{order.billing.name || 'Sin razón social'}</b>{order.billing.document ? ` · RUC ${order.billing.document}` : ''}</p>}
                  {order.seller && <p>Vendedor: {order.seller}</p>}
                  {order.deliveryType && <p>Entrega: {order.deliveryType}{order.deliveryNotes ? ` · ${order.deliveryNotes}` : ''}</p>}
                </div>
              </SeccionColapsable>
            )}

            {movimientos.length > 0 && (
              <SeccionColapsable
                id={`pedido-publico-${token}-cronologia`}
                titulo="Cronología"
                icono="clock"
                resumen={`${movimientos.length} movimiento${movimientos.length === 1 ? '' : 's'}${ultimoMovimiento ? ` · último ${ultimoMovimiento}` : ''}`}
              >
                <ol className="space-y-2.5">
                  {movimientos.map((evento, index) => (
                    <li key={index} className="flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fono-light" />
                      <div className="min-w-0">
                        <p className="text-xs text-mute">{fechaHora(evento.at)}</p>
                        <p className="mt-0.5">
                          {evento.type === 'created' && 'Pedido creado'}
                          {evento.type === 'payment' && `Pago recibido: ${gs(evento.amountPyg)}${evento.methodLabel ? ` · ${evento.methodLabel}` : ''}${evento.account ? ` · ${evento.account}` : ''}`}
                          {evento.type === 'fulfillment' && `Entrega: ${ESTADO_ENTREGA[evento.metadata?.current] || evento.metadata?.current || 'actualizada'}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </SeccionColapsable>
            )}

            {garantias.length > 0 && (
              <SeccionColapsable
                id={`pedido-publico-${token}-garantias`}
                titulo="Tus garantías"
                icono="shield"
                resumen={`${garantias.length} garantía${garantias.length === 1 ? '' : 's'} · abrí el enlace para ver el estado`}
              >
                <div className="space-y-2">
                  {garantias.map(warranty => (
                    <Link key={warranty.token} to={`/garantia/${warranty.token}`} className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2.5 transition hover:border-fono">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{warranty.productName}</p>
                        <p className="mt-0.5 text-xs text-mute">{ESTADO_GARANTIA[warranty.status] || warranty.status}{warranty.daysRemaining != null ? ` · ${warranty.daysRemaining} días restantes` : ''}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-fono-light">Ver garantía →</span>
                    </Link>
                  ))}
                </div>
              </SeccionColapsable>
            )}

            <p className="pt-1 text-center text-[11px] text-mute">
              Documento no fiscal · Generado por MobOS para {order.company?.name || 'la tienda'}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
