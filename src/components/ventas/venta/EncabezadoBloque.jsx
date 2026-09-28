import { cn } from '@/lib/utils'

// Encabezado de los bloques de la carga de venta. No hay pasos numerados: todo
// el flujo vive en una sola pantalla, así que el título nombra el bloque y el
// espacio de la derecha queda para el dato de contexto (contador, vendedor
// asignado, etc.). `tono` pinta el título con el color del bloque (#281) sin
// tocar la estructura: identidad de color suave y consistente entre temas.
export default function EncabezadoBloque({ titulo, descripcion, extra, tono = '' }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h3 className={cn('text-sm font-bold tracking-tight', tono)}>{titulo}</h3>
        {descripcion && <p className="mt-0.5 text-xs text-mute">{descripcion}</p>}
      </div>
      {extra}
    </div>
  )
}
