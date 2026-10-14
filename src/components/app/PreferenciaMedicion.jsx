import { useState } from 'react'
import { fijarNoMedir, noMedir, optOutActivo } from '@/lib/trafico'

// Interruptor «No medir» de /privacidad: guarda la preferencia en este
// navegador y el medidor (src/lib/trafico.js) deja de enviar eventos.
export default function PreferenciaMedicion() {
  const [apagada, setApagada] = useState(() => optOutActivo())
  const navegador = noMedir()
  const activo = apagada || navegador
  const cambiar = () => {
    fijarNoMedir(!apagada)
    setApagada(!apagada)
  }
  return (
    <section className="mt-10 rounded-xl border border-fore/[.1] p-4" data-testid="preferencia-medicion">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold" id="no-medir-titulo">No medir</h2>
          <p className="mt-1 text-sm text-mute">
            {navegador
              ? 'Tu navegador ya pide no ser rastreado: no te medimos.'
              : apagada ? 'No te medimos en este navegador.' : 'Hoy medimos tu visita de forma anónima.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-labelledby="no-medir-titulo"
          disabled={navegador}
          onClick={cambiar}
          className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-60"
        >
          <span className={`block h-7 w-12 rounded-full transition ${activo ? 'bg-fono-dark' : 'bg-fore/25'}`} />
          <span className={`absolute left-[10px] top-[10px] size-6 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </section>
  )
}
