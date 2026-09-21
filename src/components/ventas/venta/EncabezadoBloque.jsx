// Encabezado de los bloques de la carga de venta. No hay pasos numerados: todo
// el flujo vive en una sola pantalla, así que el título nombra el bloque y el
// espacio de la derecha queda para el dato de contexto (contador, vendedor
// asignado, etc.).
export default function EncabezadoBloque({ titulo, descripcion, extra }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-sm font-bold tracking-tight">{titulo}</h3>
        {descripcion && <p className="mt-0.5 text-xs text-mute">{descripcion}</p>}
      </div>
      {extra}
    </div>
  )
}
