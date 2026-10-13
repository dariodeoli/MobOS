import { EmptyState } from '@/components/ui'
import { EncabezadoUnidades, FilasCargando } from './TablaUnidades'
import { FilaUnidad } from './FilaStock'
import { printLabel } from './impresionStock'

export default function TabTransito({ ctx }) {
  const { cargandoUnidades, enTransito, busy, verify, avisarImpresion, requestReason, setDetalleUnidad, abrirApartado, liberarApartado, guardarCostoRapido, cotizacion, query } = ctx
  return (
    <div className="stock-f4-list mt-4" data-testid="inventario-tabla"><EncabezadoUnidades />{cargandoUnidades ? <FilasCargando /> : <div className="space-y-1">{enTransito.map(unit => <FilaUnidad key={unit.id} unit={unit} busy={busy} onVerify={verify} onLabel={unit => printLabel(unit).then(avisarImpresion)} onAdjust={unit => requestReason('adjust', unit)} onRemove={unit => requestReason('remove', unit)} onMove={unit => setDetalleUnidad(unit)} onEdit={unit => setDetalleUnidad(unit)} onApartar={abrirApartado} onLiberarApartado={liberarApartado} onCosto={guardarCostoRapido} cotizacion={cotizacion} onClick={() => setDetalleUnidad(unit)} />)}{!enTransito.length && <EmptyState compact icon="box" title={query ? 'Ninguna unidad coincide con la búsqueda.' : 'No hay unidades en tránsito.'} />}</div>}</div>
  )
}
