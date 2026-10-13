import Icon from '@/components/shared/Icon'
import { Skeleton } from '@/components/ui'
import { UNIDADES_GRID } from './stockHelpers'

// Encabezado de la tabla de unidades: **mismo contenido-box que las filas**
// (`px-3` + el borde izquierdo de 4 px que reserva el acento de condición y el
// borde de 1 px del otro lado), así cada título cae exactamente sobre su
// columna en todos los estados. Cada columna lleva su ícono (donde aplica) y el
// título completo; el detalle largo queda en el tooltip.
export function EncabezadoUnidades({ seleccionado = false, onSeleccionar }) {
  const celda = 'flex min-w-0 items-center gap-1 text-xs font-medium text-mute'
  const icono = 'h-3 w-3 shrink-0 opacity-70'
  return (
    <div
      data-testid="inventario-encabezado"
      className={`stock-f4-header ${UNIDADES_GRID} rounded-lg border border-transparent border-b-ink-600/60 border-l-4 bg-ink-800/40 px-3 py-1`}
    >
      <span className="flex items-center">
        {onSeleccionar ? (
          <label className="flex h-11 w-11 items-center justify-center md:h-5 md:w-5">
            <input
              type="checkbox"
              className="h-4 min-h-0 w-4 accent-fono"
              aria-label="Seleccionar visibles"
              title="Seleccionar visibles"
              checked={seleccionado}
              onChange={onSeleccionar}
            />
            <span className="stock-f4-select-caption">Seleccionar visibles</span>
          </label>
        ) : null}
      </span>
      <span className={celda} title="Modelo, condición y batería de la unidad">
        <Icon name="box" className={icono} aria-hidden="true" />
        Producto
      </span>
      <span className={celda} title="IMEI/serial de la unidad">
        <Icon name="qr" className={icono} aria-hidden="true" />
        IMEI
      </span>
      <span className={celda} title="Estado de la verificación física, quién la hizo y cuándo">
        <Icon name="shield" className={icono} aria-hidden="true" />
        Verificación
      </span>
      <span className={celda} title="Sucursal y depósito donde está la unidad">
        <Icon name="store" className={icono} aria-hidden="true" />
        Ubicación
      </span>
      <span
        className={celda}
        title="Estado de la unidad (disponible, reservada, en tránsito, vendida…)"
      >
        <Icon name="info" className={icono} aria-hidden="true" />
        Estado
      </span>
      <span
        className={`${celda} justify-end text-right`}
        title="Costo convertido a USD; si no hay cotización, se conserva el importe original en Gs"
      >
        <Icon name="money" className={icono} aria-hidden="true" />
        Costo (USD)
      </span>
      <span
        className={`${celda} justify-end`}
        title="Acciones de la fila: ver detalles, editar y más"
      >
        <Icon name="sliders" className={icono} aria-hidden="true" />
        Acciones
      </span>
    </div>
  )
}
// Esqueleto de carga con la misma grilla que el encabezado y las filas: mientras
// llegan los datos se ve el esqueleto alineado en lugar del estado vacío
// (antes la tabla "saltaba" del vacío a las filas).

export function FilasCargando({ cantidad = 4 }) {
  return (
    <div className="space-y-1" data-testid="unidades-cargando" aria-hidden="true">
      {Array.from({ length: cantidad }).map((_, indice) => (
        <div
          key={indice}
          className={`stock-f4-skeleton ${UNIDADES_GRID} rounded-lg border border-ink-600 border-l-4 border-l-transparent px-3 py-1.5`}
        >
          <span className="flex items-center">
            <span className="flex h-11 w-11 items-center justify-center md:h-5 md:w-5">
              <Skeleton className="h-4 w-4 rounded" />
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Skeleton className="h-4 w-4 rounded-md" />
            <Skeleton className="h-3 w-3/5" />
          </span>
          <span className="flex items-center">
            <Skeleton className="h-3 w-8" />
          </span>
          <span className="flex items-center justify-end">
            <Skeleton className="h-3 w-14" />
          </span>
          <span className="flex items-center">
            <Skeleton className="h-3 w-12" />
          </span>
          <span className="flex items-center">
            <Skeleton className="h-3 w-24" />
          </span>
          <span className="flex items-center">
            <Skeleton className="h-3 w-16" />
          </span>
          <span className="flex items-center justify-end">
            <Skeleton className="h-3 w-20" />
          </span>
        </div>
      ))}
    </div>
  )
}
