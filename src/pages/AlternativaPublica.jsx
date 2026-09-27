import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_URL } from '@/lib/api/client'
import { Aviso, Button, Input } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { formatGs } from '@/utils/moneda'

// A5 (#279) · Variante agotada → alternativas: el cliente abre el enlace del
// vendedor, ve la opción (colores/capacidades/modelo, diferencia de precio y
// nueva fecha) y el historial de versiones; si hay diferencia de precio,
// confirma con el OTP. Al aceptar, la necesidad original se libera.
const ESTADOS = {
  PROPUESTA: 'Propuesta',
  VENDEDOR_OK: 'Revisada por el vendedor',
  ENVIADA_AL_CLIENTE: 'Esperando tu respuesta',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
}

export default function AlternativaPublica() {
  const { token } = useParams()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [otp, setOtp] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setError(''); setNotice(''); setDatos(null)
    fetch(`${API_URL}/api/public/supply/alternatives/${encodeURIComponent(token || '')}`)
      .then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || 'Propuesta no encontrada.'); if (active) setDatos(payload) })
      .catch((cause) => { if (active) setError(cause?.message || 'No se pudo cargar la propuesta.') })
    return () => { active = false }
  }, [token])

  async function responder(decision) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`${API_URL}/api/public/supply/alternatives/${encodeURIComponent(token || '')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(otp.trim() ? { otp: otp.trim() } : {}), ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || 'No se pudo registrar la respuesta.')
      setNotice(decision === 'ACEPTAR' ? '¡Listo! Confirmaste la alternativa: el equipo sigue con tu pedido.' : 'Registramos tu respuesta: el equipo te contacta para la próxima opción.')
      setDatos((actual) => actual ? { ...actual, alternative: { ...actual.alternative, resuelta: true, status: decision === 'ACEPTAR' ? 'ACEPTADA' : 'RECHAZADA' } } : actual)
    } catch (cause) {
      setError(cause?.message || 'No se pudo registrar la respuesta.')
    } finally { setBusy(false) }
  }

  const alternativa = datos?.alternative
  const necesidad = datos?.need

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <header className="rounded-2xl border border-ink-600 bg-ink-900 p-4">
        <p className={ROTULO_SECCION}>Propuesta de alternativa</p>
        <h1 className="mt-1 text-lg font-semibold">{necesidad?.product || 'Tu pedido'}{necesidad?.sku ? ` · ${necesidad.sku}` : ''}</h1>
        <p className="mt-1 text-sm text-mute">
          {/* La variante original se agotó: esta es una opción, nada se cambia sin tu OK. */}
          La variante que pediste se agotó. Te proponemos una alternativa: nada se cambia sin tu confirmación.
        </p>
      </header>

      {error && <Aviso tono="error" className="rounded-xl p-3">{error}</Aviso>}
      {notice && <Aviso tono="ok" className="rounded-xl p-3">{notice}</Aviso>}

      {alternativa && (
        <section className="space-y-3 rounded-2xl border border-ink-600 bg-ink-900 p-4" data-testid="alternativa-publica">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Versión {alternativa.version} · {ESTADOS[alternativa.status] || alternativa.status}</p>
            {alternativa.priceDeltaPyg !== 0 && (
              <p className="rounded-lg border border-warn/40 bg-warn/5 px-2 py-1 text-sm font-semibold text-warn">
                Diferencia: {alternativa.priceDeltaPyg > 0 ? '+' : '−'}{formatGs(Math.abs(alternativa.priceDeltaPyg))}
              </p>
            )}
          </div>
          <p className="text-sm">{alternativa.optionSummary}{alternativa.reason ? ` · Motivo: ${alternativa.reason}` : ''}</p>
          {alternativa.newEta && <p className="text-sm text-mute">Nueva fecha estimada: {new Date(alternativa.newEta).toLocaleDateString('es-PY')}</p>}
          {alternativa.notes && <p className="rounded-lg bg-ink-800/60 p-2 text-xs text-mute">{alternativa.notes}</p>}

          {!alternativa.resuelta && (
            <>
              {alternativa.requiereOtp && (
                <label className="block space-y-1.5 text-xs text-mute">Código de confirmación (te lo pasó el vendedor)
                  <Input inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="Código de confirmación" />
                </label>
              )}
              <label className="block space-y-1.5 text-xs text-mute">¿Querés contarnos algo? (opcional)
                <Input maxLength={300} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Comentario para el equipo" aria-label="Comentario" />
              </label>
              <div className={PIE_ACCIONES}>
                <Button type="button" variant="outline" disabled={busy} data-testid="alternativa-rechazar" onClick={() => responder('RECHAZAR')}>Rechazar</Button>
                <Button type="button" disabled={busy || (alternativa.requiereOtp && otp.trim().length !== 6)} data-testid="alternativa-aceptar" onClick={() => responder('ACEPTAR')}>
                  {busy ? 'Enviando…' : alternativa.requiereOtp ? 'Aprobar con el código' : 'Aprobar la alternativa'}
                </Button>
              </div>
            </>
          )}
          {alternativa.resuelta && <Aviso tono="info" className="rounded-xl p-3 text-sm">Esta propuesta ya fue {alternativa.aprobadaPorCliente ? 'aprobada' : 'resuelta'}. Cualquier cambio, el equipo te lo vuelve a proponer.</Aviso>}
        </section>
      )}

      {datos?.versions?.length > 1 && (
        <section className="rounded-2xl border border-ink-600 bg-ink-900 p-4">
          <p className={ROTULO_SECCION}>Historial de versiones</p>
          <ul className="mt-2 space-y-1">
            {datos.versions.map((version) => (
              <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>v{version.version} · {version.optionSummary}</span>
                <span className="text-xs text-mute">{ESTADOS[version.status] || version.status}{version.priceDeltaPyg ? ` · ${version.priceDeltaPyg > 0 ? '+' : '−'}${formatGs(Math.abs(version.priceDeltaPyg))}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!datos && !error && <p className="text-sm text-mute">Cargando la propuesta…</p>}
    </main>
  )
}
