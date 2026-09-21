import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'
import { PortalCargando, PortalEncabezado, PortalEstado, PortalFallo, PortalPie, PortalSeccion } from '@/components/customerPortal/PortalUI'

const ESTADO_PEDIDO = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }
const ESTADO_ENTREGA = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const ESTADO_GARANTIA = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }
const fecha = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('es-PY') : '—')
const tonoPedido = (estado) => (estado === 'COMPLETED' ? 'ok' : estado === 'CANCELLED' ? 'bad' : 'warn')
const tonoGarantia = (estado) => (estado === 'DELIVERED' ? 'neutro' : estado === 'READY' ? 'ok' : 'info')

// Vitrina pública del cliente: solo lectura, por token. Muestra la marca de la
// tienda, su saldo a favor, sus pedidos con estado y saldo, sus garantías
// activas (nivel completo) y la nota pública de la tienda. No hay acciones de
// escritura ni datos de otros clientes; el token inválido cae en un aviso
// genérico.
export default function PortalCliente() {
  const { token } = useParams()
  const [portal, setPortal] = useState(null)
  const [error, setError] = useState('')
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    let active = true
    setError(''); setPortal(null); setLogoOk(true)
    fetch(`${API_URL}/api/public/portal/${encodeURIComponent(token || '')}`)
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Este enlace no es válido o venció.')
        if (active) setPortal(payload)
      })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar tu cuenta.') })
    return () => { active = false }
  }, [token])

  const pedidos = portal?.pedidos || []
  const garantias = portal?.garantias || []
  const saldoFavor = Number(portal?.saldoFavorPyg || 0)
  const puntos = Number(portal?.puntosPyg || 0)
  const logoUrl = `${API_URL}/api/portal/${encodeURIComponent(token || '')}/logo`

  return (
    <main className="min-h-dvh bg-ink-950 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-fore sm:py-12">
      <div className="mx-auto max-w-xl space-y-3 sm:space-y-4">
        <PortalEncabezado
          eyebrow="Portal del cliente"
          titulo={portal?.tienda?.nombre || 'Tu tienda'}
          saludo={portal?.cliente?.nombre ? `Hola, ${portal.cliente.nombre}` : ''}
          logoUrl={portal?.tienda?.tieneLogo && logoOk ? logoUrl : ''}
          logoAlt={portal?.tienda?.nombre ? `Logo de ${portal.tienda.nombre}` : 'Logo'}
          onLogoError={() => setLogoOk(false)}
        />

        {error && <PortalFallo mensaje={error} />}
        {!portal && !error && <PortalCargando />}

        {portal && (
          <div className="space-y-3 sm:space-y-4">
            <section className={`rounded-2xl border p-4 text-center sm:p-5 ${saldoFavor > 0 ? 'border-ok/30 bg-ok/5' : 'border-ink-600 bg-ink-900'}`}>
              <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider text-mute">
                <Icon name="wallet" className="h-3.5 w-3.5" aria-hidden="true" /> Saldo a favor
              </p>
              {saldoFavor > 0 ? (
                <>
                  <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-ok">{gs(saldoFavor)}</p>
                  <p className="mt-1 text-xs text-mute">Lo podés usar en tu próxima compra.</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-mute">Todavía no tenés saldo a favor.</p>
              )}
            </section>

            {/* Nota pública de la tienda (#127): visible solo cuando existe. */}
            {portal.cliente?.notaPublica && (
              <PortalSeccion titulo="Nota de la tienda" icono="megaphone" className="border-fono/25 bg-fono/5">
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{portal.cliente.notaPublica}</p>
              </PortalSeccion>
            )}

            {puntos > 0 && (
              <PortalSeccion className="border-fono/25 bg-fono/5 text-center">
                <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider text-mute">
                  <Icon name="sparkles" className="h-3.5 w-3.5" aria-hidden="true" /> Puntos de fidelización
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-fono-light">{gs(puntos)}</p>
                <p className="mt-1 text-xs text-mute">Se canjean como saldo a favor en tu próxima compra.</p>
              </PortalSeccion>
            )}

            <PortalSeccion titulo="Tus pedidos" icono="package">
              {pedidos.length ? (
                <div className="mt-3 space-y-2">
                  {pedidos.map((pedido, index) => {
                    const saldo = Number(pedido.saldoPyg || 0)
                    return (
                      <article key={`${pedido.numero}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{codigoPedido(pedido.numero) || 'Pedido'}</p>
                            <p className="mt-0.5 text-xs text-mute">{fecha(pedido.fecha)}</p>
                          </div>
                          <p className="shrink-0 text-right font-bold tabular-nums">{gs(pedido.totalPyg)}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <PortalEstado tono={tonoPedido(pedido.estado)}>{ESTADO_PEDIDO[pedido.estado] || pedido.estado}</PortalEstado>
                          {ESTADO_ENTREGA[pedido.fulfillmentStatus] && <PortalEstado tono="neutro">{ESTADO_ENTREGA[pedido.fulfillmentStatus]}</PortalEstado>}
                          {saldo > 0
                            ? <PortalEstado tono="warn">Saldo {gs(saldo)}</PortalEstado>
                            : <PortalEstado tono="ok">Sin saldo pendiente</PortalEstado>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-mute">Todavía no tenés pedidos registrados.</p>
              )}
            </PortalSeccion>

            {portal.nivel === 'completo' && (
              <PortalSeccion titulo="Tus garantías" icono="shield">
                {garantias.length ? (
                  <div className="mt-3 space-y-2">
                    {garantias.map((garantia, index) => (
                      <div key={`${garantia.serial}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{garantia.producto || 'Equipo'}</span>
                          <PortalEstado tono={tonoGarantia(garantia.estado)}>{ESTADO_GARANTIA[garantia.estado] || garantia.estado}</PortalEstado>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-mute">{garantia.serial}</p>
                        <p className="mt-0.5 text-xs text-mute">{garantia.venceAt ? `Vence ${fecha(garantia.venceAt)}` : 'Sin vencimiento registrado'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-mute">No tenés garantías activas.</p>
                )}
              </PortalSeccion>
            )}

            <PortalPie tienda={portal.tienda?.nombre} />
          </div>
        )}
      </div>
    </main>
  )
}
