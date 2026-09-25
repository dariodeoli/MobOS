import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { varianteDeTema } from '@/lib/tenantLogo'
import { gs } from '@/utils/calculos'
import { fechaDia as fecha, fechaHora } from '@/utils/fecha'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'
import { PortalCargando, PortalEncabezado, PortalEstado, PortalFallo, PortalPie, PortalSeccion } from '@/components/customerPortal/PortalUI'
import PasosEntrega from '@/components/customerPortal/PasosEntrega'
import { avisosDeCuenta } from '@/lib/portalAvisos'
import { demoCuentaPayload, esTokenDemo } from '@/lib/demoClientes'
import { NIVELES_PORTAL } from '@/lib/customerPortal'
import { ESTADO_COTIZACION, cotizacionUrlFor, diasParaVencer, estadoCotizacion, tonoCotizacion } from '@/lib/cotizaciones'
import { ESTADO_ENTREGA, ESTADO_GARANTIA, ESTADO_PEDIDO, tonoGarantia, tonoPedido } from '@/lib/estadosPedido'
import { tonoServicioPortal } from '@/lib/estadosServicio'

// Tonos de los avisos del portal (el mismo set que la cronología del CRM).
const TONO_AVISO = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-fono/15 text-fono-light',
}

// Resumen de cuenta público del cliente: saldo, vencimientos, pedidos y —según
// el nivel del enlace— garantías activas, direcciones y comprobantes. No
// muestra costos, notas internas ni contactos de terceros.
export default function CuentaPublica() {
  const { token } = useParams()
  const [cuenta, setCuenta] = useState(null)
  const [error, setError] = useState('')
  const [logoOk, setLogoOk] = useState(true)
  // El chip «Nuevo» de los mensajes se mantiene durante la carga aunque la
  // página repita el fetch (StrictMode en dev): el visto se marca en el primer
  // request, así que la respuesta repetida llegaría sin el chip.
  const nuevosRef = useRef(new Set())
  const conNuevos = (payload) => {
    const clave = (mensaje) => `${mensaje.createdAt}|${mensaje.content}`
    for (const mensaje of payload?.mensajes || []) if (mensaje.nuevo) nuevosRef.current.add(clave(mensaje))
    return {
      ...payload,
      mensajes: (payload?.mensajes || []).map((mensaje) => ({ ...mensaje, nuevo: mensaje.nuevo || nuevosRef.current.has(clave(mensaje)) })),
    }
  }

  useEffect(() => {
    let active = true
    setError(''); setCuenta(null); setLogoOk(true)
    // Portal demo (#194): el token `demo-…` se arma en el navegador con datos
    // ficticios, sin llamar al API.
    if (esTokenDemo(token)) {
      const payload = demoCuentaPayload(token)
      if (payload) setCuenta(conNuevos(payload))
      else setError('Cuenta no encontrada.')
      return () => { active = false }
    }
    fetch(`${API_URL}/api/portal/${encodeURIComponent(token || '')}`)
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || payload?.error || 'Cuenta no encontrada.')
        // El «Nuevo» se registra aunque el fetch quede viejo (StrictMode): el
        // visto ya se marcó en ese request.
        const normalizado = conNuevos(payload)
        if (active) setCuenta(normalizado)
      })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la cuenta.') })
    return () => { active = false }
  }, [token])

  const saldo = Number(cuenta?.balancePyg || 0)
  const alDia = cuenta && saldo <= 0
  // Avisos (#240 → portal): lo accionable del payload (pagos, retiros,
  // entregas y garantías), en la misma lógica para la cuenta real y la demo.
  const avisos = avisosDeCuenta(cuenta)
  const logoUrl = `${API_URL}/api/portal/${encodeURIComponent(token || '')}/logo?variant=${varianteDeTema()}`

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

            {/* Avisos (#240 → portal): lo que requiere atención, con atajo a la
                sección que lo explica. Solo aparece cuando hay algo que avisar. */}
            {avisos.length > 0 && (
              <PortalSeccion titulo="Avisos" icono="bell" data-testid="portal-avisos">
                <div className="mt-3 space-y-2">
                  {avisos.map((aviso) => (
                    <a key={aviso.id} href={aviso.destino} className="flex items-start gap-2.5 rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2.5 text-sm transition hover:border-fono/50">
                      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONO_AVISO[aviso.tono] || TONO_AVISO.info}`}>
                        <Icon name={aviso.icono} className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{aviso.titulo}</span>
                        {aviso.detalle && <span className="mt-0.5 block text-xs text-mute">{aviso.detalle}</span>}
                      </span>
                      <Icon name="chevron" className="mt-1 h-4 w-4 shrink-0 text-mute" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </PortalSeccion>
            )}

            {/* Mensajes de la tienda (#240 → portal): lo que el equipo publicó
                desde la ficha; el primer render sin ver llega como «Nuevo». */}
            {cuenta.mensajes?.length > 0 && (
              <PortalSeccion titulo="Mensajes de la tienda" icono="megaphone" data-testid="portal-mensajes">
                <div className="mt-3 space-y-2">
                  {cuenta.mensajes.map((mensaje, index) => (
                    <article key={`${mensaje.createdAt}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 whitespace-pre-wrap break-words">{mensaje.content}</p>
                        {mensaje.nuevo && <PortalEstado tono="info">Nuevo</PortalEstado>}
                      </div>
                      <p className="mt-1 text-[11px] text-mute">{fechaHora(mensaje.createdAt)}</p>
                    </article>
                  ))}
                </div>
              </PortalSeccion>
            )}

            {/* Tus beneficios (#240 → portal): saldo a favor y puntos. */}
            {(Number(cuenta.saldoFavorPyg || 0) > 0 || Number(cuenta.puntosPyg || 0) > 0) && (
              <PortalSeccion titulo="Tus beneficios" icono="sparkles" data-testid="portal-beneficios">
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Number(cuenta.saldoFavorPyg || 0) > 0 && (
                    <div className="rounded-xl bg-ink-800/60 px-3 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Saldo a favor</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-ok">{gs(cuenta.saldoFavorPyg)}</p>
                      <p className="mt-0.5 text-xs text-mute">Podés usarlo en tu próxima compra.</p>
                    </div>
                  )}
                  {Number(cuenta.puntosPyg || 0) > 0 && (
                    <div className="rounded-xl bg-ink-800/60 px-3 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Puntos</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-fono-light">{gs(cuenta.puntosPyg)}</p>
                      <p className="mt-0.5 text-xs text-mute">Acumulados en tus compras (1 punto = Gs 1).</p>
                    </div>
                  )}
                </div>
              </PortalSeccion>
            )}

            {/* Tus reservas (#240 → portal): equipos guardados a nombre del
                cliente con su vencimiento. */}
            {cuenta.reservas?.length > 0 && (
              <PortalSeccion id="reservas" titulo="Tus reservas" icono="box" data-testid="portal-reservas">
                <p className="mt-2 text-sm text-mute">Estos equipos están guardados a tu nombre. Si no los retirás antes del vencimiento, se liberan solos.</p>
                <div className="mt-3 space-y-2">
                  {cuenta.reservas.map((reserva, index) => {
                    const vence = reserva.reservedUntil ? Date.parse(reserva.reservedUntil) : null
                    const dias = vence !== null && !Number.isNaN(vence) ? Math.ceil((vence - Date.now()) / 86400000) : null
                    return (
                      <article key={`${reserva.serial || reserva.model}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{reserva.model || 'Equipo'}{reserva.capacity ? ` · ${reserva.capacity}` : ''}</p>
                            <p className="mt-0.5 text-xs text-mute">
                              {reserva.serial ? `serial ${String(reserva.serial).slice(-6)}` : ''}
                              {reserva.serial && reserva.branch ? ' · ' : ''}
                              {reserva.branch || ''}
                            </p>
                          </div>
                          {dias !== null && (
                            <PortalEstado tono={dias <= 2 ? 'warn' : 'info'}>
                              {dias <= 0 ? 'Vence hoy' : `Hasta ${fecha(reserva.reservedUntil)}`}
                            </PortalEstado>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </PortalSeccion>
            )}

            {/* Tus pagos (#240 → portal): el historial con su medio y el total
                confirmado de toda la historia del cliente. */}
            {cuenta.pagos?.length > 0 && (
              <PortalSeccion id="pagos" titulo="Tus pagos" icono="wallet" data-testid="portal-pagos">
                {Number(cuenta.totalPagadoPyg || 0) > 0 && (
                  <p className="mt-2 text-sm text-mute">Total pagado <b className="text-ok tabular-nums">{gs(cuenta.totalPagadoPyg)}</b></p>
                )}
                <div className="mt-3 space-y-2">
                  {cuenta.pagos.map((pago, index) => (
                    <article key={`${pago.orderNumber}-${pago.paidAt}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{codigoPedido(pago.orderNumber) || 'Pedido'}</p>
                        <p className="mt-0.5 text-xs text-mute">{pago.methodLabel}{pago.paidAt ? ` · ${fecha(pago.paidAt)}` : ''}</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-ok">{gs(pago.amountPyg)}</span>
                    </article>
                  ))}
                </div>
              </PortalSeccion>
            )}

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

            {/* Tus cotizaciones (#240 → portal): las propuestas que la tienda
                ya compartió, con su validez y el enlace para aceptarlas. */}
            {cuenta.cotizaciones?.length > 0 && (
              <PortalSeccion id="cotizaciones" titulo="Tus cotizaciones" icono="tag" data-testid="portal-cotizaciones">
                <p className="mt-2 text-sm text-mute">Estas propuestas tienen validez limitada: abrí la que te interese para aceptarla o rechazarla.</p>
                <div className="mt-3 space-y-2">
                  {cuenta.cotizaciones.map((cotizacion, index) => {
                    const estado = estadoCotizacion(cotizacion)
                    const dias = diasParaVencer(cotizacion)
                    const url = cotizacionUrlFor(cotizacion, { demo: esTokenDemo(token) })
                    return (
                      <article key={`${cotizacion.number}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{cotizacion.number || 'Cotización'}</p>
                            <p className="mt-0.5 text-xs text-mute">
                              Emitida el {fecha(cotizacion.createdAt)}
                              {estado === 'SENT' && dias !== null ? ` · ${dias <= 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`}` : ''}
                              {estado === 'EXPIRED' && cotizacion.validUntil ? ` · Venció el ${fecha(cotizacion.validUntil)}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums">{gs(cotizacion.totalPyg)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <PortalEstado tono={tonoCotizacion(estado)}>{ESTADO_COTIZACION[estado] || estado}</PortalEstado>
                          {url && (
                            <Link
                              to={url}
                              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-fono/40 px-3 py-2 text-xs font-bold text-fono-light transition hover:bg-fono/10"
                            >
                              <Icon name="external" className="h-4 w-4" />
                              Ver cotización
                            </Link>
                          )}
                        </div>
                      </article>
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
                          {(order.tracking?.estadoLabel || ESTADO_ENTREGA[order.fulfillmentStatus]) && <PortalEstado tono="neutro">{order.tracking?.estadoLabel || ESTADO_ENTREGA[order.fulfillmentStatus]}</PortalEstado>}
                          {pendiente > 0 && <PortalEstado tono="warn">Pendiente {gs(pendiente)}</PortalEstado>}
                        </div>
                        {pendiente > 0 && order.dueAt && <p className="mt-1.5 text-xs text-mute">Vence el {fecha(order.dueAt)}</p>}
                        {/* Seguimiento del envío/retiro (#240 → portal): los
                            pasos con su fecha mientras el pedido está en curso. */}
                        {order.status !== 'CANCELLED' && !['DELIVERED', 'PICKED_UP'].includes(order.fulfillmentStatus) && order.tracking?.pasos?.length > 1 && (
                          <PasosEntrega tracking={order.tracking} data-testid="portal-pasos-entrega" className="mt-3 border-t border-ink-600/60 pt-2.5" />
                        )}
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

            {cuenta.informes?.length > 0 && (
              <PortalSeccion titulo="Informes de tus equipos" icono="report">
                <p className="mt-2 text-sm text-mute">Compartí el informe del equipo que compraste: modelo, estado, verificación y garantía.</p>
                <div className="mt-3 space-y-2">
                  {cuenta.informes.map((informe, index) => (
                    <article key={`${informe.serial}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{informe.model || 'Equipo'}</p>
                        <p className="mt-0.5 text-xs text-mute">{codigoPedido(informe.orderNumber) || 'Pedido'} · serial {String(informe.serial || '').slice(-6)}</p>
                      </div>
                      <Link
                        to={`/u/${encodeURIComponent(informe.serial)}${esTokenDemo(token) ? '?demo=1' : ''}`}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-fono/40 px-3 py-2 text-xs font-bold text-fono-light transition hover:bg-fono/10"
                      >
                        <Icon name="external" className="h-4 w-4" />
                        Ver informe
                      </Link>
                    </article>
                  ))}
                </div>
              </PortalSeccion>
            )}

            {/* Servicio técnico (#240 §4): el cliente sigue su equipo en el
                taller con estado y fechas, sin costos ni datos internos. */}
            {cuenta.servicios?.length > 0 && (
              <PortalSeccion titulo="Servicio técnico" icono="wrench">
                <p className="mt-2 text-sm text-mute">Seguí el estado del equipo que dejaste en el taller.</p>
                <div className="mt-3 space-y-2">
                  {cuenta.servicios.map((servicio, index) => (
                    <article key={`${servicio.serviceNumber || 'servicio'}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{servicio.device || 'Equipo'}</p>
                          <p className="mt-0.5 text-xs text-mute">
                            {servicio.serviceNumber || 'Orden de servicio'}
                            {servicio.serial ? ` · serial ${String(servicio.serial).slice(-6)}` : ''}
                          </p>
                        </div>
                        <PortalEstado tono={tonoServicioPortal(servicio.status)}>{servicio.statusLabel || servicio.status}</PortalEstado>
                      </div>
                      {servicio.serviceName && <p className="mt-1.5 text-xs text-mute">{servicio.serviceName}</p>}
                      <p className="mt-1.5 text-xs text-mute">
                        Recibido {fecha(servicio.receivedAt)}
                        {servicio.deliveredAt ? ` · Entregado ${fecha(servicio.deliveredAt)}` : ''}
                      </p>
                    </article>
                  ))}
                </div>
              </PortalSeccion>
            )}

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
                        {/* Seguimiento de la garantía: si el caso derivó en una
                            orden de taller, el cliente ve la etapa acá mismo. */}
                        {warranty.taller && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-warn">
                            <Icon name="wrench" className="h-3.5 w-3.5" />
                            En el taller: {warranty.taller.statusLabel || warranty.taller.status}
                          </p>
                        )}
                        {warranty.publicToken && (
                          <Link
                            to={`/garantia/${encodeURIComponent(warranty.publicToken)}${esTokenDemo(token) ? '?demo=1' : ''}`}
                            className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-fono/40 px-3 py-2 text-xs font-bold text-fono-light transition hover:bg-fono/10 sm:w-auto sm:min-h-9 sm:justify-start sm:border-0 sm:px-0"
                          >
                            <Icon name="shield" className="h-4 w-4" />
                            Ver garantía
                          </Link>
                        )}
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
