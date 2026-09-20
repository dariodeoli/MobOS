import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import { API_URL } from '@/lib/api/client'

// Verificación pública de un cierre de caja: es el destino del QR del
// comprobante (`qrCaja`). Muestra solo lo mínimo para contrastar el papel
// (sucursal, turno, esperado/contado/diferencia y arqueo por denominación) y
// no expone ventas, clientes, movimientos ni notas internas.

const ESTADOS = { OPEN: 'Turno abierto', CLOSED: 'Cierre confirmado' }
const COLORES = {
  OPEN: { clase: 'text-warn', borde: 'border-warn/30', fondo: 'bg-warn/5', icono: 'clock' },
  CLOSED: { clase: 'text-ok', borde: 'border-ok/25', fondo: 'bg-ok/5', icono: 'check' },
}

const gs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`
const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'long', timeStyle: 'short' }) : '—')

export default function CajaPublica() {
  const { token } = useParams()
  const [cierre, setCierre] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    setError(''); setCierre(null)
    fetch(`${API_URL}/api/public/cash-sessions/${encodeURIComponent(token || '')}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || payload?.error || 'Cierre de caja no encontrado.')
        if (activo) setCierre(payload)
      })
      .catch((cause) => { if (activo) setError(cause?.message || 'No se pudo verificar el cierre de caja.') })
    return () => { activo = false }
  }, [token])

  const estado = cierre ? ESTADOS[cierre.estado] || cierre.estado : ''
  const color = COLORES[cierre?.estado] || COLORES.OPEN
  const diferencia = Number(cierre?.diferenciaPyg || 0)
  const arqueo = Array.isArray(cierre?.arqueo) ? cierre.arqueo : []

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Cierre de caja</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{cierre?.sucursal || 'Comprobante'}</h1>
          <p className="mt-1 text-sm text-mute">
            {cierre?.empresa ? `${cierre.empresa} · ` : ''}
            {cierre?.abiertoEn ? `Apertura ${fecha(cierre.abiertoEn)}` : 'Verificación del comprobante impreso'}
          </p>
        </header>

        {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-center text-sm text-bad">{error}</p>}

        {cierre && (
          <div className="space-y-4">
            <section className={`rounded-2xl border ${color.borde} ${color.fondo} p-5`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900">
                  <Icon name={color.icono} className={`h-5 w-5 ${color.clase}`} />
                </span>
                <div>
                  <p className={`font-semibold ${color.clase}`}>{estado}</p>
                  <p className="text-xs text-mute">{cierre.verificado ? 'Comprobante verificado' : 'Sin verificar'}</p>
                </div>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-mute">Diferencia del arqueo</p>
              <p className={`mt-1 text-3xl font-bold tracking-tight ${diferencia === 0 ? 'text-ok' : 'text-warn'}`}>
                {cierre.diferenciaPyg == null ? '—' : gs(diferencia)}
              </p>
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Apertura</p>
                  <p className="mt-1 font-semibold">{gs(cierre.aperturaPyg)}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Esperado</p>
                  <p className="mt-1 font-semibold">{cierre.esperadoPyg == null ? '—' : gs(cierre.esperadoPyg)}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Contado</p>
                  <p className="mt-1 font-semibold">{cierre.contadoPyg == null ? '—' : gs(cierre.contadoPyg)}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Cierre</p>
                  <p className="mt-1 font-semibold">{fecha(cierre.cerradoEn)}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Abrió</p>
                  <p className="mt-1 font-semibold">{cierre.abiertoPor || '—'}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Cerró</p>
                  <p className="mt-1 font-semibold">{cierre.cerradoPor || '—'}</p>
                </div>
              </div>
            </section>

            {arqueo.length > 0 && (
              <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-mute">Arqueo por denominación</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {arqueo.map((fila) => (
                    <li key={fila.valor} className="flex items-center justify-between gap-3">
                      <span className="text-mute">{gs(fila.valor)} × {fila.cantidad}</span>
                      <span className="font-semibold tabular-nums">{gs(fila.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="rounded-2xl border border-ink-600 bg-ink-900 p-4 text-center text-xs text-mute">
              Documento no fiscal. No válido como factura.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
