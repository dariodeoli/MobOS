import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '@/components/shared/Icon'
import { API_URL } from '@/lib/api/client'

// Verificación pública de una liquidación de comisiones: es el destino del QR
// del comprobante (`qrLiquidacion`). Muestra solo lo mínimo para contrastar el
// papel (vendedor, período, total, estado y emisión) y no expone ventas,
// márgenes, clientes ni datos internos de la empresa.

const ESTADOS = { DRAFT: 'Borrador', PAID: 'Pagada', CANCELLED: 'Anulada' }
const COLORES = {
  DRAFT: { clase: 'text-warn', borde: 'border-warn/30', fondo: 'bg-warn/5', icono: 'clock' },
  PAID: { clase: 'text-ok', borde: 'border-ok/25', fondo: 'bg-ok/5', icono: 'check' },
  CANCELLED: { clase: 'text-bad', borde: 'border-bad/25', fondo: 'bg-bad/5', icono: 'close' },
}

const gs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`
const fecha = (valor, opciones = { dateStyle: 'long' }) => (valor ? new Date(valor).toLocaleDateString('es-PY', opciones) : '—')

export default function LiquidacionPublica() {
  const { token } = useParams()
  const [liquidacion, setLiquidacion] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    setError(''); setLiquidacion(null)
    fetch(`${API_URL}/api/public/commission-settlements/${encodeURIComponent(token || '')}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || payload?.error || 'Liquidación no encontrada.')
        if (activo) setLiquidacion(payload)
      })
      .catch((cause) => { if (activo) setError(cause?.message || 'No se pudo verificar la liquidación.') })
    return () => { activo = false }
  }, [token])

  const estado = liquidacion ? ESTADOS[liquidacion.status] || liquidacion.status : ''
  const color = COLORES[liquidacion?.status] || COLORES.DRAFT

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Liquidación de comisiones</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{liquidacion?.sellerName || 'Comprobante'}</h1>
          {liquidacion ? (
            <p className="mt-1 text-sm text-mute">Período {liquidacion.periodFrom} al {liquidacion.periodTo}</p>
          ) : (
            <p className="mt-1 text-sm text-mute">Verificación del comprobante impreso</p>
          )}
        </header>

        {error && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-center text-sm text-bad">{error}</p>}

        {liquidacion && (
          <div className="space-y-4">
            <section className={`rounded-2xl border ${color.borde} ${color.fondo} p-5`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900">
                  <Icon name={color.icono} className={`h-5 w-5 ${color.clase}`} />
                </span>
                <div>
                  <p className={`font-semibold ${color.clase}`}>{estado}</p>
                  <p className="text-xs text-mute">{liquidacion.verificado ? 'Comprobante verificado' : 'Sin verificar'}</p>
                </div>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-mute">Total liquidado</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{gs(liquidacion.totalPyg)}</p>
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Vendedor</p>
                  <p className="mt-1 font-semibold">{liquidacion.sellerName || '—'}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Período</p>
                  <p className="mt-1 font-semibold">{liquidacion.periodFrom} al {liquidacion.periodTo}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Emitida</p>
                  <p className="mt-1 font-semibold">{fecha(liquidacion.emitidaEn)}</p>
                </div>
                <div className="rounded-xl bg-ink-800/60 p-3">
                  <p className="text-xs text-mute">Estado</p>
                  <p className={`mt-1 font-semibold ${color.clase}`}>{estado}</p>
                </div>
              </div>
            </section>

            <p className="rounded-2xl border border-ink-600 bg-ink-900 p-4 text-center text-xs text-mute">
              Documento no fiscal. No válido como factura.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
