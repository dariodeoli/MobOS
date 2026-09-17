import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const ORDER_STATUS = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }
const WARRANTY_STATUS = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }
const LEVELS = { rapido: 'Comprobante rápido', completo: 'Comprobante completo', detallado: 'Comprobante detallado' }

export default function PedidoPublico() {
  const { token } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError(''); setOrder(null)
    fetch(`${API_URL}/api/orders/public/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Pedido no encontrado.'); if (active) setOrder(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar el pedido.') })
    return () => { active = false }
  }, [token])

  const pendiente = Number(order?.pendingPyg || 0)
  const aCredito = Boolean(order?.credit)

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Seguimiento de pedido</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{codigoPedido(order?.orderNumber) || 'Pedido'}</h1>
          {order?.customerName && <p className="mt-1 text-sm text-mute">Hola, {order.customerName}</p>}
          {order?.level && <p className="mt-2 text-[11px] uppercase tracking-wider text-mute">{LEVELS[order.level] || order.level}</p>}
        </header>
        {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-center text-sm text-bad">{error}</p>}
        {order && (
          <div className="space-y-4">
            {order.company?.name && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center">
                <p className="text-sm font-bold">{order.company.name}</p>
                {order.branch && (
                  <p className="mt-1 text-xs text-mute">
                    {order.branch.name}
                    {[order.branch.address, order.branch.city, order.branch.department].filter(Boolean).length ? ` · ${[order.branch.address, order.branch.city, order.branch.department].filter(Boolean).join(', ')}` : ''}
                    {order.branch.phone ? ` · ${order.branch.phone}` : ''}
                    {order.branch.instagram ? ` · @${order.branch.instagram}` : ''}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{ORDER_STATUS[order.status] || order.status}</h2>
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${order.status === 'COMPLETED' ? 'border-ok/30 bg-ok/10 text-ok' : order.status === 'CANCELLED' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-warn/30 bg-warn/10 text-warn'}`}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus}</span>
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2">
                {['PROCESSING', 'IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'DELIVERED'].map((step, index) => {
                  const current = ['PROCESSING', 'IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP', 'DELIVERED'].indexOf(order.fulfillmentStatus)
                  const done = index <= current
                  return (
                    <div key={step} className="text-center">
                      <div className={`mx-auto h-2 rounded-full ${done ? 'bg-fono-light' : 'bg-ink-600'}`} />
                      <p className={`mt-2 text-[10px] font-semibold ${done ? 'text-fore' : 'text-mute'}`}>{FULFILLMENT[step]}</p>
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-xs text-mute">Actualizado {order.updatedAt ? new Date(order.updatedAt).toLocaleString('es-PY') : '—'}</p>
            </section>

            {/* Totales: el saldo pendiente y el crédito se destacan siempre. */}
            <section className={`rounded-2xl border p-5 ${pendiente > 0 ? 'border-warn/40 bg-warn/5' : 'border-ink-600 bg-ink-900'}`}>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-mute">Total</span><b className="tabular-nums">{gs(order.totalPyg)}</b></div>
                <div className="flex items-center justify-between"><span className="text-mute">Pagado</span><b className="tabular-nums text-ok">{gs(order.paidPyg)}</b></div>
                <div className="flex items-center justify-between"><span className="text-mute">Pendiente</span><b className={`tabular-nums ${pendiente > 0 ? 'text-warn' : 'text-ok'}`}>{gs(pendiente)}</b></div>
                {Number(order.discountPyg || 0) > 0 && <div className="flex items-center justify-between"><span className="text-mute">Descuento</span><b className="tabular-nums text-warn">− {gs(order.discountPyg)}</b></div>}
                {Number(order.deliveryPyg || 0) > 0 && <div className="flex items-center justify-between"><span className="text-mute">Entrega</span><b className="tabular-nums">{gs(order.deliveryPyg)}</b></div>}
              </div>
              {aCredito && (
                <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                  <p className="font-bold uppercase tracking-wider">A crédito</p>
                  <p className="mt-1">
                    Saldo {gs(pendiente)}
                    {order.credit.creditDays ? ` · plazo ${order.credit.creditDays} días` : ''}
                    {order.credit.dueAt ? ` · vence ${new Date(order.credit.dueAt).toLocaleDateString('es-PY')}` : ''}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Productos</h2>
              <div className="mt-3 space-y-2">
                {(order.items || []).map((item, index) => (
                  <div key={index} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{item.description}</span>
                      <span className="shrink-0 text-mute">× {item.quantity}</span>
                    </div>
                    {order.level !== 'rapido' && (
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-mute">
                        <span>{item.quantity} × {gs(item.unitPricePyg)}{Number(item.discountPyg || 0) > 0 ? ` · descuento − ${gs(item.discountPyg)}` : ''}</span>
                        <span className="tabular-nums">{gs(item.totalPyg)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {order.payments?.length > 0 && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <h2 className="font-semibold">Pagos</h2>
                <div className="mt-3 space-y-2">
                  {order.payments.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{payment.methodLabel || payment.method}</p>
                        <p className="mt-0.5 text-xs text-mute">
                          {payment.paidAt ? new Date(payment.paidAt).toLocaleString('es-PY') : ''}
                          {payment.account ? ` · ${payment.account}` : ''}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-ok">{gs(payment.amountPyg)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {order.level === 'detallado' && order.timeline?.length > 0 && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <h2 className="font-semibold">Cronología</h2>
                <ol className="mt-3 space-y-3">
                  {order.timeline.map((evento, index) => (
                    <li key={index} className="flex gap-3 text-sm">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fono-light" />
                      <div className="min-w-0">
                        <p className="text-xs text-mute">{new Date(evento.at).toLocaleString('es-PY')}</p>
                        <p className="mt-0.5">
                          {evento.type === 'created' && 'Pedido creado'}
                          {evento.type === 'payment' && `Pago recibido: ${gs(evento.amountPyg)}${evento.methodLabel ? ` · ${evento.methodLabel}` : ''}${evento.account ? ` · ${evento.account}` : ''}`}
                          {evento.type === 'fulfillment' && `Entrega: ${FULFILLMENT[evento.metadata?.current] || evento.metadata?.current || 'actualizada'}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(order.customer || order.billing) && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-sm">
                <h2 className="font-semibold">Datos</h2>
                <div className="mt-3 space-y-1.5 text-mute">
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
              </section>
            )}

            {order.warranties?.length > 0 && (
              <section className="rounded-2xl border border-fono/25 bg-fono/5 p-5">
                <h2 className="font-semibold">Tus garantías</h2>
                <div className="mt-3 space-y-2">
                  {order.warranties.map(warranty => (
                    <Link key={warranty.token} to={`/garantia/${warranty.token}`} className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-900 px-3 py-3 transition hover:border-fono">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{warranty.productName}</p>
                        <p className="mt-0.5 text-xs text-mute">{WARRANTY_STATUS[warranty.status] || warranty.status}{warranty.daysRemaining != null ? ` · ${warranty.daysRemaining} días restantes` : ''}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-fono-light">Ver garantía →</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <p className="pt-2 text-center text-[11px] text-mute">
              Documento no fiscal · Generado por MobOS para {order.company?.name || 'la tienda'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
