import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Card, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { sistemaDemo } from '@/lib/demo/sistema.js'
import { fechaHora as fmt } from '@/utils/fecha'
import ColaImpresionEmpresa from './ColaImpresionEmpresa'

const ITEMS = [
  ['puentes', 'Puentes', 'send'],
  ['impresoras', 'Impresoras', 'printer'],
  ['trabajos', 'Cola remota', 'clock'],
]

function resumenEstado(sync) {
  if (!sync) return null
  return {
    puentes: `${sync.puentes?.activos || 0} en línea de ${sync.puentes?.total || 0}`,
    impresoras: `${sync.impresoras?.enLinea || 0} en línea de ${sync.impresoras?.total || 0}`,
    trabajos: `${sync.trabajos?.pendientes || 0} pendientes · ${sync.trabajos?.fallidos || 0} fallidos`,
  }
}

// Estado de impresión: centraliza el estado global que antes solo se veía
// dentro de Sistema; la gestión detallada sigue en los paneles de esta sección.
export default function EstadoImpresion() {
  const { esDemo } = useSesion()
  const [sync, setSync] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const datos = esDemo ? sistemaDemo().sincronizacion : await api.get('/api/system/sync-status')
      setSync(datos)
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar el estado de impresión.')
    } finally {
      setCargando(false)
    }
  }, [esDemo])

  useEffect(() => { cargar() }, [cargar])
  const resumen = resumenEstado(sync)

  return (
    <div className="space-y-4" data-testid="impresoras-sincronizacion">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><Icon name="pulse" className="h-4 w-4 text-mute" />Estado de impresión</h2>
            <p className="mt-1 text-sm text-mute">Puentes, impresoras registradas y trabajos remotos de toda la empresa.</p>
          </div>
          <Button type="button" variant="outline" onClick={cargar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
        </div>
        {error && <Aviso tono="error" role="alert">{error}</Aviso>}
        {cargando && !sync ? (
          <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : resumen && (
          <div className="grid gap-3 sm:grid-cols-3">
            {ITEMS.map(([id, titulo, icono]) => (
              <div key={id} data-testid={`impresoras-sync-${id}`} className="min-w-0 rounded-xl border border-ink-600 p-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-mute"><Icon name={icono} className="h-4 w-4" />{titulo}</p>
                <p className="mt-2 break-words text-sm font-semibold text-fore">{resumen[id]}</p>
              </div>
            ))}
          </div>
        )}
        {sync?.generadoEn && <p className="text-xs text-mute">Última actualización: {fmt(sync.generadoEn)}</p>}
      </Card>
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Administrar impresión</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link className="toque-44 rounded-lg border border-ink-600 p-3 text-sm font-medium hover:bg-ink-700" to="/configuracion/dispositivos?panel=impresoras">Configurar impresoras</Link>
          <Link className="toque-44 rounded-lg border border-ink-600 p-3 text-sm font-medium hover:bg-ink-700" to="/configuracion/dispositivos?panel=puentes">Gestionar puentes</Link>
          <Link className="toque-44 rounded-lg border border-ink-600 p-3 text-sm font-medium hover:bg-ink-700" to="/configuracion/dispositivos?panel=cola">Abrir cola e historial</Link>
        </div>
      </Card>
      <ColaImpresionEmpresa />
    </div>
  )
}
