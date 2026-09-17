import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, EmptyState, Eyebrow, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { configImpresora, estadoAgente } from '@/lib/printing/agent'

// Estado de impresión: qué computadora es el puente, dónde está la impresora,
// desde qué equipo se imprimió y quiénes tienen sesión abierta.
const fmt = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const hace = (valor) => {
  if (!valor) return 'sin registro'
  const minutos = Math.floor((Date.now() - new Date(valor).getTime()) / 60000)
  if (minutos < 1) return 'ahora'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

export default function EstadoImpresion() {
  const toast = useToast()
  const { sesion } = useSesion()
  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [sesiones, setSesiones] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const consultar = useCallback(async () => {
    const config = configImpresora()
    const agente = await estadoAgente({ forzar: true })
    setEstado(agente)
    if (agente.disponible) {
      try {
        const respuesta = await fetch(`${config.url}/historial?limite=20`, {
          headers: config.token ? { 'x-mobos-print-token': config.token } : {},
        })
        const datos = await respuesta.json()
        setHistorial(datos?.historial || [])
        setError('')
      } catch { setError('No se pudo leer la actividad de impresión.') }
    } else {
      setHistorial([])
    }
    try {
      const cuenta = await api.get('/api/account')
      setSesiones(cuenta?.sessions || [])
    } catch { setSesiones([]) }
    setCargando(false)
  }, [])

  useEffect(() => {
    consultar()
    const intervalo = setInterval(consultar, 20000)
    return () => clearInterval(intervalo)
  }, [consultar])

  const config = configImpresora()
  const esLocal = config.url.includes('127.0.0.1') || config.url.includes('localhost')
  const destino = estado?.impresora || config.impresora || ''
  const porUsb = destino.startsWith('usb:')

  async function limpiar() {
    const config = configImpresora()
    try {
      const respuesta = await fetch(`${config.url}/jobs/clear`, { method: 'POST', headers: config.token ? { 'x-mobos-print-token': config.token } : {} })
      const datos = await respuesta.json()
      toast.success('Cola limpia', `${datos?.limpiados || 0} trabajos fallidos quitados.`)
      consultar()
    } catch { toast.error('No se pudo limpiar la cola') }
  }

  const sesionActiva = (s) => Date.now() - new Date(s.lastSeenAt || 0).getTime() < 15 * 60 * 1000

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Eyebrow>Impresión</Eyebrow>
            <h2 className="mt-1 font-semibold">Estado de impresión</h2>
            <p className="mt-1 text-sm text-mute">Se actualiza solo cada 20 segundos. El puente es la computadora que tiene el agente y la impresora conectada.</p>
          </div>
          <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
        </div>

        {cargando && !estado ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Computadora puente</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <span className={`h-2 w-2 rounded-full ${estado?.disponible ? 'bg-ok' : 'bg-bad'}`} />
                {estado?.disponible ? 'Encendida' : 'Apagada o sin agente'}
              </p>
              <p className="mt-1 truncate text-xs text-mute" title={config.url}>{esLocal ? 'Esta computadora' : config.url}</p>
              {estado?.disponible && <p className="mt-1 text-xs text-mute">Versión {estado.version || '—'} · {estado.host === '0.0.0.0' ? 'acepta la red' : 'solo local'}</p>}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Impresora</p>
              <p className="mt-1 truncate text-sm font-semibold" title={destino || undefined}>{destino || 'Sin configurar'}</p>
              <p className="mt-1 text-xs text-mute">
                {porUsb ? 'USB (cola de la computadora puente)' : destino ? 'LAN' : '—'}
                {estado?.disponible ? ` · ${estado.impresoraOk ? 'responde' : 'no responde'}` : ''}
              </p>
              {estado?.disponible && <p className="mt-1 text-xs text-mute">{estado.ancho || 58} mm · {estado.copias || 1} copia(s)</p>}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Mi equipo</p>
              <p className="mt-1 truncate text-sm font-semibold">{estado?.cliente || '—'}</p>
              <p className="mt-1 text-xs text-mute">{sesion?.correo || sesion?.nombre || 'Sin sesión'} · {sesion?.rol || '—'}</p>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Cola</p>
              <p className="mt-1 text-sm font-semibold">{estado?.cola?.pendientes || 0} pendientes · {estado?.cola?.fallidos || 0} fallidos</p>
              {(estado?.cola?.fallidos || 0) > 0 && <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-bad" onClick={limpiar}>Limpiar fallidos</Button>}
            </div>
          </div>
        )}
        {!estado?.disponible && !cargando && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
            No se encontró el agente en <b className="text-fore">{config.url}</b>. En el puente, revisá que el servicio esté corriendo; en las demás computadoras, que la <b className="text-fore">dirección del agente</b> apunte a la IP del puente (Configuración → Impresoras).
          </p>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Actividad de impresión</h2>
          <p className="mt-1 text-sm text-mute">Últimos trabajos que pasaron por el agente, con el equipo desde el que se imprimió.</p>
        </div>
        {!historial.length ? (
          <EmptyState compact icon="receipt" title="Todavía no hay impresiones registradas." description="Cuando imprimas un comprobante o una etiqueta, queda acá." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Equipo</th>
                  <th className="px-2 py-2">Impresora</th>
                  <th className="px-2 py-2 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((fila, indice) => (
                  <tr key={`${fila.fecha}-${indice}`} className="border-b border-ink-600/50">
                    <td className="px-2 py-2 text-xs text-mute">{fmt(fila.fecha)}</td>
                    <td className="px-2 py-2 text-xs">{fila.cliente || '—'}</td>
                    <td className="px-2 py-2 truncate text-xs text-mute" title={fila.impresora}>{fila.impresora}</td>
                    <td className="px-2 py-2 text-right">
                      <Badge color={fila.resultado === 'impreso' ? 'green' : 'red'}>{fila.resultado}</Badge>
                      {fila.error && <span className="mt-1 block max-w-[16rem] truncate text-[10px] text-bad" title={fila.error}>{fila.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Equipos con acceso</h2>
          <p className="mt-1 text-sm text-mute">Sesiones de la empresa: en verde las que estuvieron activas en los últimos 15 minutos.</p>
        </div>
        {sesiones === null ? (
          <Skeleton className="h-16 w-full" />
        ) : !sesiones.length ? (
          <EmptyState compact icon="users" title="No hay sesiones registradas." />
        ) : (
          <div className="space-y-2">
            {sesiones.map((activa) => (
              <div key={activa.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{activa.user?.name || 'Acceso de empresa'}</p>
                  <p className="mt-0.5 truncate text-xs text-mute">{activa.user?.role || activa.level} · {activa.deviceId || 'Dispositivo no identificado'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-mute">{hace(activa.lastSeenAt)}</span>
                  <Badge color={sesionActiva(activa) ? 'green' : 'slate'}>{sesionActiva(activa) ? 'Activa' : 'Sin sesión reciente'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
