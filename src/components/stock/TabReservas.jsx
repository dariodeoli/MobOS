import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { nombreProducto } from '@/utils/inventario'
import SerialTexto from '@/components/shared/SerialTexto'
import { Button, EmptyState } from '@/components/ui'
import { printReservationReceipt } from '@/components/shared/OrderReceipt'
import { GRID_RESERVAS, fechaReserva } from './stockHelpers'

export default function TabReservas({ ctx }) {
  const { reservations, busy, sellUnit, releaseReservation } = ctx
  return (
    <div className="mt-4 overflow-x-auto" data-testid="reservas-tabla"><div className={cn(GRID_RESERVAS, 'border border-transparent px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Producto</span><span className={CELDA_ENCABEZADO}>IMEI</span><span className={CELDA_ENCABEZADO}>Cliente</span><span className={CELDA_ENCABEZADO}>Vence</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{reservations.map(unit => { const serial = String(unit.serial || ''); const cliente = unit.reservationCustomerRef?.name || unit.reservationCustomer || 'Sin cliente'; return <div key={unit.id} data-testid="reserva-fila" className={cn(GRID_RESERVAS, 'rounded-xl border border-reserved/30 bg-reserved/10 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={nombreProducto(unit.product || {})}>{nombreProducto(unit.product || {}) || 'Producto'}</span><SerialTexto serial={serial} className="truncate text-[11px] text-mute" /><span className="truncate text-xs" title={cliente}>{cliente}</span><span className={CELDA_DATO} title={unit.reservedUntil ? new Date(unit.reservedUntil).toLocaleString('es-PY') : undefined}>{unit.reservedUntil ? fechaReserva(unit.reservedUntil) : '—'}</span><span className="flex flex-wrap items-center justify-end gap-1"><Button type="button" className="h-8 px-2 text-xs" disabled={busy} onClick={() => sellUnit(unit)}>Vender</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" title="Imprimir comprobante de la reserva" onClick={() => printReservationReceipt(unit, { format: 'a4' })}>Comprobante</Button><Button variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => releaseReservation(unit.serial)}>Liberar</Button></span></div> })}{!reservations.length && <EmptyState compact icon="box" title="No hay reservas activas." />}</div></div>
  )
}
