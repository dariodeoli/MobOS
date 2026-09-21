import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'

const ORDER_STATUS = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }
const FULFILLMENT = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const WARRANTY_STATUS = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }
const LEVELS = { rapido: 'Resumen rápido', completo: 'Resumen completo' }
const fecha = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('es-PY') : '—')
const fechaHora = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Resumen de cuenta público del cliente: saldo, vencimientos, pedidos y —según
// el nivel del enlace— garantías activas, direcciones y comprobantes. No
// muestra costos, notas internas ni contactos de terceros.
export default function CuentaPublica() {
  const { token } = useParams()
  const [cuenta, setCuenta] = useState(null)
  const [error, setError] = useState('')
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    let active = true
    setError(''); setCuenta(null); setLogoOk(true)
    fetch(`${API_URL}/api/portal/${encodeURIComponent(token || '')}`)
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || payload?.error || 'Cuenta no encontrada.')
        if (active) setCuenta(payload)
      })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la cuenta.') })
    return () => { active = false }
  }, [token])

  const saldo = Number(cuenta?.balancePyg || 0)
  const alDia = cuenta && saldo <= 0
  const logoUrl = `${API_URL}/api/portal/${encodeURIComponent(token || '')}/logo`

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          {cuenta?.company?.logo && logoOk && (
            <img src={logoUrl} alt={cuenta.company?.name || 'Logo'} onError={() => setLogoOk(false)} className="mx-auto mb-4 h-14 w-auto max-w-[180px] object-contain" />
          )}
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Mi cuenta</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{cuenta?.company?.name || 'Estado de cuenta'}</h1>
          {cuenta?.customer?.name && <p className="mt-1 text-sm text-mute">Hola, {cuenta.customer.name}</p>}
          {cuenta?.level && <p className="mt-2 text-[11px] uppercase tracking-wider text-mute">{LEVELS[cuenta.level] || cuenta.level}</p>}
        </header>

        {error && (
          <div className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-8 text-center">
            <Icon name="alert" className="mx-auto h-6 w-6 text-bad" />
            <p className="mt-3 text-sm text-bad">{error}</p>
          </div>
        )}

        {cuenta && (
          <div className="space-y-4">
            {cuenta.customer?.publicNote && (
              <section className="rounded-2xl border border-fono/25 bg-fono/5 p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-mute">Nota de la tienda</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{cuenta.customer.publicNote}</p>
              </section>
            )}
            {/* Saldo pendiente: lo primero que el cliente necesita ver. */}
            <section className={`rounded-2xl border p-5 text-center ${alDia ? 'border-ok/30 bg-ok/5' : 'border-warn/40 bg-warn/5'}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-mute">Saldo pendiente</p>
              {alDia ? (
                <>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-ok">Al día</p>
                  <p className="mt-1 text-xs text-mute">No tenés pagos pendientes.</p>
                </>
              ) : (
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-warn">{gs(saldo)}</p>
              )}
            </section>

            {cuenta.dueDates?.length > 0 && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <h2 className="font-semibold">Vencimientos</h2>
                <div className="mt-3 space-y-2">
                  {cuenta.dueDates.map((vencimiento, index) => {
                    const vencido = Date.parse(vencimiento.dueAt) < Date.now()
                    return (
                      <div key={`${vencimiento.orderNumber}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{codigoPedido(vencimiento.orderNumber) || 'Pedido'}</p>
                          <p className={`mt-0.5 text-xs ${vencido ? 'text-bad' : 'text-mute'}`}>{vencido ? 'Venció el ' : 'Vence el '}{fecha(vencimiento.dueAt)}</p>
                        </div>
                        <span className={`shrink-0 font-semibold tabular-nums ${vencido ? 'text-bad' : 'text-warn'}`}>{gs(vencimiento.pendingPyg)}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Últimos pedidos</h2>
              {cuenta.orders?.length ? (
                <div className="mt-3 space-y-2">
                  {cuenta.orders.map((order, index) => (
                    <article key={`${order.orderNumber}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{codigoPedido(order.orderNumber) || 'Pedido'}</span>
                        <span className="shrink-0 font-bold tabular-nums">{gs(order.totalPyg)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">
                        <span>{fecha(order.createdAt)}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 font-semibold ${order.status === 'COMPLETED' ? 'border-ok/30 bg-ok/10 text-ok' : order.status === 'CANCELLED' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-warn/30 bg-warn/10 text-warn'}`}>{ORDER_STATUS[order.status] || order.status}</span>
                        <span>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus}</span>
                        {Number(order.pendingPyg || 0) > 0 && <span className="font-semibold text-warn">Pendiente {gs(order.pendingPyg)}</span>}
                      </div>
                      {order.receiptToken && (
                        <Link to={`/pedido/${encodeURIComponent(order.receiptToken)}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-fono-light transition hover:underline">
                          <Icon name="receipt" className="h-3.5 w-3.5" />
                          Ver comprobante
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-mute">Todavía no tenés pedidos registrados.</p>
              )}
            </section>

            {cuenta.level === 'completo' && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <h2 className="font-semibold">Garantías activas</h2>
                {cuenta.warranties?.length ? (
                  <div className="mt-3 space-y-2">
                    {cuenta.warranties.map((warranty, index) => (
                      <div key={`${warranty.serial}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{warranty.description || 'Equipo'}</span>
                          <span className="shrink-0 rounded-md border border-fono/25 bg-fono/10 px-1.5 py-0.5 text-[11px] font-semibold text-fono-light">{WARRANTY_STATUS[warranty.status] || warranty.status}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-mute">{warranty.serial}</p>
                        <p className="mt-0.5 text-xs text-mute">
                          {warranty.expiresAt ? `Vence ${fecha(warranty.expiresAt)}${warranty.daysRemaining != null ? ` · ${warranty.daysRemaining} días restantes` : ''}` : 'Sin vencimiento registrado'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-mute">No tenés garantías activas.</p>
                )}
              </section>
            )}

            {cuenta.level === 'completo' && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-sm">
                <h2 className="font-semibold">Direcciones</h2>
                {cuenta.addresses?.length ? (
                  <div className="mt-3 space-y-2 text-mute">
                    {cuenta.addresses.map((address, index) => (
                      <p key={`${address.label}-${index}`}>
                        <b className="text-fore">{address.label || 'Dirección'}</b>
                        {address.isDefault ? ' · Principal' : ''}
                        <br />
                        {[address.address, address.city, address.department, address.country].filter(Boolean).join(', ')}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-mute">Sin direcciones registradas.</p>
                )}
              </section>
            )}

            {cuenta.orders?.some(order => order.dueAt && Number(order.pendingPyg || 0) > 0) && (
              <p className="text-center text-[11px] text-mute">Actualizado {fechaHora(new Date())}</p>
            )}

            <p className="pt-2 text-center text-[11px] text-mute">
              Documento no fiscal · Generado por MobOS para {cuenta.company?.name || 'la tienda'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
