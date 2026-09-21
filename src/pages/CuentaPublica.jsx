import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { fechaDia as fecha, fechaHora } from '@/utils/fecha'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'
import { PortalCargando, PortalEncabezado, PortalEstado, PortalFallo, PortalPie, PortalSeccion } from '@/components/customerPortal/PortalUI'
import { demoCuentaPayload, esTokenDemo } from '@/lib/demoClientes'
import { NIVELES_PORTAL } from '@/lib/customerPortal'
import { ESTADO_ENTREGA, ESTADO_GARANTIA, ESTADO_PEDIDO, tonoGarantia, tonoPedido } from '@/lib/estadosPedido'

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
    // Portal demo (#194): el token `demo-…` se arma en el navegador con datos
    // ficticios, sin llamar al API.
    if (esTokenDemo(token)) {
      const payload = demoCuentaPayload(token)
      if (payload) setCuenta(payload)
      else setError('Cuenta no encontrada.')
      return () => { active = false }
    }
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
    <main className="min-h-dvh bg-ink-950 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-fore sm:py-12">
      <div className="mx-auto max-w-xl space-y-3 sm:space-y-4">
        <PortalEncabezado
          eyebrow="Mi cuenta"
          titulo={cuenta?.company?.name || 'Estado de cuenta'}
          saludo={cuenta?.customer?.name ? `Hola, ${cuenta.customer.name}` : ''}
          logoUrl={cuenta?.company?.logo && logoOk ? logoUrl : ''}
          logoAlt={cuenta?.company?.name ? `Logo de ${cuenta.company.name}` : 'Logo'}
          onLogoError={() => setLogoOk(false)}
        />
        {cuenta?.level && <p className="-mt-2 text-center text-[11px] uppercase tracking-wider text-mute sm:-mt-3">{NIVELES_PORTAL[cuenta.level] || cuenta.level}</p>}

        {error && <PortalFallo mensaje={error} />}
        {!cuenta && !error && <PortalCargando />}

        {cuenta && (
          <div className="space-y-3 sm:space-y-4">
            {/* Saldo pendiente: lo primero que el cliente necesita ver. */}
            <section className={`rounded-2xl border p-4 text-center sm:p-5 ${alDia ? 'border-ok/30 bg-ok/5' : 'border-warn/40 bg-warn/5'}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Saldo pendiente</p>
              {alDia ? (
                <>
                  <p className="mt-1.5 text-3xl font-bold tracking-tight text-ok">Al día</p>
                  <p className="mt-1 text-xs text-mute">No tenés pagos pendientes.</p>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-warn">{gs(saldo)}</p>
                  {cuenta.dueDates?.length > 0 && <p className="mt-1 text-xs text-mute">Incluye los vencimientos de abajo.</p>}
                </>
              )}
            </section>

            {/* Nota pública de la tienda (#127): visible solo cuando existe. */}
            {cuenta.customer?.publicNote && (
              <PortalSeccion titulo="Nota de la tienda" icono="megaphone" className="border-fono/25 bg-fono/5">
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{cuenta.customer.publicNote}</p>
              </PortalSeccion>
            )}

            {cuenta.dueDates?.length > 0 && (
              <PortalSeccion titulo="Vencimientos" icono="clock">
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
              </PortalSeccion>
            )}

            <PortalSeccion titulo="Últimos pedidos" icono="receipt">
              {cuenta.orders?.length ? (
                <div className="mt-3 space-y-2">
                  {cuenta.orders.map((order, index) => {
                    const pendiente = Number(order.pendingPyg || 0)
                    return (
                      <article key={`${order.orderNumber}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{codigoPedido(order.orderNumber) || 'Pedido'}</p>
                            <p className="mt-0.5 text-xs text-mute">{fecha(order.createdAt)}</p>
                          </div>
                          <p className="shrink-0 text-right font-bold tabular-nums">{gs(order.totalPyg)}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <PortalEstado tono={tonoPedido(order.status)}>{ESTADO_PEDIDO[order.status] || order.status}</PortalEstado>
                          {ESTADO_ENTREGA[order.fulfillmentStatus] && <PortalEstado tono="neutro">{ESTADO_ENTREGA[order.fulfillmentStatus]}</PortalEstado>}
                          {pendiente > 0 && <PortalEstado tono="warn">Pendiente {gs(pendiente)}</PortalEstado>}
                        </div>
                        {pendiente > 0 && order.dueAt && <p className="mt-1.5 text-xs text-mute">Vence el {fecha(order.dueAt)}</p>}
                        {order.receiptToken && (
                          <Link
                            to={`/pedido/${encodeURIComponent(order.receiptToken)}`}
                            className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-fono/40 px-3 py-2 text-xs font-bold text-fono-light transition hover:bg-fono/10 sm:w-auto sm:min-h-9 sm:justify-start sm:border-0 sm:px-0"
                          >
                            <Icon name="receipt" className="h-4 w-4" />
                            Ver comprobante
                          </Link>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-mute">Todavía no tenés pedidos registrados.</p>
              )}
            </PortalSeccion>

            {cuenta.level === 'completo' && (
              <PortalSeccion titulo="Garantías activas" icono="shield">
                {cuenta.warranties?.length ? (
                  <div className="mt-3 space-y-2">
                    {cuenta.warranties.map((warranty, index) => (
                      <div key={`${warranty.serial}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{warranty.description || 'Equipo'}</span>
                          <PortalEstado tono={tonoGarantia(warranty.status)}>{ESTADO_GARANTIA[warranty.status] || warranty.status}</PortalEstado>
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
              </PortalSeccion>
            )}

            {cuenta.level === 'completo' && (
              <PortalSeccion titulo="Direcciones" icono="store">
                {cuenta.addresses?.length ? (
                  <div className="mt-3 space-y-2 text-sm text-mute">
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
                  <p className="mt-3 text-sm text-mute">Sin direcciones registradas.</p>
                )}
              </PortalSeccion>
            )}

            <PortalPie tienda={cuenta.company?.name} actualizado={fechaHora(new Date())} />
          </div>
        )}
      </div>
    </main>
  )
}
