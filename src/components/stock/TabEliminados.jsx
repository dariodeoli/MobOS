import { cn } from '@/lib/utils'
import { CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { nombreProducto } from '@/utils/inventario'
import SerialTexto from '@/components/shared/SerialTexto'
import { Button, EmptyState } from '@/components/ui'
import { GRID_ELIMINADOS } from './stockHelpers'

export default function TabEliminados({ ctx }) {
  const { removedUnits, busy, requestReason } = ctx
  return (
    <div className="mt-4 overflow-x-auto" data-testid="eliminados-tabla"><div className={cn(GRID_ELIMINADOS, 'border border-transparent px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Producto</span><span className={CELDA_ENCABEZADO}>IMEI</span><span className={CELDA_ENCABEZADO}>Nota</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{removedUnits.map(unit => { const serial = String(unit.serial || ''); return <div key={unit.id} data-testid="eliminado-fila" className={cn(GRID_ELIMINADOS, 'rounded-xl border border-bad/25 bg-bad/5 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {}) || 'Producto'}</span><SerialTexto serial={serial} className="truncate text-[11px] text-mute" /><span className="truncate text-[11px] text-mute">Conserva su historial de auditoría</span><span className="flex items-center justify-end"><Button className="h-8 px-2 text-xs" disabled={busy} onClick={() => requestReason('restore', unit)}>Restaurar</Button></span></div> })}{!removedUnits.length && <EmptyState compact icon="box" title="No hay unidades eliminadas recuperables." />}</div></div>
  )
}
