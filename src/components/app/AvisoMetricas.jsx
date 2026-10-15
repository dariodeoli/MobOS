import { X } from 'lucide-react'
import { useState } from 'react'
import { medicionDesactivada } from '@/lib/trafico'

// Aviso breve y descartable (no bloquea ni pide consentimiento): se muestra
// una vez en la landing y en la demo; al cerrarlo se recuerda en localStorage.
// No aparece si el navegador ya pide no ser rastreado o si eligió «No medir».
export const CLAVE_AVISO_METRICAS = 'mobos:aviso-metricas'

function visible(soloDemo) {
  try {
    // En el host de la app solo en la pantalla de acceso a la demo: dentro de la
    // app fija abajo tapaba botones (POS, pagos), y la demo ya tiene su banner.
    if (soloDemo && window.location.pathname !== '/demo') return false
    if (medicionDesactivada()) return false
    return localStorage.getItem(CLAVE_AVISO_METRICAS) !== '1'
  } catch { return false }
}

export default function AvisoMetricas({ soloDemo = false }) {
  const [abierto, setAbierto] = useState(() => visible(soloDemo))
  if (!abierto) return null
  const cerrar = () => {
    try { localStorage.setItem(CLAVE_AVISO_METRICAS, '1') } catch { /* sin storage */ }
    setAbierto(false)
  }
  return (
    <div
      role="region"
      aria-label="Aviso de privacidad"
      data-testid="aviso-metricas"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex w-full max-w-xl items-center gap-1 rounded-xl border border-fore/[.12] bg-paper py-1 pl-4 pr-1 text-xs text-mute shadow-lg">
        <p className="min-w-0 flex-1 py-1.5">
          Usamos métricas anónimas para mejorar MobOS. Sin datos personales.{' '}
          <a href="/privacidad" className="inline-flex min-h-11 items-center font-semibold text-fono-dark underline underline-offset-2">Más info</a>
        </p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar aviso"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-mute transition hover:text-fore"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
