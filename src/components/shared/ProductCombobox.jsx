import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

const MAX_SUGGESTIONS = 8

function productName(product) {
  return product?.nombre || product?.name || ''
}

export default function ProductCombobox({ products = [], selectedId = '', onSelect, onCreate, onQueryChange, placeholder = 'Buscar producto…', disabled = false, className }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [creating, setCreating] = useState(false)
  const listId = useId()
  const rootRef = useRef(null)

  // Cierra el dropdown al hacer clic fuera: sin esto, el listado abierto
  // se superpone a los resultados de productos y se come los clics.
  useEffect(() => {
    // Cierra con cualquier clic fuera de una opción: el listado abierto se
    // superpone a los resultados de productos y bloqueaba sus clics.
    const cerrarFuera = (event) => {
      const enOpcion = event.target instanceof Element && event.target.closest('button[role="option"]')
      if (enOpcion) return
      close()
    }
    document.addEventListener('mousedown', cerrarFuera)
    // El scroll (incluido el del grid de resultados al hacer clic abajo)
    // también cierra: el listado no debe seguir superpuesto a los productos.
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', cerrarFuera)
      document.removeEventListener('scroll', close, true)
    }
  }, [])

  const setearQuery = useCallback((next) => {
    setQuery(next)
    onQueryChange?.(next)
  }, [onQueryChange])

  useEffect(() => {
    if (!selectedId) return
    const selected = products.find((product) => product.id === selectedId)
    if (selected) setearQuery(productName(selected))
  }, [selectedId, products, setearQuery])

  const term = query.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!term) return []
    return products
      .filter((product) => productName(product).toLowerCase().includes(term) || String(product.sku || '').toLowerCase().includes(term))
      .slice(0, MAX_SUGGESTIONS)
  }, [products, term])
  const canCreate = Boolean(term && onCreate && suggestions.length === 0)
  const optionCount = suggestions.length + (canCreate ? 1 : 0)

  function close() {
    setOpen(false)
    setHighlight(0)
  }
  function choose(product) {
    setearQuery(productName(product))
    setOpen(false)
    setHighlight(0)
    onSelect?.(product)
  }
  async function createNew() {
    if (!onCreate || creating) return
    setCreating(true)
    try {
      const created = await onCreate(query.trim())
      if (created?.id) {
        setearQuery(productName(created))
        onSelect?.(created)
      }
      setOpen(false)
    } catch {
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (!optionCount) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((current) => (current + delta + optionCount) % optionCount)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!open || !term) return
      if (canCreate && highlight >= suggestions.length) {
        createNew()
        return
      }
      const product = suggestions[highlight]
      if (product) choose(product)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setearQuery(event.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(close, 120)}
        onKeyDown={onKeyDown}
      />
      {open && term && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-ink-500 bg-ink-800 py-1 shadow-lg">
          {suggestions.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                tabIndex={-1}
                className={cn('flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm transition', index === highlight ? 'bg-ink-700' : '')}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(product)
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                <span className="min-w-0 truncate text-fore">{productName(product)}</span>
                {product.sku ? <span className="shrink-0 text-xs text-mute">{product.sku}</span> : null}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={highlight >= suggestions.length}
                tabIndex={-1}
                disabled={creating}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-fono-light transition disabled:opacity-50', highlight >= suggestions.length ? 'bg-ink-700' : '')}
                onMouseDown={(event) => {
                  event.preventDefault()
                  createNew()
                }}
                onMouseEnter={() => setHighlight(suggestions.length)}
              >
                {creating ? 'Creando…' : `＋ Agregar «${query.trim()}» como producto nuevo`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
