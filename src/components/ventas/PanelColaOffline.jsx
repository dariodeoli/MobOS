import { useState } from 'react'
import { Modal, Button, ConfirmDialog, Badge, EmptyState } from '@/components/ui'
import { useColaOffline } from '@/hooks/useColaOffline'
import { ETIQUETA_CONFLICTO } from '@/lib/offline/queue'
import { descartarVenta, reintentarVenta } from '@/lib/offline/ventas'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Reporte del modo offline (#168): qué se vendió sin conexión, cuánto tardó en
// sincronizarse, con qué éxito, y la lista de ventas con sus conflictos para
// resolverlos (reintentar o descartar).
const hora = (ms) => (ms ? new Date(ms).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const duracion = (ms) => {
  if (!ms) return '—'
  const segundos = Math.round(ms / 1000)
  if (segundos < 60) return `${segundos} s`
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `${minutos} min`
  return `${Math.round(minutos / 60)} h`
}
const ESTADO_TONO = { pendiente: 'orange', enviada: 'green', conflicto: 'red' }

function Metrica({ label, valor, extra }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-600 bg-ink-800/50 p-3">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tracking-tight tabular-nums text-fore">{valor}</div>
      {extra && <div className="mt-0.5 text-[11px] text-mute">{extra}</div>}
    </div>
  )
}

export default function PanelColaOffline({ open, onClose }) {
  const { items, reporte, sincronizando, sincronizar, enLinea, refrescar } = useColaOffline()
  const [descartar, setDescartar] = useState(null)
  const [busy, setBusy] = useState(false)

  async function confirmarDescarte() {
    if (!descartar || busy) return
    setBusy(true)
    try {
      await descartarVenta(descartar.id)
      setDescartar(null)
      refrescar()
    } finally {
      setBusy(false)
    }
  }

  return (
<<<<<<< HEAD
    <Modal open={open} onClose={onClose} title="Ventas sin conexión" size="amplio">
=======
    <Modal open={open} onClose={onClose} title="Ventas sin conexión" size="2xl">
>>>>>>> origin/slot/diseno
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-mute">
            Todo lo que se vendió sin conexión desde este dispositivo. Sincronizar reenvía con la misma clave: nada se duplica.
          </p>
          <Button type="button" onClick={sincronizar} disabled={sincronizando || !enLinea}>
            {sincronizando ? 'Sincronizando…' : enLinea ? 'Sincronizar ahora' : 'Sin conexión'}
          </Button>
        </div>

        {reporte && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metrica label="Vendido sin conexión" valor={gs(reporte.vendidoPyg)} extra={`${reporte.total} venta(s)`} />
            <Metrica label="Sincronizado" valor={gs(reporte.sincronizadoPyg)} extra={`${reporte.enviadas} venta(s)`} />
            <Metrica label="En cola" valor={gs(reporte.enColaPyg)} extra={`${reporte.pendientes} pendiente(s)`} />
            <Metrica label="Tasa de éxito" valor={`${reporte.tasaExito}%`} extra={`${reporte.conflictos} conflicto(s)`} />
            <Metrica label="Tiempo de sync" valor={duracion(reporte.tiempoPromedioMs)} extra={`máx ${duracion(reporte.tiempoMaximoMs)}`} />
            <Metrica label="Espera pendiente" valor={duracion(reporte.esperaPromedioMs)} extra="promedio de lo que falta" />
            <Metrica label="Reintentos" valor={reporte.intentos} extra="automáticos por corte" />
            <Metrica
              label="Conflictos por tipo"
              valor={Object.keys(reporte.porTipo).length ? Object.entries(reporte.porTipo).map(([tipo, cantidad]) => `${ETIQUETA_CONFLICTO[tipo] || tipo}: ${cantidad}`).join(' · ') : 'Ninguno'}
            />
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-ink-600">
          <div className="border-b border-ink-600 bg-ink-700/50 px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wider text-mute">
            Ventas ({items.length})
          </div>
          <div className="max-h-80 divide-y divide-ink-600 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge color={ESTADO_TONO[item.estado] || 'slate'}>
                      {item.estado === 'conflicto' ? `Conflicto · ${ETIQUETA_CONFLICTO[item.tipo] || 'Otro'}` : item.estado === 'enviada' ? 'Sincronizada' : 'Pendiente'}
                    </Badge>
                    <span className="norma-none truncate font-medium">{item.resumen?.cliente || 'Sin cliente'}</span>
                    <span className="tabular-nums text-mute">{gs(item.resumen?.total || 0)}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-mute">
                    {hora(item.creadoEn)}
                    {item.estado === 'enviada' && item.sincronizadaEn ? ` · sincronizada en ${duracion(item.sincronizadaEn - item.creadoEn)}` : ''}
                    {item.estado !== 'enviada' ? ` · esperando ${duracion(Date.now() - Number(item.creadoEn || 0))}` : ''}
                    {Number(item.intentos || 0) > 0 ? ` · ${item.intentos} reintento(s)` : ''}
                  </p>
                  {item.error && <p className={cn('mt-0.5 text-[11px]', item.estado === 'conflicto' ? 'text-bad' : 'text-mute')}>{item.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.estado !== 'enviada' && (
                    <>
                      <button
                        type="button"
                        onClick={async () => { await reintentarVenta(item.id); refrescar() }}
                        className="rounded-lg border border-ink-500 px-2.5 py-1 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
                      >
                        Reintentar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescartar(item)}
                        className="rounded-lg p-1.5 text-mute transition hover:bg-bad/10 hover:text-bad"
                        title="Descartar venta"
                        aria-label={`Descartar la venta de ${item.resumen?.cliente || 'sin cliente'}`}
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!items.length && <EmptyState compact icon="box" title="No hay ventas sin conexión." />}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(descartar)}
        onCancel={() => setDescartar(null)}
        onConfirm={confirmarDescarte}
        title="Descartar venta sin conexión"
        description={`Se quita de la cola la venta de ${descartar?.resumen?.cliente || 'sin cliente'} por ${gs(descartar?.resumen?.total || 0)}. Si no se llegó a registrar en el servidor, no se puede recuperar.`}
        confirmLabel="Descartar"
        variant="danger"
        busy={busy}
      />
    </Modal>
  )
}
