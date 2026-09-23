import { useEffect, useState } from 'react'
import { whatsappUrl } from '@/utils/telefono'
import { ESTADO_GARANTIA } from '@/lib/estadosPedido'
import { codigoPedido } from '@/utils/pedido'
import Icon from '@/components/shared/Icon'
import { useParams, useSearchParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'
import { demoGarantiaPayload } from '@/lib/demoGarantia'
import { Aviso, BarraProgreso } from '@/components/ui'
import { ROTULO_SECCION } from '@/components/shared/tabla'

function bulletList(text) {
  if (!text) return []
  return text.split(/\n+/).map(line => line.replace(/^[-•·]\s*/, '').trim()).filter(Boolean)
}

export default function GarantiaPublica() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const [warranty, setWarranty] = useState(null)
  const [error, setError] = useState('')
  // Garantía demo (#240 → portal): el enlace del portal viaja con `?demo=1`
  // para resolverla con los datos del navegador, igual que el informe.
  const demoDelEnlace = searchParams.get('demo') === '1'
  const demo = isDemoRuntime || demoDelEnlace
  useEffect(() => {
    let active = true
    setError(''); setWarranty(null)
    if (demo) {
      const local = demoGarantiaPayload(token)
      if (local) setWarranty(local)
      else setError('Garantía no encontrada.')
      return () => { active = false }
    }
    fetch(`${API_URL}/api/public/warranty/${encodeURIComponent(token || '')}`)
      .then(async response => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || payload?.error || 'Garantía no encontrada.'); if (active) setWarranty(payload) })
      .catch(cause => { if (active) setError(cause?.message || 'No se pudo cargar la garantía.') })
    return () => { active = false }
  }, [token, demo])
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
          {warranty?.orderNumber && <p className="mt-1 text-sm text-mute">Compra {codigoPedido(warranty.orderNumber)}</p>}
        </header>
        {error && <Aviso tono="error" className="px-4 py-3 text-sm rounded-xl text-center">{error}</Aviso>}
        {warranty && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={ROTULO_SECCION}>Cobertura</p>
                  <p className={`mt-1 text-lg font-bold ${days === 0 ? 'text-bad' : days != null && days <= 15 ? 'text-warn' : 'text-ok'}`}>
                    {days == null ? 'Sin vencimiento definido' : days === 0 ? 'Garantía vencida' : `${days} días restantes`}
                  </p>
                </div>
                {pct !== null && (
                  <div className="w-28">
                    <BarraProgreso valor={pct} tono={days === 0 ? 'bad' : days <= 15 ? 'warn' : 'ok'} etiqueta="Cobertura de la garantía" className="h-2 bg-ink-700" />
                    <p className="mt-1 text-right text-[10px] text-mute">{pct}% del período</p>
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Compra</p><p className="mt-1 font-semibold">{warranty.purchasedAt ? new Date(warranty.purchasedAt).toLocaleDateString('es-PY') : '—'}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Vence</p><p className="mt-1 font-semibold">{warranty.expiresAt ? new Date(warranty.expiresAt).toLocaleDateString('es-PY') : '—'}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Serial / IMEI</p><p className="mt-1 truncate font-mono text-xs font-semibold">{serial}</p></div>
                <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Estado del caso</p><p className="mt-1 font-semibold">{ESTADO_GARANTIA[warranty.status] || warranty.status}</p></div>
              </div>
            </section>
            <section className="rounded-2xl border border-ok/25 bg-ok/5 p-5">
              <h2 className="font-semibold text-ok">Qué cubre</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(bulletList(warranty.coverage).length ? bulletList(warranty.coverage) : ['Defectos de fábrica del equipo cubiertos por la garantía.']).map((item, index) => (
                  <li key={index} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-ok" /><span>{item}</span></li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-bad/25 bg-bad/5 p-5">
              <h2 className="font-semibold text-bad">Qué no cubre</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(bulletList(warranty.exclusions).length ? bulletList(warranty.exclusions) : ['Daños físicos, agua, reparaciones de terceros y desgaste normal por uso.']).map((item, index) => (
                  <li key={index} className="flex gap-2"><Icon name="close" className="mt-0.5 h-4 w-4 text-bad" /><span>{item}</span></li>
                ))}
              </ul>
            </section>
            {warranty.store?.name && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center text-sm">
                <p className="font-bold">{warranty.store.name}</p>
                {warranty.store.city && <p className="mt-1 text-mute">{warranty.store.city}</p>}
                {warranty.store.phone && (
                  <a className="mt-3 inline-block rounded-lg bg-ok px-4 py-2 font-semibold text-black" href={whatsappUrl(warranty.store.phone)} target="_blank" rel="noreferrer">
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
