import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BANCOS_PARAGUAY } from '@/lib/bancos-paraguay'
import { normalizarBanco } from '@/lib/bancosLogos'
import { Input } from '@/components/ui'
import BancoLogo from '@/components/shared/BancoLogo'
import { cn } from '@/lib/utils'

// Campo de banco con sugerencias ilustradas: al abrir muestra el catálogo
// completo (lista scrollable) y mientras se escribe filtra al instante.
// Mantiene el contrato del campo de texto: entrega el string por onChange.
export default function BancoCombobox({ id, value = '', onChange, required = false, disabled = false, placeholder, className }) {
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const listaId = useId()
  const raiz = useRef(null)
  const lista = useRef(null)

  useEffect(() => {
    const cerrarFuera = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
    }
    document.addEventListener('click', cerrarFuera)
    return () => document.removeEventListener('click', cerrarFuera)
  }, [])

  const termino = normalizarBanco(value)
  const sugerencias = useMemo(() => {
    if (!termino) return BANCOS_PARAGUAY
    return BANCOS_PARAGUAY.filter((banco) => normalizarBanco(banco).includes(termino))
  }, [termino])

  // La opción resaltada con el teclado queda a la vista en la lista larga.
  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector(`#${CSS.escape(`${listaId}-${resaltado}`)}`)?.scrollIntoView({ block: 'nearest' })
  }, [abierto, resaltado, listaId])

  function elegir(banco) {
    onChange(banco)
    setAbierto(false)
    setResaltado(0)
  }

  function alTeclear(event) {
    if (event.key === 'Escape') { setAbierto(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!abierto) { setAbierto(true); return }
      if (!sugerencias.length) return
      const paso = event.key === 'ArrowDown' ? 1 : -1
      setResaltado((actual) => (actual + paso + sugerencias.length) % sugerencias.length)
      return
    }
    if (event.key === 'Enter' && abierto && sugerencias[resaltado]) {
      event.preventDefault()
      elegir(sugerencias[resaltado])
    }
  }

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCapitalize="words"
        required={required}
        disabled={disabled}
        maxLength={200}
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setAbierto(true); setResaltado(0) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={alTeclear}
      />
      {abierto && sugerencias.length > 0 && (
        <ul ref={lista} id={listaId} role="listbox" aria-label="Bancos de Paraguay" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-500 bg-ink-800 py-1 shadow-xl">
          {sugerencias.map((banco, indice) => (
            <li key={banco}>
              <button
                id={`${listaId}-${indice}`}
                type="button"
                role="option"
                aria-selected={indice === resaltado}
                tabIndex={-1}
                className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition', indice === resaltado ? 'bg-ink-700' : '')}
                onMouseDown={(event) => { event.preventDefault(); elegir(banco) }}
                onMouseEnter={() => setResaltado(indice)}
              >
                <BancoLogo banco={banco} alto="h-4" />
                <span className="min-w-0 truncate text-fore">{banco}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
