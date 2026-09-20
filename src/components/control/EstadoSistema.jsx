import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { APP_VERSION } from '@/lib/brand'
import { configImpresora, estadoAgente } from '@/lib/printing/agent'

// Estado del sistema: la misma lista de chequeos que se corre antes de entregar
// una versión, dentro de la app, para ver de un vistazo qué configuración falta.
const BADGE = { ok: 'green', atencion: 'orange', error: 'red' }
const TEXTO = { ok: 'En orden', atencion: 'A revisar', error: 'Con error' }

const fmt = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function EstadoSistema() {
  const toast = useToast()
  const [datos, setDatos] = useState(null)
  const [impresion, setImpresion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const consultar = useCallback(async () => {
    const config = configImpresora()
    try {
      const respuesta = await api.get('/api/system/checks')
      setDatos(respuesta)
      setError('')
    } catch (causa) {
      setError(causa?.message || 'No se pudo leer el estado del sistema.')
    }
    const agente = await estadoAgente({ forzar: true })
    setImpresion({ agente, url: config.url })
    setCargando(false)
  }, [])

  useEffect(() => { consultar() }, [consultar])

  const chequeos = [
    ...(datos?.checks || []),
    ...(impresion
      ? [{
          id: 'impresion',
          label: 'Impresión (este equipo)',
          estado: impresion.agente?.disponible ? 'ok' : 'atencion',
          detalle: impresion.agente?.disponible
            ? `${impresion.agente.impresora || 'sin destino'} · agente ${impresion.agente.version || '—'}`
            : `Sin agente en ${impresion.url}`,
        }]
      : []),
  ]
  const resumen = chequeos.reduce((acumulado, chequeo) => {
    acumulado[chequeo.estado] = (acumulado[chequeo.estado] || 0) + 1
    return acumulado
  }, {})

  async function copiar() {
    const lineas = [
      `Estado del sistema · ${APP_VERSION} · ${fmt(datos?.checkedAt)}`,
      `${resumen.ok || 0} en orden · ${resumen.atencion || 0} a revisar · ${resumen.error || 0} con error`,
      '',
      ...chequeos.map((chequeo) => `[${TEXTO[chequeo.estado]}] ${chequeo.label}: ${chequeo.detalle}`),
    ]
    try {
      await navigator.clipboard.writeText(lineas.join('\n'))
      toast.success('Informe copiado', 'Pegalo en el reporte o en el chat de soporte.')
    } catch {
      toast.error('No se pudo copiar el informe')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-mute">Los chequeos que se corren antes de publicar una versión, acá adentro. Si algo queda “a revisar”, la función asociada no está operativa.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copiar} disabled={cargando}><Icon name="copy" className="h-3.5 w-3.5" />Copiar informe</Button>
            <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <Badge color="slate">{APP_VERSION}</Badge>
          <span>{chequeos.length} chequeos · {fmt(datos?.checkedAt)}</span>
          {resumen.atencion > 0 && <Badge color="orange">{resumen.atencion} a revisar</Badge>}
          {resumen.error > 0 && <Badge color="red">{resumen.error} con error</Badge>}
        </div>

        {cargando && !datos ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : (
          <div className="divide-y divide-ink-600/60">
            {chequeos.map((chequeo) => (
              <div key={chequeo.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{chequeo.label}</p>
                  <p className="mt-0.5 truncate text-xs text-mute" title={chequeo.detalle}>{chequeo.detalle}</p>
                </div>
                <Badge color={BADGE[chequeo.estado] || 'slate'}>{TEXTO[chequeo.estado] || chequeo.estado}</Badge>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {(resumen.atencion > 0 || resumen.error > 0) && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
            Los puntos “a revisar” son configuraciones del servidor (credenciales, correo, cifrado) o de este equipo (agente de impresión). El dueño puede completarlos en <b className="text-fore">Configuración</b>; el resto de la app sigue funcionando sin ellos.
          </p>
        )}
      </Card>
    </div>
  )
}
