import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'

const ESTADO_PEDIDO = { PENDING: 'Pendiente de pago', COMPLETED: 'Pagado', CANCELLED: 'Cancelado' }
const ESTADO_ENTREGA = { PROCESSING: 'En preparación', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const ESTADO_GARANTIA = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }
const TONOS = {
  ok: 'border-ok/30 bg-ok/10 text-ok',
  bad: 'border-bad/30 bg-bad/10 text-bad',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  info: 'border-fono/25 bg-fono/10 text-fono-light',
}
const tonoPedido = (estado) => (estado === 'COMPLETED' ? TONOS.ok : estado === 'CANCELLED' ? TONOS.bad : TONOS.warn)
const tonoGarantia = (estado) => (estado === 'READY' ? TONOS.ok : estado === 'DIAGNOSIS' ? TONOS.warn : TONOS.info)
const fecha = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('es-PY') : '—')

// Vitrina pública del cliente: solo lectura, por token. Muestra la marca de la
// tienda, sus pedidos con estado y saldo, sus garantías activas (nivel
// completo) y su saldo a favor. No hay acciones de escritura ni datos de otros
// clientes; el token inválido o revocado cae en un aviso genérico.
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

  return (
    <main className="min-h-dvh bg-ink-950 px-4 py-8 text-fore sm:py-12">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="mb-2 text-center">
          {portal?.tienda?.tieneLogo && logoOk && (
            <img
              src={`${API_URL}/api/portal/${encodeURIComponent(token || '')}/logo`}
              alt={portal?.tienda?.nombre ? `Logo de ${portal.tienda.nombre}` : 'Logo de la tienda'}
              onError={() => setLogoOk(false)}
              className="mx-auto mb-4 h-14 w-auto max-w-[180px] object-contain"
            />
          )}
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Portal del cliente</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{portal?.tienda?.nombre || 'Tu tienda'}</h1>
          {portal?.cliente?.nombre && <p className="mt-1 text-sm text-mute">Hola, {portal.cliente.nombre}</p>}
        </header>

        {error && (
          <div className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-8 text-center">
            <Icon name="alert" className="mx-auto h-6 w-6 text-bad" />
            <p className="mt-3 text-sm text-bad">{error}</p>
          </div>
        )}

        {!portal && !error && <p className="py-16 text-center text-sm text-mute">Cargando tu cuenta…</p>}

        {portal && (
          <div className="space-y-4">
            {portal.cliente?.notaPublica && (
              <section className="rounded-2xl border border-fono/25 bg-fono/5 p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-mute">Nota de la tienda</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{portal.cliente.notaPublica}</p>
              </section>
            )}
            <section className={`rounded-2xl border p-5 text-center ${saldoFavor > 0 ? 'border-ok/30 bg-ok/5' : 'border-ink-600 bg-ink-900'}`}>
              <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-mute">
                <Icon name="wallet" className="h-3.5 w-3.5" aria-hidden="true" /> Saldo a favor
              </p>
              {saldoFavor > 0 ? (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-ok">{gs(saldoFavor)}</p>
                  <p className="mt-1 text-xs text-mute">Lo podés usar en tu próxima compra.</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-mute">Todavía no tenés saldo a favor.</p>
              )}
            </section>

            {puntos > 0 && (
              <section className="rounded-2xl border border-fono/25 bg-fono/5 p-5 text-center">
                <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-mute">
                  <Icon name="sparkles" className="h-3.5 w-3.5" aria-hidden="true" /> Puntos de fidelización
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-fono-light">{gs(puntos)}</p>
                <p className="mt-1 text-xs text-mute">Se canjean como saldo a favor en tu próxima compra.</p>
              </section>
            )}

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Icon name="package" className="h-4 w-4 text-fono-light" aria-hidden="true" /> Tus pedidos
              </h2>
              {pedidos.length ? (
                <div className="mt-3 space-y-2">
                  {pedidos.map((pedido, index) => {
                    const saldo = Number(pedido.saldoPyg || 0)
                    return (
                      <article key={`${pedido.numero}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-semibold">{codigoPedido(pedido.numero) || 'Pedido'}</span>
                          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tonoPedido(pedido.estado)}`}>{ESTADO_PEDIDO[pedido.estado] || pedido.estado}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">
                          <span>{fecha(pedido.fecha)}</span>
                          <span>{ESTADO_ENTREGA[pedido.fulfillmentStatus] || pedido.fulfillmentStatus || '—'}</span>
                          <span className="tabular-nums">Total {gs(pedido.totalPyg)}</span>
                        </div>
                        {saldo > 0 ? (
                          <p className="mt-2 font-semibold tabular-nums text-warn">Saldo pendiente {gs(saldo)}</p>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-ok">Sin saldo pendiente</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-mute">Todavía no tenés pedidos registrados.</p>
              )}
            </section>

            {portal.nivel === 'completo' && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Icon name="shield" className="h-4 w-4 text-fono-light" aria-hidden="true" /> Tus garantías
                </h2>
                {garantias.length ? (
                  <div className="mt-3 space-y-2">
                    {garantias.map((garantia, index) => (
                      <div key={`${garantia.serial}-${index}`} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{garantia.producto || 'Equipo'}</span>
                          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tonoGarantia(garantia.estado)}`}>{ESTADO_GARANTIA[garantia.estado] || garantia.estado}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-mute">{garantia.serial}</p>
                        <p className="mt-0.5 text-xs text-mute">{garantia.venceAt ? `Vence ${fecha(garantia.venceAt)}` : 'Sin vencimiento registrado'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-mute">No tenés garantías activas.</p>
                )}
              </section>
            )}

            <p className="pt-2 text-center text-[11px] text-mute">
              Documento no fiscal · Portal generado por MobOS para {portal.tienda?.nombre || 'la tienda'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
