import { useId, useState } from 'react'
import Icon from '@/components/shared/Icon'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Sección de detalle plegable (#164): arranca cerrada para que primero se lea lo
// esencial y recuerda su estado durante la sesión (sessionStorage por `id`, así
// volver al pedido no obliga a plegar de nuevo). El encabezado muestra el dato
// útil (cantidad, total, estado) sin abrir; el contenido queda en el DOM oculto
// con `hidden`, de modo que los apoyos de lectura y las pruebas lo encuentran.
export default function SeccionColapsable({ id, titulo, resumen, icono, abierta = false, className = '', children }) {
  const autoId = useId()
  const panelId = `seccion-panel-${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [expandida, setExpandida] = useState(() => {
    try {
      const guardado = window.sessionStorage.getItem(`mobos:seccion:${id}`)
      return guardado == null ? abierta : guardado === '1'
    } catch {
      return abierta
    }
  })
  function alternar() {
    setExpandida((actual) => {
      const siguiente = !actual
      try { window.sessionStorage.setItem(`mobos:seccion:${id}`, siguiente ? '1' : '0') } catch { /* sesión sin storage */ }
      return siguiente
    })
  }
  return (
    <section className={`rounded-2xl border border-ink-600 bg-ink-900 ${className}`}>
      <button
        type="button"
        aria-expanded={expandida}
        aria-controls={panelId}
        onClick={alternar}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-ink-800/60"
      >
        {icono ? <Icon name={icono} className="h-4 w-4 shrink-0 text-mute" /> : null}
        <span className="min-w-0 flex-1">
          <span className={cn('block', ROTULO_SECCION)}>{titulo}</span>
          {resumen ? <span className="mt-0.5 block truncate text-sm">{resumen}</span> : null}
        </span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-mute transition-transform ${expandida ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!expandida} className="border-t border-ink-600/70 px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}
