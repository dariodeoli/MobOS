// Encabezado numerado de los bloques de la carga de venta. El número ordena el
// flujo natural (cliente → productos → venta → cobro) y el título nombra el
// bloque; el espacio de la derecha queda para el dato de contexto (contador,
// vendedor asignado, etc.).
export default function EncabezadoBloque({ numero, titulo, descripcion, extra }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-start gap-2.5">
        {numero != null && (
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-fono/15 text-[11.5px] font-bold text-fono-light"
          >
            {numero}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight">{titulo}</h3>
          {descripcion && <p className="mt-0.5 text-xs text-mute">{descripcion}</p>}
        </div>
      </div>
      {extra}
    </div>
  )
}
