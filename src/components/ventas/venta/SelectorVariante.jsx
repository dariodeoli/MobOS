import { useEffect, useRef } from 'react'
import { Modal } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { CELDA_DATO } from '@/components/shared/tabla'
import PrecioStockProducto from './PrecioStockProducto'

// #308 · Venta segura: cuando la familia tiene más de una variante, el POS ya
// no elige sola la primera: el vendedor elige modelo/capacidad/color exactos
// antes de sumarla a la venta (el carrito no cambia hasta que elige).
export default function SelectorVariante({ abierto, familia, onElegir, onClose, precios = {}, preciosCargando = false, sucursal = null, sucursales = [] }) {
  const items = familia?.items || []
  const opcionesRef = useRef([])

  // Después de elegir una familia desde el buscador, el primer foco queda en
  // la primera variante. Así Enter confirma la opción visible y las flechas
  // recorren las variantes sin obligar a usar el mouse.
  useEffect(() => {
    if (!abierto) return undefined
    const frame = window.requestAnimationFrame(() => opcionesRef.current[0]?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [abierto, familia?.base, items.length])

  function moverOpcion(event) {
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const actual = opcionesRef.current.indexOf(document.activeElement)
    const indice = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (actual + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    opcionesRef.current[indice]?.focus()
  }
  return (
    <Modal
      open={Boolean(abierto)}
      onClose={onClose}
      title="Elegí la variante"
      size="formulario"
    >
      <div className="space-y-3" data-testid="selector-variante" onKeyDown={moverOpcion}>
        <p className="text-sm text-mute">
          <b className="text-fore">{familia?.base}</b> tiene {items.length} variantes: elegí la
          exacta antes de agregarla (queda en la venta con ese modelo, capacidad y color).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((producto, index) => {
            const variante = [
              producto.model || producto.modelo,
              producto.capacity || producto.capacidad,
              producto.color,
              producto.condition === 'USED' ? 'Seminuevo' : producto.condition === 'NEW' ? 'Nuevo' : '',
            ].filter(Boolean).join(' · ')
            return (
              <button
                key={producto.id}
                type="button"
                data-testid="variante-opcion"
                ref={node => { opcionesRef.current[index] = node }}
                disabled={Boolean(producto.__agregando)}
                onClick={() => onElegir?.(producto)}
                className="flex items-center gap-3 rounded-xl border border-ink-600 p-3 text-left transition hover:border-fono focus-visible:outline focus-visible:outline-fono"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
                  <Icon name="phone" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {variante || producto.nombre || familia?.base}
                  </strong>
                  <span className={`block truncate ${CELDA_DATO}`}>{producto.sku || 'Sin SKU'}</span>
                  <PrecioStockProducto productos={[producto]} precios={precios} cargando={preciosCargando} sucursal={sucursal} sucursales={sucursales} compacto />
                </span>
                <Icon name="plus" className="h-4 w-4 shrink-0 text-fono-light" />
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
