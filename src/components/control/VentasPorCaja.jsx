import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { listVentas } from '@/lib/storage'
import { construirDemoCajas, getDemoCash } from '@/lib/demoCash'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CLAVES_FIN, rangoDePreset } from '@/lib/finUltimoUsado'
import { gs } from '@/utils/calculos'
import { fechaCorta, fechaHoraCorta } from '@/utils/fecha'
import { CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import RangoFechas, { PRESETS, rangoDeParams } from '@/components/shared/RangoFechas'
import { Aviso, Badge, Card, EmptyState, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

// #148 §18: ventas por caja — corte por sesión del período con lo que pasó por
// cada turno (pedidos y ventas del responsable, efectivo cobrado, esperado,
// contado y diferencia). Complementa la auditoría de efectivo con la mirada
// por caja que pedía la spec.
const GRID = 'grid min-w-[54rem] grid-cols-[minmax(0,1.4fr)_6.5rem_5rem_7.5rem_7.5rem_7.5rem_7.5rem_6.5rem] items-center gap-x-2'
const COLUMNAS = ['Caja', 'Estado', 'Pedidos', 'Ventas', 'Efectivo', 'Esperado', 'Contado', 'Diferencia']
const treintaDias = () => ({ ...PRESETS.find((preset) => preset.id === '30d').calc(), preset: '30d' })

export default function VentasPorCaja() {
  const { esDemo, sucursal } = useSesion()
  const [presetRecordado, recordarPreset] = useUltimoUsado(CLAVES_FIN.cajaRango, '30d', { valido: (valor) => PRESETS.some((preset) => preset.id === valor) })
  const [rango, setRango] = useState(() => rangoDeParams(new URLSearchParams(), () => rangoDePreset(PRESETS, presetRecordado, treintaDias)))
  const [sesiones, setSesiones] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cambiarRango = useCallback((next) => {
    setRango(next)
    if (next?.preset) recordarPreset(next.preset)
  }, [recordarPreset])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      if (esDemo) {
        setSesiones(construirDemoCajas({ cash: getDemoCash(), ventas: listVentas() }))
        return
      }
      const params = new URLSearchParams({ sesiones: '1', from: rango.desde, to: rango.hasta })
      if (sucursal?.id) params.set('branchId', sucursal.id)
      const data = await api.get(`/api/cash?${params}`)
      setSesiones(Array.isArray(data?.sesiones) ? data.sesiones : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar el corte por caja.')
      setSesiones([])
    } finally {
      setCargando(false)
    }
  }, [esDemo, rango.desde, rango.hasta, sucursal?.id])

  useEffect(() => { cargar() }, [cargar])

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-bold">Ventas por caja</h2>
          <p className="mt-1 text-sm text-mute">Corte por sesión: los pedidos del responsable, el efectivo cobrado y cómo cerró cada caja.</p>
        </div>
        <RangoFechas valor={rango} onChange={cambiarRango} />
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {cargando && <div className="space-y-2" role="status">{[0, 1, 2].map((fila) => <Skeleton key={fila} className="h-10" />)}</div>}
      {!cargando && !sesiones?.length && (
        <EmptyState compact icon="wallet" title="Sin cajas en el período" description="Cuando abras un turno de caja va a aparecer acá con su corte." />
      )}
      {!cargando && sesiones?.length > 0 && (
        <div className="overflow-x-auto" data-testid="ventas-por-caja-tabla">
          <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
            {COLUMNAS.map((columna, indice) => (
              <span key={columna} className={cn(CELDA_ENCABEZADO, indice >= 2 && 'text-right')}>{columna}</span>
            ))}
          </div>
          <div className="space-y-1">
            {sesiones.map((sesion) => {
              const abierta = sesion.status === 'OPEN'
              const diferencia = sesion.diferenciaPyg
              return (
                <div key={sesion.id} data-testid="ventas-por-caja-fila" className={cn(GRID, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2')}>
                  <span className="min-w-0">
                    <b className={cn('block', CELDA_IDENTIDAD)}>{sesion.openedByName || 'Sin responsable'}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-mute">
                      {abierta ? `Abierta ${fechaHoraCorta(sesion.openedAt)}` : `${fechaCorta(sesion.openedAt)} · cerró ${fechaHoraCorta(sesion.closedAt)}`}
                      {sesion.notes ? ` · ${sesion.notes}` : ''}
                    </span>
                  </span>
                  <span className="justify-self-start"><Badge color={abierta ? 'green' : 'slate'}>{abierta ? 'Abierta' : 'Cerrada'}</Badge></span>
                  <span className="truncate text-right text-xs tabular-nums text-mute">{sesion.pedidos}</span>
                  <span className="truncate text-right text-xs tabular-nums text-mute">{gs(sesion.ventasPyg)}</span>
                  <span className="truncate text-right text-xs tabular-nums text-fore">{gs(sesion.efectivoPyg)}</span>
                  <span className="truncate text-right text-xs tabular-nums text-mute">{gs(sesion.esperadoPyg)}</span>
                  <span className="truncate text-right text-xs tabular-nums text-mute">{sesion.contadoPyg === null ? '—' : gs(sesion.contadoPyg)}</span>
                  <span className={cn('truncate text-right text-xs font-semibold tabular-nums', diferencia === null ? 'text-mute' : diferencia === 0 ? 'text-ok' : 'text-bad')}>
                    {diferencia === null ? '—' : gs(diferencia)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!cargando && !esDemo && sesiones?.length > 0 && (
        <p className="text-[11px] text-mute">Las cajas cerradas conservan el esperado auditado al cierre; la abierta se calcula en vivo.</p>
      )}
    </Card>
  )
}
