import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react'
import { useDialogFocusTrap } from 'owncoding-ui'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DURACION_SALIDA_POPUP, ordenarAcciones, resolverPopup } from './popupReglas'
import './popup.css'

// Contexto del Popup: permite que `SaveActions`/`FormActions`/`useDialog*` de
// `popupKit` (mismos nombres que el Modal de la biblioteca) cierren el popup,
// bloqueen el cierre mientras se guarda y se rendericen en el pie fijo.
export const ContextoPopup = createContext(null)

function crearRegistro() {
  const activos = new Set()
  return { activos, registrar(id, on) { if (on) activos.add(id); else activos.delete(id); return activos.size > 0 } }
}

// Popup ÚNICO de MobOS: mismo marco para confirmar, formularios, detalles y
// avisos. Encabezado con título y X roja de 44 px, cuerpo libre (`children`) y
// pie de acciones (primaria / secundaria / peligro). En móvil (<768 px) sube
// como hoja desde abajo; en escritorio va centrado. Esc cierra, el foco queda
// atrapado y vuelve a quien abrió, el scroll del fondo se bloquea
// (`useDialogFocusTrap` de owncoding-ui, la misma pila que Modal/BottomSheet).
// La animación respeta `prefers-reduced-motion` (popup.css).
//
//   <Popup open={abierto} onClose={cerrar} tipo="confirmar" title="¿Anular la venta?"
//          acciones={{ peligro: { label: 'Anular', onClick: anular }, secundaria: { label: 'Volver', onClick: cerrar } }}>
//     …cuerpo…
//   </Popup>
//
// `acciones.*` = `{ label, onClick, disabled?, cargando?, type?, form? }`.
// `footer` (nodo) reemplaza al pie estándar cuando hace falta algo propio.
// `busy` bloquea Esc, X y fondo mientras se guarda.
const ICONOS_AVISO = { info: Info, ok: CircleCheck, warn: CircleAlert, bad: CircleX }
const TONO_ICONO = { info: 'text-info', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }

export default function Popup({
  open = true,
  onClose,
  title,
  description,
  tipo = 'formulario',
  tamano,
  tono = 'info',
  acciones,
  footer = null,
  children,
  busy = false,
  dirty = false,
  descarte,
  accion = null,
  className,
  testId,
}) {
  const [descartando, setDescartando] = useState(false)
  const [pie, setPie] = useState(null)
  const pendientes = useRef(crearRegistro()).current
  const cambios = useRef(crearRegistro()).current
  const [hayPendientes, setHayPendientes] = useState(false)
  const [hayCambiosReg, setHayCambiosReg] = useState(false)
  const [arrastre, setArrastre] = useState(0)
  const inicioArrastre = useRef(null)
  const bloqueado = Boolean(busy || hayPendientes)
  const sucio = Boolean(dirty || hayCambiosReg)
  const panel = useRef(null)
  const titleId = useId()
  const descId = useId()
  const { rol, ancho } = resolverPopup({ tipo, tamano })
  const [visible, setVisible] = useState(open)
  const [saliendo, setSaliendo] = useState(false)

  // Salida animada: se mantiene montado hasta que termina (sin espera si el
  // usuario pidió reducir movimiento).
  useEffect(() => {
    if (open) { setVisible(true); setSaliendo(false); return undefined }
    if (!visible) return undefined
    const sinMovimiento = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (sinMovimiento) { setVisible(false); return undefined }
    setSaliendo(true)
    const t = setTimeout(() => { setVisible(false); setSaliendo(false) }, DURACION_SALIDA_POPUP)
    return () => clearTimeout(t)
  }, [open, visible])

  // `dirty`: con cambios sin guardar el cierre pide confirmación (igual que
  // el Modal de la biblioteca); el guardado real cierra por `onClose` directo.
  const cerrar = useCallback(() => {
    if (bloqueado) return
    if (sucio) { setDescartando(true); return }
    onClose?.()
  }, [bloqueado, sucio, onClose])
  useEffect(() => { if (!open || !sucio) setDescartando(false) }, [open, sucio])
  const { esSuperior, requestClose } = useDialogFocusTrap(open, cerrar, panel, { busy: bloqueado })
  const registrar = useCallback((id, on) => setHayPendientes(pendientes.registrar(id, on)), [pendientes])
  const registrarCambios = useCallback((id, on) => setHayCambiosReg(cambios.registrar(id, on)), [cambios])
  const contexto = useMemo(() => ({ requestClose, registrar, registrarCambios, pie }), [requestClose, registrar, registrarCambios, pie])

  // Hoja móvil: arrastrar el asa hacia abajo cierra (igual que la BottomSheet previa).
  const alBajar = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    inicioArrastre.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const alMover = e => { if (inicioArrastre.current != null) setArrastre(Math.max(0, e.clientY - inicioArrastre.current)) }
  const alSoltar = e => {
    if (inicioArrastre.current == null) return
    const delta = e.clientY - inicioArrastre.current
    inicioArrastre.current = null
    setArrastre(0)
    if (delta > 96) requestClose()
  }

  if (!visible) return null
  const lista = footer ? [] : ordenarAcciones(acciones)
  const Icono = tipo === 'aviso' ? ICONOS_AVISO[tono] || Info : null
  return (
    <div
      className="popup-fondo fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4"
      data-saliendo={saliendo || undefined}
      onMouseDown={e => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role={rol}
        aria-modal={esSuperior ? 'true' : undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={bloqueado || undefined}
        style={arrastre ? { translate: `0 ${arrastre}px`, transition: 'none' } : undefined}
        data-testid={testId}
        data-tipo={tipo}
        data-saliendo={saliendo || undefined}
        className={cn(
          'popup-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-ink-600 bg-ink text-fore shadow-float md:max-h-[85dvh] md:rounded-2xl',
          ancho,
          className,
        )}
      >
        <div
          data-testid="bottom-sheet-asa"
          className="touch-none select-none md:hidden"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-ink-500" aria-hidden="true" />
          <div className="h-2" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-2 md:px-5 md:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icono && <Icono aria-hidden="true" className={cn('h-6 w-6 shrink-0', TONO_ICONO[tono])} />}
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-bold leading-6">{title}</h2>
              {description && <p id={descId} className="mt-0.5 text-sm text-mute">{description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {accion}
          <button
            type="button"
            onClick={requestClose}
            disabled={bloqueado}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bad text-2xl font-bold leading-none text-on-bad transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad disabled:opacity-40"
          >
            ×
          </button>
          </div>
        </div>
        <ContextoPopup.Provider value={contexto}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 text-sm md:px-5">{children}</div>
        </ContextoPopup.Provider>
        {(footer || lista.length > 0) ? (
          <div className="border-t border-ink-600 bg-ink px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 md:px-5 md:pb-4">
            {footer || (
              <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end" data-testid="popup-acciones">
                {lista.map(({ clave, label, variante, ...resto }) => (
                  <Button key={clave} variant={variante} className="min-h-11 w-full md:h-11 md:w-auto md:min-w-28" data-accion={clave} {...resto}>{label}</Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Pie fijo para `FormActions`/`SaveActions` (se oculta si nadie escribe en él). */}
            <div ref={setPie} className="popup-pie border-t border-ink-600 bg-ink px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 empty:hidden md:px-5 md:pb-4" />
            <div className="popup-pie-espacio shrink-0 pb-[env(safe-area-inset-bottom,0px)]" aria-hidden="true" />
          </>
        )}
      </div>
      {descartando && (
        <Popup
          tipo="confirmar"
          title={descarte?.titulo || '¿Descartar los cambios?'}
          description={descarte?.descripcion || 'Tenés cambios sin guardar. Si cerrás ahora se pierden.'}
          onClose={() => setDescartando(false)}
          acciones={{
            secundaria: { label: descarte?.seguir || 'Seguir editando', onClick: () => setDescartando(false) },
            peligro: { label: descarte?.confirmar || 'Descartar', onClick: () => { setDescartando(false); onClose?.() } },
          }}
        />
      )}
    </div>
  )
}
