import { useEffect, useMemo, useState } from 'react'
import { qrDataUrl } from '@/lib/qr'
import { useParams, useSearchParams } from 'react-router-dom'
import { codigoPedido } from '@/utils/pedido'
import { API_URL } from '@/lib/api/client'
import { varianteDeTema } from '@/lib/tenantLogo'
import { isDemoRuntime } from '@/lib/demoMode'
import { demoCotizacionPayload } from '@/lib/demoCotizacion'
import { aprobarYConvertirDemoCotizacion } from '@/lib/demoCotizacionConversion'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import { Aviso, Textarea } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { ABIERTAS, ESTADO_COTIZACION as ESTADO, TONO_COTIZACION as TONO } from '@/lib/cotizaciones'
import CompartirPdf from '@/components/shared/CompartirPdf'
import AprobacionPresupuesto from '@/components/shared/AprobacionPresupuesto'
import { buildProformaHtml } from '@/components/shared/OrderReceipt'
import { BotonWhatsApp, CabeceraTienda, EnlacePoliticas, ResumenTotales } from '@/components/publico/KitPublico'
import ProductFooter from '@/components/app/ProductFooter'
import WhatsAppSucursal from '@/components/app/WhatsAppSucursal'
import '@/components/publico/publicoRediseno.css'


// Cotización pública: el cliente abre el QR o el enlace, revisa el detalle y
// acepta o rechaza (con motivo opcional) sin iniciar sesión. Una sola vez.
export default function CotizacionPublica() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [qr, setQr] = useState('')
  // Cotización demo (#240 → portal): el enlace de la cuenta viaja con
  // `?demo=1` para resolverla con los datos del navegador, igual que la
  // garantía y el informe.
  const demoDelEnlace = searchParams.get('demo') === '1'
  const demo = isDemoRuntime || demoDelEnlace

  useEffect(() => {
    let active = true
    setError(''); setQuote(null); setRechazando(false); setMotivo(''); setQr('')
    if (demo) {
      const local = demoCotizacionPayload(token)
      if (local) setQuote(local)
      else setError('Cotización no encontrada.')
      return () => { active = false }
    }
    fetch(`${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Cotización no encontrada.'); if (active) setQuote(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la cotización.') })
    return () => { active = false }
  }, [token, demo])

  useEffect(() => {
    if (!token) return
    let active = true
    const enlace = `${window.location.origin}/cotizacion/${encodeURIComponent(token)}${demo ? '?demo=1' : ''}`
    qrDataUrl(enlace).then(data => { if (active) setQr(data) }).catch(() => {})
    return () => { active = false }
  }, [token, demo])

  const abierta = quote && ABIERTAS.includes(quote.status)
  const estado = quote ? (quote.resolution?.status && ABIERTAS.includes(quote.status) ? quote.resolution.status : quote.status) : ''
  const items = useMemo(() => (Array.isArray(quote?.items) ? quote.items : []), [quote])

  async function resolver(action) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'reject' && motivo.trim() ? { note: motivo.trim() } : {}) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo resolver la cotización.')
      setQuote(current => current ? { ...current, status: payload.status, resolution: { status: payload.status, at: payload.at, note: motivo.trim() || null } } : current)
      setRechazando(false)
    } catch (cause) {
      setError(cause?.message || 'No se pudo resolver la cotización.')
    } finally {
      setBusy(false)
    }
  }

  const logoUrl = `${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}/logo?variant=${varianteDeTema()}`

  return (
    <main data-publico="1" className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}

        {quote && (
          <div className="space-y-4">
            <CabeceraTienda
              logo={quote.company?.logo ? logoUrl : ''}
              empresa={quote.company?.name}
              detalle={quote.branch ? [quote.branch.name, [quote.branch.address, quote.branch.city, quote.branch.department].filter(Boolean).join(', '), quote.branch.phone, quote.branch.instagram ? `@${quote.branch.instagram}` : ''].filter(Boolean).join(' · ') : ''}
            >
              <div className="mt-3 border-t border-ink-600/70 pt-3">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-fono-light">Cotización</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">{quote.number || 'Cotización'}</h1>
                  <span data-testid="estado-cotizacion" className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${TONO[estado] || 'border-warn/30 bg-warn/10 text-warn'}`}>{ESTADO[estado] || estado}</span>
                </div>
                {quote.customerName && <p className="mt-1 text-sm text-mute [overflow-wrap:anywhere]">Para {quote.customerName}</p>}
                {quote.validUntil && <p className="mt-1 text-sm text-mute [overflow-wrap:anywhere]">Válida hasta {new Date(quote.validUntil).toLocaleDateString('es-PY')}</p>}
              {quote.version && (
                <p data-testid="aprobacion-version" className="mt-2 text-xs uppercase tracking-wider text-mute">
                  Versión {quote.version.number} · congelada {new Date(quote.version.frozenAt).toLocaleString('es-PY')}
                </p>
              )}
              {quote.resolution?.at && !abierta && (
                <p className="mt-2 text-xs text-mute">
                  {estado === 'ACCEPTED' ? (quote.resolution.method && String(quote.resolution.method).toUpperCase().includes('OTP') ? 'Aprobada con código' : 'Aceptada') : 'Rechazada'} el {new Date(quote.resolution.at).toLocaleString('es-PY')}
                  {quote.resolution.note ? ` · Motivo: ${quote.resolution.note}` : ''}{quote.resolution.destination ? ` · ${quote.resolution.destination}` : ''}{quote.orderNumber ? ` · Pedido ${codigoPedido(quote.orderNumber)}` : ''}
                </p>
              )}
              </div>
              <BotonWhatsApp telefono={quote.branch?.phone} mensaje={`Hola, consulto por la cotización ${quote.number || ''}.`} className="mt-3 w-full sm:w-auto" />
            </CabeceraTienda>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Productos</h2>
              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words">{item.description}</span>
                      <span className="shrink-0 text-mute">× {item.quantity}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-mute">
                      <span>{item.quantity} × {gs(item.unitPricePyg)}</span>
                      <span className="tabular-nums">{gs(item.totalPyg)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-ink-700 pt-4">
                <ResumenTotales
                  filas={[
                    { etiqueta: 'Subtotal', valor: gs(quote.subtotalPyg) },
                    ...(Number(quote.discountPyg || 0) > 0 ? [{ etiqueta: 'Descuento', valor: `− ${gs(quote.discountPyg)}`, tono: 'warn' }] : []),
                  ]}
                  total={Number(quote.totalPyg)}
                />
              </div>
            </section>

            {quote.tradeIn?.model && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-sm" data-testid="cotizacion-publica-equipo">
                <h2 className="font-semibold">Equipo que entregás</h2>
                <p className="mt-2 text-fore">{[quote.tradeIn.model, quote.tradeIn.storage].filter(Boolean).join(' ')}</p>
                <div className="mt-3 space-y-1.5 text-mute">
                  <p>Valor estimado: <b className="tabular-nums text-fore">{gs(quote.tradeIn.estimatedValuePyg)}</b></p>
                  <p>Faltante a pagar: <b className="tabular-nums text-fore">{gs(quote.tradeIn.faltantePyg ?? Math.max(0, Number(quote.totalPyg) - Number(quote.tradeIn.estimatedValuePyg || 0)))}</b></p>
                </div>
                <p className="mt-3 text-xs text-mute">{quote.tradeIn.aviso || 'Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas).'}</p>
              </section>
            )}

            {(quote.customer?.document || quote.seller) && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-sm">
                <h2 className="font-semibold">Datos</h2>
                <div className="mt-3 space-y-1.5 text-mute">
                  {quote.customer?.document && <p>Documento: <b className="text-fore">{quote.customer.document}</b></p>}
                  {quote.seller && <p>Vendedor: {quote.seller}</p>}
                </div>
              </section>
            )}

            {quote.notes && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-sm">
                <h2 className="font-semibold">Condiciones</h2>
                <p className="mt-2 whitespace-pre-line text-mute">{quote.notes}</p>
              </section>
            )}

            {/* A3 (#279): aprobación autenticada (código + versión congelada).
                Sigue montada después de aprobar para mostrar la evidencia.
                La aceptación rápida queda como alternativa legacy más abajo. */}
            {(abierta || quote.approval) && (
              <AprobacionPresupuesto
                quote={quote}
                token={token}
                demo={demo}
                onAprobada={(evidencia) => {
                  // #314: en demo la aprobación genera el pedido en el navegador
                  // (mismo camino que la cuenta real) y deja la evidencia con el
                  // número de pedido para que coincida con Pedidos y la ficha.
                  if (demo) {
                    const aprobacion = aprobarYConvertirDemoCotizacion(token, evidencia)
                    setQuote(current => current ? { ...current, status: 'CONVERTED', approval: aprobacion || evidencia } : current)
                    return
                  }
                  setQuote(current => current ? { ...current, status: 'CONVERTED', approval: evidencia } : current)
                }}
              />
            )}

            {abierta && !demo && (
              <section className="rounded-2xl border border-ink-600 bg-ink-800/40 p-5">
                <h2 className="text-center text-sm font-semibold">¿No podés recibir el código?</h2>
                <p className="mt-1 text-center text-xs text-mute">Aceptá sin verificar identidad: el vendedor ve tu respuesta y convierte el pedido a mano.</p>
                {rechazando ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs text-mute">Motivo del rechazo (opcional)
                      <Textarea rows={3} maxLength={500} value={motivo} onChange={event => setMotivo(event.target.value)} className="mt-1.5 rounded-xl px-3 py-2 text-sm" placeholder="Contanos por qué no avanzás con esta cotización" />
                    </label>
                    <div className={PIE_ACCIONES}>
                      <button type="button" disabled={busy} onClick={() => { setRechazando(false); setMotivo('') }} className="min-h-11 rounded-xl border border-ink-500 px-4 py-2 text-sm font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">Volver</button>
                      <button type="button" disabled={busy} onClick={() => resolver('reject')} className="min-h-11 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-sm font-semibold text-bad transition hover:bg-bad/20 disabled:opacity-60">Confirmar rechazo</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center gap-3 [&_button]:min-h-11">
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" disabled={busy} onClick={() => resolver('accept')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ok px-5 py-2.5 text-sm font-bold text-on-ok transition hover:opacity-90 disabled:opacity-60"><Icon name="check" className="h-4 w-4" />{busy ? 'Guardando…' : 'Aceptar cotización'}</button>
                      <button type="button" disabled={busy} onClick={() => setRechazando(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bad/40 px-5 py-2.5 text-sm font-semibold text-bad transition hover:bg-bad/10 disabled:opacity-60"><Icon name="close" className="h-4 w-4" />Rechazar</button>
                    </div>
                    {/* #261: el cliente baja o comparte el A4 de marca (misma proforma). */}
                    <CompartirPdf
                      construirHtml={() => buildProformaHtml(quote, { format: 'a4', enlace: typeof window !== 'undefined' ? window.location.href : '' })}
                      nombre={`cotizacion-${quote?.number || ''}`}
                      titulo={`Cotización ${quote?.number || ''}`}
                      texto={[`Cotización ${quote?.number || ''}`, quote?.customerName, typeof window !== 'undefined' ? window.location.href : ''].filter(Boolean).join(' · ')}
                      formato="a4"
                      etiqueta="PDF de la cotización"
                    />
                  </div>
                )}
              </section>
            )}

            {qr && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center">
                <h2 className="font-semibold">Enlace de esta cotización</h2>
                <img src={qr} alt="QR de la cotización" className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-2" />
                <p className="mt-2 break-all text-xs text-mute">{typeof window !== 'undefined' ? window.location.href : ''}</p>
              </section>
            )}

            <p className="pt-2 text-center text-xs text-mute [overflow-wrap:anywhere]">Documento no fiscal · Generado por MobOS para {quote.company?.name || 'la tienda'}</p>
            <EnlacePoliticas slug={quote.company?.policiesSlug} />
          </div>
        )}
      </div>
      <WhatsAppSucursal contacto={quote?.contacto} />
      <ProductFooter />
    </main>
  )
}
