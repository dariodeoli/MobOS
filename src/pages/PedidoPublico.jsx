import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'

const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const ORDER_STATUS = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }
const WARRANTY_STATUS = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }

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
  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Seguimiento de pedido</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{order?.orderNumber || 'Pedido'}</h1>
          {order?.customerName && <p className="mt-1 text-sm text-mute">Hola, {order.customerName}</p>}
        </header>
        {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-center text-sm text-bad">{error}</p>}
        {order && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{ORDER_STATUS[order.status] || order.status}</h2>
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${order.status === 'COMPLETED' ? 'border-ok/30 bg-ok/10 text-ok' : order.status === 'CANCELLED' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-warn/30 bg-warn/10 text-warn'}`}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus}</span>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2">
                {['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED'].map((step, index) => {
                  const current = ['PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED'].indexOf(order.fulfillmentStatus)
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
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Productos</h2>
              <div className="mt-3 space-y-2">
                {(order.items || []).map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{item.description}</span>
                    <span className="shrink-0 text-mute">× {item.quantity}</span>
                  </div>
                ))}
              </div>
            </section>
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
          </div>
        )}
      </div>
    </main>
  )
}
