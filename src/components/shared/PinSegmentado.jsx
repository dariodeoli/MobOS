import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/shared/Icon'
import PinTeclado from '@/components/shared/PinTeclado'
import { isNativeIOS } from '@/lib/plataforma'
import { Keyboard } from '@capacitor/keyboard'
import { App } from '@capacitor/app'

// PIN numérico en celdas iguales (4 a 6), variante de CodigoSegmentado. Un solo
// input real cubre todo el grupo (transparente, sin cursor, a 16 px para que
// iOS no haga zoom) y las celdas son decorativas: cada dígito entra con un pop,
// se enmascara con un punto, la celda activa se resalta, un PIN incorrecto
// sacude y pinta en rojo y `exito` muestra el check. Con
// prefers-reduced-motion no hay movimiento.
export default function PinSegmentado({
  value = '',
  onChange,
  onComplete,
  length = 4,
  autoFocus = false,
  disabled = false,
  invalido = false,
  exito = false,
  ariaLabel,
  id,
  className,
  tecladoTactil,
  discreto = false,
  ...inputProps
}) {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const actualizar = () => setMovil(media.matches)
    media.addEventListener('change', actualizar)
    return () => media.removeEventListener('change', actualizar)
  }, [])
  const tactil = tecladoTactil ?? (isNativeIOS() || movil)
  useEffect(() => {
    if (!tactil) return undefined
    let vigente = true
    let listener
    const ocultar = () => {
      if (!vigente || document.visibilityState === 'hidden') return
      const activo = document.activeElement
      if (activo?.matches('input, textarea, [contenteditable="true"]')) activo.blur()
      if (isNativeIOS()) void Keyboard.hide().catch(error => console.error('[pin] no se pudo ocultar el teclado:', error))
    }
    const frame = requestAnimationFrame(ocultar)
    document.addEventListener('visibilitychange', ocultar)
    window.addEventListener('focus', ocultar)
    if (isNativeIOS()) void App.addListener('appStateChange', ({ isActive }) => { if (isActive) ocultar() }).then(handle => {
      if (vigente) listener = handle
      else void handle.remove()
    }).catch(error => console.error('[pin] no se pudo observar la reanudación:', error))
    return () => {
      vigente = false
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', ocultar)
      window.removeEventListener('focus', ocultar)
      void listener?.remove()
    }
  }, [tactil])
  const total = Math.min(6, Math.max(4, Number(length) || 4))
  const largo = String(value || '').length
  const refGrupo = useRef(null)
  const [enfocado, setEnfocado] = useState(false)

  useEffect(() => {
    if (!invalido) return
    const nodo = refGrupo.current
    if (!nodo || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    nodo.classList.remove('pin-seg-sacude')
    void nodo.offsetWidth
    nodo.classList.add('pin-seg-sacude')
  }, [invalido, value])

  function actualizar(raw) {
    if (disabled || exito) return
    const next = raw.replace(/\D/g, '').slice(0, total)
    onChange?.(next)
    if (next.length === total && next !== value) onComplete?.(next)
  }

  return (
    <div
      ref={refGrupo}
      data-testid="pin-segmentado"
      data-invalido={invalido ? 'true' : undefined}
      data-exito={exito ? 'true' : undefined}
      data-teclado-tactil={tactil ? 'true' : undefined}
      className={cn('pin-seg relative mx-auto w-full max-w-[15rem]', discreto && 'pin-seg-discreto', className)}
    >
      <div className="relative" data-testid="pin-indicadores">
      <div aria-hidden="true" className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {Array.from({ length: total }, (_, i) => {
          const lleno = i < largo
          const activa = enfocado && !disabled && !exito && i === Math.min(largo, total - 1)
          return (
            <span
              key={i}
              data-testid="pin-celda"
              data-lleno={lleno ? 'true' : undefined}
              data-activa={activa ? 'true' : undefined}
              className="pin-seg-celda grid aspect-[4/5] min-w-0 place-items-center rounded-xl border-2 bg-paper"
            >
              {exito
                ? <Icon name="check" className="pin-seg-check h-5 w-5" />
                : lleno && <span className="pin-seg-punto h-3 w-3 rounded-full" />}
            </span>
          )
        })}
      </div>
      <input
        {...inputProps}
        id={id}
        type="text"
        inputMode={tactil ? 'none' : 'numeric'}
        pattern="[0-9]*"
        autoComplete={tactil ? 'off' : 'one-time-code'}
        maxLength={total}
        value={value}
        autoFocus={autoFocus && !tactil}
        readOnly={tactil}
        tabIndex={tactil ? -1 : inputProps.tabIndex}
        onPointerDown={(e) => { if (tactil) e.preventDefault(); inputProps.onPointerDown?.(e) }}
        disabled={disabled}
        aria-label={ariaLabel || `PIN de ${total} dígitos`}
        aria-invalid={invalido || undefined}
        onChange={(e) => actualizar(e.target.value)}
        onKeyDown={(e) => {
          inputProps.onKeyDown?.(e)
          if (!tactil || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); actualizar(`${value}${e.key}`) }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); actualizar(String(value).slice(0, -1)) }
        }}
        onFocus={(e) => { setEnfocado(true); inputProps.onFocus?.(e) }}
        onBlur={(e) => { setEnfocado(false); inputProps.onBlur?.(e) }}
        onPaste={(e) => {
          inputProps.onPaste?.(e)
          if (e.defaultPrevented || disabled) return
          const pegado = e.clipboardData.getData('text').replace(/\D/g, '')
          if (!pegado) return
          e.preventDefault()
          actualizar(pegado)
        }}
        placeholder=""
        data-testid="pin-input"
        className="absolute inset-0 h-full w-full cursor-text border-0 bg-transparent p-0 text-base opacity-0 outline-none [caret-color:transparent]"
      />
      </div>
      {tactil && <PinTeclado disabled={disabled || exito} completo={largo >= total} vacio={!largo} onDigito={digito => actualizar(`${value}${digito}`)} onBorrar={() => actualizar(String(value).slice(0, -1))} />}
    </div>
  )
}
