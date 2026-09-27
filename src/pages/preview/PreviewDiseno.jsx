// Preview de diseño (#279, ampliaciones A3/A5 del plan #250): pantallas
// propuestas para la aprobación OTP de presupuestos y las alternativas de una
// variante agotada. **Solo DEV**: no existe en producción ni en el demo; los
// slots (FIN/CRM/CMP/POS) implementan las versiones reales.
import { Suspense, lazy, useState } from 'react'
import { aplicarTema, temaOscuro } from '@/lib/tema'
import Icon from '@/components/shared/Icon'

const AprobacionOtpPreview = lazy(() => import('./AprobacionOtpPreview'))
const VarianteAgotadaPreview = lazy(() => import('./VarianteAgotadaPreview'))

const PANTALLAS = [
  ['/diseno-aprobacion-otp', 'A3 · Aprobación OTP', AprobacionOtpPreview],
  ['/diseno-variante-agotada', 'A5 · Variante agotada', VarianteAgotadaPreview],
]

export default function PreviewDiseno() {
  const [oscuro, setOscuro] = useState(() => (typeof document !== 'undefined' ? temaOscuro() : false))
  const ruta = typeof window !== 'undefined' ? window.location.pathname : ''
  const actual = PANTALLAS.find(([path]) => path === ruta) || PANTALLAS[0]
  const Pantalla = actual[2]

  function cambiarTema() {
    const siguiente = !oscuro
    aplicarTema(siguiente)
    setOscuro(siguiente)
  }

  return (
    <div className="min-h-screen bg-ink-900 px-4 py-5 text-fore">
      <div className="mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3">
        <p className="text-xs text-mute">
          <b className="text-fore">Preview de diseño #279</b> · datos ficticios · no existe en producción
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {PANTALLAS.map(([path, etiqueta]) => (
            <a
              key={path}
              href={path}
              aria-current={path === actual[0] ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${path === actual[0] ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}
            >
              {etiqueta}
            </a>
          ))}
          <button
            type="button"
            onClick={cambiarTema}
            className="flex min-h-9 items-center gap-1 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
            aria-label={oscuro ? 'Ver en claro' : 'Ver en oscuro'}
          >
            <Icon name="eye" className="h-3.5 w-3.5" />{oscuro ? 'Claro' : 'Oscuro'}
          </button>
        </div>
      </div>
      <Suspense fallback={<p className="text-center text-sm text-mute">Cargando preview…</p>}>
        <Pantalla />
      </Suspense>
    </div>
  )
}
