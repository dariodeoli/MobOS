import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'

const WARRANTY_STATUS = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo', DELIVERED: 'Entregado' }

function bulletList(text) {
  if (!text) return []
  return text.split(/\n+/).map(line => line.replace(/^[-•·]\s*/, '').trim()).filter(Boolean)
}

export default function GarantiaPublica() {
  const { token } = useParams()
  const [warranty, setWarranty] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError(''); setWarranty(null)
    fetch(`${API_URL}/api/public/warranty/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Garantía no encontrada.'); if (active) setWarranty(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la garantía.') })
    return () => { active = false }
  }, [token])
  const days = warranty?.daysRemaining ?? null
  const total = warranty?.warrantyDays ?? null
  const pct = days != null && total ? Math.min(100, Math.max(0, Math.round((days / total) * 100))) : null
  const serial = warranty?.serial || ''
  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Garantía oficial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{warranty?.productName || 'Tu equipo'}</h1>
          {warranty?.orderNumber && <p className="mt-1 text-sm text-mute">Compra {warranty.orderNumber}</p>}
        </header>
        {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-center text-sm text-bad">{error}</p>}
        {warranty && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-mute">Cobertura</p>
                  <p className={`mt-1 text-lg font-bold ${days === 0 ? 'text-bad' : days != null && days <= 15 ? 'text-warn' : 'text-ok'}`}>
                    {days == null ? 'Sin vencimiento definido' : days === 0 ? 'Garantía vencida' : `${days} días restantes`}
                  </p>
                </div>
                {pct !== null && (
                  <div className="w-28">
                    <div className="h-2 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${days === 0 ? 'bg-bad' : days <= 15 ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-right text-[10px] text-mute">{pct}% del período</p>
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Compra</p><p className="mt-1 font-semibold">{warranty.purchasedAt ? new Date(warranty.purchasedAt).toLocaleDateString('es-PY') : '—'}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Vence</p><p className="mt-1 font-semibold">{warranty.expiresAt ? new Date(warranty.expiresAt).toLocaleDateString('es-PY') : '—'}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Serial / IMEI</p><p className="mt-1 truncate font-mono text-xs font-semibold">{serial}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Estado del caso</p><p className="mt-1 font-semibold">{WARRANTY_STATUS[warranty.status] || warranty.status}</p></div>
              </div>
            </section>
            <section className="rounded-2xl border border-ok/25 bg-ok/5 p-5">
              <h2 className="font-semibold text-ok">Qué cubre</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(bulletList(warranty.coverage).length ? bulletList(warranty.coverage) : ['Defectos de fábrica del equipo cubiertos por la garantía.']).map((item, index) => (
                  <li key={index} className="flex gap-2"><span className="text-ok">✓</span><span>{item}</span></li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-bad/25 bg-bad/5 p-5">
              <h2 className="font-semibold text-bad">Qué no cubre</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(bulletList(warranty.exclusions).length ? bulletList(warranty.exclusions) : ['Daños físicos, agua, reparaciones de terceros y desgaste normal por uso.']).map((item, index) => (
                  <li key={index} className="flex gap-2"><span className="text-bad">✗</span><span>{item}</span></li>
                ))}
              </ul>
            </section>
            {warranty.store?.name && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center text-sm">
                <p className="font-bold">{warranty.store.name}</p>
                {warranty.store.city && <p className="mt-1 text-mute">{warranty.store.city}</p>}
                {warranty.store.phone && (
                  <a className="mt-3 inline-block rounded-lg bg-ok px-4 py-2 font-semibold text-black" href={`https://wa.me/${String(warranty.store.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                    Contactar por WhatsApp
                  </a>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
