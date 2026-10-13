import { EmptyState, Skeleton } from '@/components/ui'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS_COMPACTA } from '@/components/shared/formulario'
import { TarjetaUnidad, TarjetaUnidadMovil } from './TarjetaStockMovil'
import { printLabel } from './impresionStock'
import { EncabezadoUnidades, FilasCargando } from './TablaUnidades'
import { FilaUnidad } from './FilaStock'

export default function TabUnidades({ ctx }) {
  const { tab, esMovil, cargandoUnidades, disponibles, busy, seleccionados, setSeleccionados, verify, sellUnit, openReserveFor, avisarImpresion, requestReason, setDetalleUnidad, imprimirComprobanteRapido, abrirApartado, liberarApartado, query, vistaUnidades, guardarCostoRapido, cotizacion } = ctx
  return (
    <>{tab === 'unidades' && esMovil && <div className="stock-f4-cards mt-4 space-y-1.5" data-testid="inventario-tarjetas">{cargandoUnidades ? <div className="space-y-2" aria-busy="true"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" /></div> : <>{disponibles.map(unit => <TarjetaUnidadMovil key={unit.id} unit={unit} busy={busy} seleccionado={seleccionados.includes(unit.id)} onAlternar={() => setSeleccionados((actuales) => alternarId(actuales, unit.id))} onVerify={verify} onSell={sellUnit} onReserve={openReserveFor} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onComprobante={imprimirComprobanteRapido} onApartar={abrirApartado} onLiberarApartado={liberarApartado} onClick={() => setDetalleUnidad(unit)} />)}{!disponibles.length && <div data-testid="unidades-vacio"><EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en inventario.'} /></div>}</>}</div>}
{tab === 'unidades' && !esMovil && vistaUnidades === 'list' && <div className="stock-f4-list mt-4" data-testid="inventario-tabla"><EncabezadoUnidades seleccionado={disponibles.length > 0 && seleccionados.length === disponibles.length} onSeleccionar={() => setSeleccionados((actuales) => seleccionarTodos(disponibles, actuales))} />{cargandoUnidades
    ? <FilasCargando />
    : <div className="space-y-1" aria-busy="false">{disponibles.map(unit => <FilaUnidad key={unit.id} unit={unit} busy={busy} onVerify={verify} onSell={sellUnit} onReserve={openReserveFor} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onEdit={unit => setDetalleUnidad(unit)} onCosto={guardarCostoRapido} cotizacion={cotizacion} onClick={() => setDetalleUnidad(unit)} seleccionado={seleccionados.includes(unit.id)} onAlternar={() => setSeleccionados((actuales) => alternarId(actuales, unit.id))} />)}{!disponibles.length && <div data-testid="unidades-vacio"><EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en inventario.'} /></div>}</div>}</div>}
{tab === 'unidades' && !esMovil && vistaUnidades === 'grid' && <div className={cn('mt-4 min-[1200px]:grid-cols-3', GRILLA_DOS_COLUMNAS_COMPACTA)}>{disponibles.map(unit => <TarjetaUnidad key={unit.id} unit={unit} onClick={() => setDetalleUnidad(unit)} />)}{!disponibles.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay stock disponible.'} />}</div>}</>
  )
}
