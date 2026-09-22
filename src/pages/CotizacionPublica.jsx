import { useEffect, useMemo, useState } from 'react'
import { qrDataUrl } from '@/lib/qr'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { varianteDeTema } from '@/lib/tenantLogo'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import { Aviso, Textarea } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'

const ABIERTAS = ['DRAFT', 'SENT']
const ESTADO = { DRAFT: 'Pendiente de confirmar', SENT: 'Pendiente de confirmar', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONVERTED: 'Convertida en pedido', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' }
const TONO = { ACCEPTED: 'border-ok/30 bg-ok/10 text-ok', REJECTED: 'border-bad/30 bg-bad/10 text-bad', EXPIRED: 'border-bad/30 bg-bad/10 text-bad', CANCELLED: 'border-bad/30 bg-bad/10 text-bad', CONVERTED: 'border-fono/30 bg-fono/10 text-fono-light' }

// Cotización pública: el cliente abre el QR o el enlace, revisa el detalle y
// acepta o rechaza (con motivo opcional) sin iniciar sesión. Una sola vez.
export default function CotizacionPublica() {
  const { token } = useParams()
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [qr, setQr] = useState('')
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    let active = true
    setError(''); setQuote(null); setRechazando(false); setMotivo(''); setQr('')
    fetch(`${API_URL}/api/quotes/public/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Cotización no encontrada.'); if (active) setQuote(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la cotización.') })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!token) return
    let active = true
    const enlace = `${window.location.origin}/cotizacion/${encodeURIComponent(token)}`
    qrDataUrl(enlace).then(data => { if (active) setQr(data) }).catch(() => {})
    return () => { active = false }
  }, [token])

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
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Cotización</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{quote?.number || 'Cotización'}</h1>
          {quote?.customerName && <p className="mt-1 text-sm text-mute">Para {quote.customerName}</p>}
          {quote?.validUntil && <p className="mt-2 text-[11px] uppercase tracking-wider text-mute">Válida hasta {new Date(quote.validUntil).toLocaleDateString('es-PY')}</p>}
        </header>

        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}

        {quote && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center">
              {logoOk && quote.company?.logo && <img src={logoUrl} alt="" className="mx-auto mb-3 h-16 max-w-[12rem] object-contain" onError={() => setLogoOk(false)} />}
              {quote.company?.name && <p className="text-sm font-bold">{quote.company.name}</p>}
              {quote.branch && (
                <p className="mt-1 text-xs text-mute">
                  {quote.branch.name}
                  {[quote.branch.address, quote.branch.city, quote.branch.department].filter(Boolean).length ? ` · ${[quote.branch.address, quote.branch.city, quote.branch.department].filter(Boolean).join(', ')}` : ''}
                  {quote.branch.phone ? ` · ${quote.branch.phone}` : ''}
                  {quote.branch.instagram ? ` · @${quote.branch.instagram}` : ''}
                </p>
              )}
              <span className={`mt-4 inline-block rounded-lg border px-3 py-1 text-xs font-bold ${TONO[estado] || 'border-warn/30 bg-warn/10 text-warn'}`}>{ESTADO[estado] || estado}</span>
              {quote.resolution?.at && !abierta && (
                <p className="mt-2 text-xs text-mute">
                  {estado === 'ACCEPTED' ? 'Aceptada' : 'Rechazada'} el {new Date(quote.resolution.at).toLocaleString('es-PY')}
                  {quote.resolution.note ? ` · Motivo: ${quote.resolution.note}` : ''}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <h2 className="font-semibold">Productos</h2>
              <div className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="rounded-xl bg-ink-800/60 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{item.description}</span>
                      <span className="shrink-0 text-mute">× {item.quantity}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-mute">
                      <span>{item.quantity} × {gs(item.unitPricePyg)}</span>
                      <span className="tabular-nums">{gs(item.totalPyg)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-ink-700 pt-4 text-sm">
                <div className="flex items-center justify-between"><span className="text-mute">Subtotal</span><b className="tabular-nums">{gs(quote.subtotalPyg)}</b></div>
                {Number(quote.discountPyg || 0) > 0 && <div className="flex items-center justify-between"><span className="text-mute">Descuento</span><b className="tabular-nums text-warn">− {gs(quote.discountPyg)}</b></div>}
                <div className="flex items-center justify-between text-base"><span className="font-semibold">Total</span><b className="tabular-nums text-fono-light">{gs(quote.totalPyg)}</b></div>
              </div>
            </section>

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

            {abierta && (
              <section className="rounded-2xl border border-fono/30 bg-fono/5 p-5">
                <h2 className="text-center font-semibold">¿Aceptás esta cotización?</h2>
                <p className="mt-1 text-center text-xs text-mute">Tu respuesta queda registrada y el vendedor la ve al instante.</p>
                {rechazando ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs text-mute">Motivo del rechazo (opcional)
                      <Textarea rows={3} maxLength={500} value={motivo} onChange={event => setMotivo(event.target.value)} className="mt-1.5 rounded-xl px-3 py-2 text-sm" placeholder="Contanos por qué no avanzás con esta cotización" />
                    </label>
                    <div className={PIE_ACCIONES}>
                      <button type="button" disabled={busy} onClick={() => { setRechazando(false); setMotivo('') }} className="rounded-xl border border-ink-500 px-4 py-2 text-sm font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">Volver</button>
                      <button type="button" disabled={busy} onClick={() => resolver('reject')} className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-sm font-semibold text-bad transition hover:bg-bad/20 disabled:opacity-60">Confirmar rechazo</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button type="button" disabled={busy} onClick={() => resolver('accept')} className="inline-flex items-center gap-2 rounded-xl bg-ok px-5 py-2.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-60"><Icon name="check" className="h-4 w-4" />{busy ? 'Guardando…' : 'Aceptar cotización'}</button>
                    <button type="button" disabled={busy} onClick={() => setRechazando(true)} className="inline-flex items-center gap-2 rounded-xl border border-bad/40 px-5 py-2.5 text-sm font-semibold text-bad transition hover:bg-bad/10 disabled:opacity-60"><Icon name="close" className="h-4 w-4" />Rechazar</button>
                  </div>
                )}
              </section>
            )}

            {qr && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center">
                <h2 className="font-semibold">Enlace de esta cotización</h2>
                <img src={qr} alt="QR de la cotización" className="mx-auto mt-3 h-40 w-40 rounded-xl bg-white p-2" />
                <p className="mt-2 break-all text-[11px] text-mute">{typeof window !== 'undefined' ? window.location.href : ''}</p>
              </section>
            )}

            <p className="pt-2 text-center text-[11px] text-mute">Documento no fiscal · Generado por MobOS para {quote.company?.name || 'la tienda'}</p>
          </div>
        )}
      </div>
    </main>
  )
}
