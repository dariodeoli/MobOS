import { useEffect, useRef, useState } from 'react'
import { MEDIOS_PAGO } from '@/lib/storage'
import { cn } from '@/lib/utils'
import MedioPago from './MedioPago'
import Icon from './Icon'

// Desplegable de medio de pago que muestra el logo de cada banco. Reemplaza al
// <select> nativo, que no puede renderizar imágenes dentro de sus opciones.
export default function SelectorMedioPago({ value, onChange, className }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-lg border bg-ink-800 px-3 transition md:h-9',
          abierto ? 'border-fono ring-1 ring-fono/40' : 'border-ink-500 hover:border-ink-500',
        )}
      >
        <MedioPago medio={value} alto="h-5" />
        <Icon name="chevron" className={cn('h-4 w-4 text-mute transition', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-ink-500 bg-ink-800 py-1 shadow-xl">
          {MEDIOS_PAGO.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m)
                setAbierto(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-2 transition hover:bg-ink-700',
                value === m && 'bg-fono/10',
              )}
            >
              <MedioPago medio={m} alto="h-5" />
              {value === m && <Icon name="check" className="h-4 w-4 text-fono-light" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
