import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Buscador con lista de resultados en tiempo real (#141/#143). Reemplaza a los
// desplegables nativos cuando la lista es grande: filtra por etiqueta y detalle
// (sin acentos ni mayúsculas), se navega con teclado y acepta texto libre.
//
// Cada opción es { value, label, detail?, badge? }. Con `onSelect` se avisa la
// opción elegida; con `onChange`, el texto tipeado (para permitir escribir un
// valor que no esté en la lista).

const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export default function ComboBuscador({
  id,
  value = '',
  onChange,
  onSelect,
  options = [],
  placeholder = 'Buscar…',
  emptyLabel = 'Sin resultados para esa búsqueda.',
  disabled = false,
  required = false,
  className,
  ariaLabel,
  maxLength = 200,
  abrirAlEnfocar = true,
}) {
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const ref = useRef(null)
  const listId = `${id || 'combo'}-listbox`

  const filtradas = useMemo(() => {
    const consulta = normalizar(value)
    if (!consulta) return options.slice(0, 40)
    return options.filter((opcion) => normalizar(`${opcion.label} ${opcion.detail || ''} ${opcion.badge || ''}`).includes(consulta)).slice(0, 40)
  }, [options, value])

  useEffect(() => {
    if (!abierto) return
    const fuera = (evento) => { if (ref.current && !ref.current.contains(evento.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => { setResaltado(0) }, [value, abierto])

  function elegir(opcion) {
    if (!opcion) return
    onSelect?.(opcion)
    setAbierto(false)
  }

  function teclas(evento) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (!abierto) { setAbierto(true); return }
      const paso = evento.key === 'ArrowDown' ? 1 : -1
      setResaltado((actual) => (actual + paso + filtradas.length) % Math.max(1, filtradas.length))
      return
    }
    if (evento.key === 'Enter' && abierto && filtradas.length) { evento.preventDefault(); elegir(filtradas[resaltado]) }
    if (evento.key === 'Escape') setAbierto(false)
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={abierto && filtradas.length ? `${listId}-${resaltado}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(evento) => { onChange?.(evento.target.value); if (!abierto) setAbierto(true) }}
        onFocus={() => { if (abrirAlEnfocar) setAbierto(true) }}
        onKeyDown={teclas}
        className="h-11 w-full rounded-lg border border-ink-500 bg-ink-800 px-3.5 text-base text-fore outline-none transition placeholder:text-mute/60 focus:border-fono focus:ring-1 focus:ring-fono/40 disabled:opacity-50 md:h-9 md:text-sm"
      />
      {abierto && !disabled && (
        <div id={listId} role="listbox" className="absolute z-40 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-ink-500 bg-ink-800 py-1 shadow-xl">
          {filtradas.length === 0 && <p className="px-3 py-2 text-xs text-mute">{emptyLabel}</p>}
          {filtradas.map((opcion, indice) => (
            <button
              key={opcion.value}
              id={`${listId}-${indice}`}
              type="button"
              role="option"
              aria-selected={indice === resaltado}
              onMouseEnter={() => setResaltado(indice)}
              onClick={() => elegir(opcion)}
              className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-ink-700', indice === resaltado && 'bg-fono/10')}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-fore">{opcion.label}</span>
                {opcion.detail && <span className="mt-0.5 block truncate text-[11px] text-mute">{opcion.detail}</span>}
              </span>
              {opcion.badge && <span className="shrink-0 rounded-md bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-mute">{opcion.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
