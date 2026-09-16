import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { Input } from '@/components/ui'

// Entrada de ciudad con autocompletado: al escribir aparecen coincidencias y,
// al elegir una, se completa el departamento automáticamente. El texto libre
// sigue permitido para ciudades que no estén en la lista.
export default function CityAutocomplete({ value = '', onSelect, placeholder = 'Ej: Asunción, Ciudad del Este…', disabled = false, esDemo = false }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef(null)
  const root = useRef(null)

  useEffect(() => {
    if (esDemo) return undefined
    function onDocumentClick(event) {
      if (root.current && !root.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [esDemo])

  async function buscar(texto) {
    const q = (texto || '').trim()
    if (q.length < 2) { setSuggestions([]); setError(''); setOpen(false); return }
    try {
      const rows = await api.get(`/api/geo/cities?q=${encodeURIComponent(q)}`)
      setSuggestions(rows || [])
      setError('')
      setOpen(true)
    } catch (cause) {
      setSuggestions([])
      setError(cause?.message || 'No se pudieron cargar las sugerencias.')
    }
  }

  function change(texto) {
    // Al escribir a mano se borra el departamento: solo se vuelve a completar
    // cuando el usuario elige una sugerencia.
    onSelect(texto, '')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (!esDemo) buscar(texto) }, 250)
  }

  function elegir(city) {
    if (timer.current) clearTimeout(timer.current)
    onSelect(city.city, city.department)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={root} className="relative">
      <Input
        maxLength={100}
        disabled={disabled}
        value={value}
        onChange={(event) => change(event.target.value)}
        onFocus={() => { if (!esDemo && value.trim().length >= 2 && suggestions.length) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Ciudad"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-ink-500 bg-paper shadow-xl">
          {suggestions.map((city) => (
            <li key={`${city.city}-${city.department}`}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-ink-700"
                onClick={() => elegir(city)}
              >
                <span className="truncate font-medium text-fore">{city.city}</span>
                <span className="shrink-0 text-xs text-mute">{city.department}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}
