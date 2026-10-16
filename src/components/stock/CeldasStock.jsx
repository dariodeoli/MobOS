// Celdas compartidas de la lista unificada de Stock (fila de escritorio y
// tarjeta móvil): estado, batería, costo y fecha de venta. Presentación pura.
import { Badge, CeldaMoneda } from '@/components/ui'
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
      className={`w-fit whitespace-nowrap ${item.status === 'reservado' ? '!bg-ink-900' : ''} ${className || ''}`}
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

// Equipo de un tercero en consignación: se ve en la fila y en la tarjeta (el
// detalle con monto y teléfono vive en la ficha). La API solo lo informa a los
// roles que ven costos (igual que el proveedor), así que no hay dato que mostrar
// sin permiso.
export function ConsignadoStock({ item, className }) {
  if (!item?.consignorName) return null
  return (
    <Badge
      color="blue"
      data-testid="stock-consignado"
      title={`En consignación de ${item.consignorName}`}
      className={className ? `w-fit shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px] ${className}` : 'w-fit shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px]'}
    >
      Consignado
    </Badge>
  )
}
