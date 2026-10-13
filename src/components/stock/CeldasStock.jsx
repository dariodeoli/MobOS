// Celdas compartidas de la lista unificada de Stock (fila de escritorio y
// tarjeta móvil): estado, batería, costo y fecha de venta. Presentación pura.
import { CeldaMoneda } from '@/components/ui'
import ChipEstado from '@/components/shared/ChipEstado'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { fechaHora } from '@/utils/fecha'
import { etiquetaEstadoStock, textoEstadoItem, tonoEstadoStock } from '@/lib/stockItems'

const ICONO_ESTADO = { disponible: 'check', reservado: 'clock', vendido: 'receipt', defectuoso: 'alert', en_transito: 'truck', eliminado: 'trash' }

export function EstadoStock({ item, className }) {
  const texto = textoEstadoItem(item)
  return (
    <ChipEstado
      estado={item.status}
      etiqueta={texto}
      tono={tonoEstadoStock(item.status)}
      icono={ICONO_ESTADO[item.status] || 'info'}
      title={item.kind === 'product' ? `${texto} (${etiquetaEstadoStock(item.status)})` : texto}
      className={className ? `w-fit whitespace-nowrap ${className}` : 'w-fit whitespace-nowrap'}
    />
  )
}

export function BateriaStock({ item }) {
  const porcentaje = Number(item.batteryHealth)
  if (!(porcentaje > 0)) return <span className="text-xs text-mute" title="Sin dato de batería">—</span>
  return <MedidorBateria porcentaje={porcentaje} variante="chip" />
}

// Gs. completos (sin abreviar); null = el rol no ve costos (la columna se oculta
// antes de llegar acá) o la unidad todavía no tiene costo cargado.
export function CostoStock({ item }) {
  if (item.costPyg === null || item.costPyg === undefined) return <span className="text-xs text-mute">Sin costo</span>
  return <CeldaMoneda valor={item.costPyg} className="text-xs" />
}

export const fechaVentaStock = (item) => fechaHora(item.soldAt || item.createdAt, '—')
