import { useCallback, useId, useRef, useState } from 'react'
import { useDialogFocusTrap } from 'owncoding-ui'
import { cn } from '@/lib/utils'
import './bottomSheet.css'

// Hoja inferior para celular (#429): la versión móvil de los detalles y del
// flujo de cobro. Es una capa más de la pila de diálogos de la biblioteca
// (foco atrapado, Esc, scroll del documento bloqueado y `aria-modal` solo en
// la superior), con asa para arrastrar hacia abajo, X roja de 44 px como la
// `VentanaDetalle`, pie fijo y margen seguro del equipo.
//
//   size="auto"  → altura por contenido (hasta 92 % de la pantalla)
//   size="full"  → pantalla completa (cobro)
//
// Cierra con la X, Esc, tocando afuera o arrastrando el asa/encabezado hacia
// abajo. `busy` bloquea el cierre mientras se guarda. En ≥768 px conviene usar
// `VentanaDetalle`: quien la monta decide con `useMediaQuery`.
const UMBRAL_ARRASTRE = 96

export default function BottomSheet({
  open = true,
  onClose,
  title,
  children,
  footer = null,
  size = 'auto',
  busy = false,
  accion = null,
  className,
  testId,
}) {
  const panel = useRef(null)
  const titleId = useId()
  const [arrastre, setArrastre] = useState(0)
  const inicio = useRef(null)
  const cerrar = useCallback(() => { if (!busy) onClose?.() }, [busy, onClose])
  const { esSuperior, requestClose } = useDialogFocusTrap(open, cerrar, panel, { busy })

  const alBajar = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target instanceof Element && e.target.closest('button')) return
    inicio.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const alMover = e => {
    if (inicio.current == null) return
    setArrastre(Math.max(0, e.clientY - inicio.current))
  }
  const alSoltar = e => {
    if (inicio.current == null) return
    const delta = e.clientY - inicio.current
    inicio.current = null
    setArrastre(0)
    if (delta > UMBRAL_ARRASTRE) requestClose()
  }

  if (!open) return null
  const completa = size === 'full'
  return (
    <div
      className="bottom-sheet-fondo fixed inset-0 z-50 flex items-end bg-black/50"
      onMouseDown={e => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal={esSuperior ? 'true' : undefined}
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        data-testid={testId}
        style={arrastre ? { transform: `translateY(${arrastre}px)`, transition: 'none' } : undefined}
        className={cn(
          'bottom-sheet flex w-full flex-col overflow-hidden border-t border-ink-600 bg-ink text-fore shadow-float',
          completa
            ? 'h-[100dvh] rounded-none pt-[env(safe-area-inset-top,0px)]'
            : 'max-h-[92dvh] rounded-t-3xl',
          className,
        )}
      >
        <div
          data-testid="bottom-sheet-asa"
          className="touch-none select-none"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          {!completa && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-ink-500" aria-hidden="true" />}
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-2">
            <h2 id={titleId} className="min-w-0 truncate text-lg font-bold">{title}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {accion}
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                aria-label="Cerrar"
                className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-bad text-2xl font-bold leading-none text-on-bad transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad disabled:opacity-40"
              >
                ×
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? (
          <div className="border-t border-ink-600 bg-ink px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3">
            {footer}
          </div>
        ) : (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom,0px)]" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
