import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { listVentas } from '@/lib/storage'
import { construirDemoCajas, getDemoCash } from '@/lib/demoCash'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CLAVES_FIN, rangoDePreset } from '@/lib/finUltimoUsado'
import { gs } from '@/utils/calculos'
import { fechaCorta, fechaHoraCorta } from '@/utils/fecha'
import { CELDA_IDENTIDAD } from '@/components/shared/tabla'
import RangoFechas, { PRESETS, rangoDeParams } from '@/components/shared/RangoFechas'
import { Aviso, Card, EmptyState, Skeleton } from '@/components/ui'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import StatusChip from '@/components/shared/StatusChip'
import { cn } from '@/lib/utils'
import './finanzasTactil.css'

// #148 §18: ventas por caja — corte por sesión del período con lo que pasó por
// cada turno (pedidos y ventas del responsable, efectivo cobrado, esperado,
// contado y diferencia). Complementa la auditoría de efectivo con la mirada
// por caja que pedía la spec.
const claseDiferencia = (diferencia) => cn('font-semibold tabular-nums', diferencia === null ? 'text-mute' : diferencia === 0 ? 'text-ok' : 'text-bad')
const textoDiferencia = (diferencia) => (diferencia === null ? '—' : gs(diferencia))
const textoContado = (sesion) => (sesion.contadoPyg === null ? '—' : gs(sesion.contadoPyg))
const detalleDe = (sesion) => `${sesion.status === 'OPEN' ? `Abierta ${fechaHoraCorta(sesion.openedAt)}` : `${fechaCorta(sesion.openedAt)} · cerró ${fechaHoraCorta(sesion.closedAt)}`}${sesion.notes ? ` · ${sesion.notes}` : ''}`

function Identidad({ sesion }) {
  return (
    <span className="block min-w-0">
      <b className={cn('block', CELDA_IDENTIDAD)} title={sesion.openedByName || 'Sin responsable'}>{sesion.openedByName || 'Sin responsable'}</b>
      <span className="mt-0.5 block truncate text-[11px] text-mute" title={detalleDe(sesion)}>{detalleDe(sesion)}</span>
    </span>
  )
}
const chipDe = (sesion) => <StatusChip dominio="caja" estado={sesion.status === 'OPEN' ? 'OPEN' : 'CLOSED'} />
const treintaDias = () => ({ ...PRESETS.find((preset) => preset.id === '30d').calc(), preset: '30d' })

export default function VentasPorCaja() {
  const { esDemo, sucursal } = useSesion()
  const [presetRecordado, recordarPreset] = useUltimoUsado(CLAVES_FIN.cajaRango, '30d', { valido: (valor) => PRESETS.some((preset) => preset.id === valor) })
  const [rango, setRango] = useState(() => rangoDeParams(new URLSearchParams(), () => rangoDePreset(PRESETS, presetRecordado, treintaDias)))
  const [sesiones, setSesiones] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const lista = usePaginaLista(sesiones || [], { tamano: { compacto: 5, amplio: 15 } })

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
    <Card className="finanzas-tactil space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-bold">Ventas por caja</h2>
          <p className="mt-1 text-sm text-mute">Corte por sesión: los pedidos del responsable, el efectivo cobrado y cómo cerró cada caja.</p>
        </div>
        {/* #249 H3: el disparador del período llega a 44 px en mobile; en
            desktop conserva los 36 px (el resto de las pantallas del dominio
            usa el mismo criterio). */}
        <RangoFechas valor={rango} onChange={cambiarRango} className="[&>button]:h-11 md:[&>button]:h-9" />
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {cargando && <div className="space-y-2" role="status">{[0, 1, 2].map((fila) => <Skeleton key={fila} className="h-10" />)}</div>}
      {!cargando && !sesiones?.length && (
        <EmptyState compact icon="wallet" title="Sin cajas en el período" description="Cuando abras un turno de caja va a aparecer acá con su corte." />
      )}
      {!cargando && sesiones?.length > 0 && (
        <ListaDensa
          lista={lista}
          testId="ventas-por-caja-tabla"
          etiquetaTabla="Ventas por caja"
          etiquetaPie="Páginas de cajas"
          unidad="cajas"
          desde="xl"
          obtenerClave={(sesion) => sesion.id}
          atributosFila={() => ({ 'data-testid': 'ventas-por-caja-fila' })}
          columns={[
            { key: 'caja', header: 'Caja', ancho: 'minmax(0,1.4fr)', cell: (sesion) => <Identidad sesion={sesion} /> },
            { key: 'estado', header: 'Estado', ancho: '5.5rem', cell: chipDe },
            { key: 'pedidos', header: 'Pedidos', ancho: '4rem', align: 'right', className: 'text-xs text-mute', cell: (sesion) => sesion.pedidos },
            { key: 'ventas', dinero: true, header: 'Ventas', ancho: '8.5rem', align: 'right', className: 'text-xs text-mute', cell: (sesion) => gs(sesion.ventasPyg) },
            { key: 'efectivo', dinero: true, header: 'Efectivo', ancho: '8.5rem', align: 'right', className: 'text-xs text-fore', cell: (sesion) => gs(sesion.efectivoPyg) },
            { key: 'esperado', dinero: true, header: 'Esperado', ancho: '8.5rem', align: 'right', className: 'text-xs text-mute', cell: (sesion) => gs(sesion.esperadoPyg) },
            { key: 'contado', dinero: true, header: 'Contado', ancho: '8.5rem', align: 'right', className: 'text-xs text-mute', cell: textoContado },
            { key: 'diferencia', dinero: true, header: 'Diferencia', ancho: '8.5rem', align: 'right', className: 'text-xs', cell: (sesion) => <span className={claseDiferencia(sesion.diferenciaPyg)}>{textoDiferencia(sesion.diferenciaPyg)}</span> },
          ]}
          renderCard={(sesion) => (
            <div className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><Identidad sesion={sesion} /></div>
                {chipDe(sesion)}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                {[
                  ['Ventas', gs(sesion.ventasPyg), 'text-fore'],
                  ['Efectivo', gs(sesion.efectivoPyg), 'text-fore'],
                  ['Esperado', gs(sesion.esperadoPyg), 'text-mute'],
                  ['Contado', textoContado(sesion), 'text-mute'],
                  ['Diferencia', textoDiferencia(sesion.diferenciaPyg), claseDiferencia(sesion.diferenciaPyg)],
                  ['Pedidos', sesion.pedidos, 'text-mute'],
                ].map(([rotulo, valor, tono]) => (
                  <div key={rotulo} className="min-w-0">
                    <dt className="text-[11px] text-mute">{rotulo}</dt>
                    <dd className={cn('break-words tabular-nums', tono)}>{valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        />
      )}
      {!cargando && !esDemo && sesiones?.length > 0 && (
        <p className="text-[11px] text-mute">Las cajas cerradas conservan el esperado auditado al cierre; la abierta se calcula en vivo.</p>
      )}
    </Card>
  )
}
