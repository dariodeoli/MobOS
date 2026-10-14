import { useState } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Chips de filtro de un listado (Pedidos, Cotizaciones). Los estados de uso
// diario van como chips; los poco frecuentes (`mas`) se muestran con un chip
// «Más estados» que los despliega en la misma fila: nunca un `select` nativo ni
// un menú flotante (docs/PANTALLAS.md reglas 6 y 7). Si el filtro activo está
// entre los de `mas`, la fila queda desplegada para que se vea cuál rige.
// Opciones: [[clave, etiqueta], …]. Estilos: `.ventas-f3-chips` (ventasF3.css).
export default function ChipsFiltro({ opciones, valor, onChange, etiqueta, mas = [], etiquetaMas = 'Más estados', className }) {
  const [abierto, setAbierto] = useState(false)
  const activoEnMas = mas.some(([clave]) => clave === valor)
  const visible = abierto || activoEnMas
  const chip = ([clave, texto]) => (
    <button key={clave} type="button" aria-pressed={valor === clave} onClick={() => onChange(clave)}>
      {texto}
    </button>
  )
  return (
    <div className={cn('ventas-f3-chips', className)} role="group" aria-label={etiqueta}>
      {opciones.map(chip)}
      {mas.length > 0 && (
        <button
          type="button"
          data-chip-mas
          aria-expanded={visible}
          onClick={() => setAbierto((actual) => !actual)}
        >
          {etiquetaMas}
          <Icon name="chevron" className={cn('ml-1 inline h-3.5 w-3.5 transition', visible && 'rotate-180')} />
        </button>
      )}
      {visible && mas.map(chip)}
    </div>
  )
}
