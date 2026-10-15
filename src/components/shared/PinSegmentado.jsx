import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/shared/Icon'

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
  ...inputProps
}) {
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
    if (disabled) return
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
      className={cn('pin-seg relative mx-auto w-full max-w-[15rem]', className)}
    >
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
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={total}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel || `PIN de ${total} dígitos`}
        aria-invalid={invalido || undefined}
        onChange={(e) => actualizar(e.target.value)}
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
  )
}
