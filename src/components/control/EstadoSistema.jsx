import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Dot, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { APP_VERSION } from '@/lib/brand'
import { configImpresora, estadoAgente } from '@/lib/printing/agent'

// Estado del sistema: la misma lista de chequeos que se corre antes de entregar
// una versión, dentro de la app, para ver de un vistazo qué configuración falta.
const BADGE = { ok: 'green', atencion: 'orange', error: 'red' }
const TEXTO = { ok: 'En orden', atencion: 'A revisar', error: 'Con error' }

const fmt = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

const COLOR_TONO = { ok: 'green', bad: 'red', warn: 'orange', slate: 'slate' }

// Tarjeta compacta del monitor: un tono, un dato principal y el detalle.
function TarjetaSync({ titulo, tono = 'slate', principal, detalle }) {
  return (
    <div className="rounded-xl border border-ink-600 p-3">
      <p className="text-xs uppercase tracking-wider text-mute">{titulo}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
        <Dot color={COLOR_TONO[tono] || 'slate'} />
        <span className="truncate">{principal}</span>
      </p>
      {detalle && <p className="mt-1 text-xs text-mute">{detalle}</p>}
    </div>
  )
}

export default function EstadoSistema() {
  const toast = useToast()
  const [datos, setDatos] = useState(null)
  const [sincronizacion, setSincronizacion] = useState(null)
  const [impresion, setImpresion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [errorSync, setErrorSync] = useState('')

  const consultar = useCallback(async () => {
    const config = configImpresora()
    const [chequeos, sincro] = await Promise.allSettled([
      api.get('/api/system/checks'),
      api.get('/api/system/sync-status'),
    ])
    if (chequeos.status === 'fulfilled') {
      setDatos(chequeos.value)
      setError('')
    } else {
      setError(chequeos.reason?.message || 'No se pudo leer el estado del sistema.')
    }
    if (sincro.status === 'fulfilled') {
      setSincronizacion(sincro.value)
      setErrorSync('')
    } else {
      setErrorSync(sincro.reason?.message || 'No se pudo leer la sincronización.')
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

  const sync = sincronizacion
  const tonoPuentes = !sync || sync.puentes.total === 0 ? 'slate' : sync.puentes.activos > 0 ? 'ok' : 'bad'
  const tonoImpresoras = !sync || sync.impresoras.total === 0
    ? 'slate'
    : sync.impresoras.sinSenal > 0
      ? (sync.impresoras.enLinea > 0 ? 'warn' : 'bad')
      : (sync.impresoras.enLinea > 0 ? 'ok' : 'slate')
  const tonoTrabajos = !sync ? 'slate' : sync.trabajos.fallidos > 0 ? 'bad' : sync.trabajos.pendientes > 0 ? 'warn' : sync.trabajos.ultimoExitoAt ? 'ok' : 'slate'
  const tonoEmails = !sync ? 'slate' : sync.emails.fallidos > 0 ? 'bad' : sync.emails.pendientes > 0 ? 'warn' : 'slate'
  const detalleImpresoras = !sync || sync.impresoras.total === 0
    ? 'No hay impresoras activas en la empresa'
    : [
        sync.impresoras.sinSenal > 0 ? `${sync.impresoras.sinSenal} sin señal` : '',
        sync.impresoras.sinPuente > 0 ? `${sync.impresoras.sinPuente} sin puente (solo locales)` : '',
      ].filter(Boolean).join(' · ') || 'Todas responden por su puente'

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

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="pulse" className="h-4 w-4 text-mute" />Sincronización</h3>
            <p className="mt-1 text-sm text-mute">Puentes e impresoras, cola de impresión, correo saliente, webhooks de AEX, errores recientes y reservas vencidas. Datos reales de la empresa; se refresca con «Actualizar».</p>
          </div>
          {sincronizacion && <span className="text-xs text-mute">Generado {fmt(sincronizacion.generadoEn)}</span>}
        </div>

        {cargando && !sincronizacion ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : !sincronizacion ? (
          errorSync && <p role="alert" className="text-sm text-bad">{errorSync}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TarjetaSync
                titulo="Puentes"
                tono={tonoPuentes}
                principal={sincronizacion.puentes.total === 0 ? 'Sin puentes vinculados' : `${sincronizacion.puentes.activos} en línea de ${sincronizacion.puentes.total}`}
                detalle={sincronizacion.puentes.total === 0 ? 'Vinculá una computadora para imprimir en remoto' : `Última señal ${fmt(sincronizacion.puentes.ultimaSenal)}`}
              />
              <TarjetaSync
                titulo="Impresoras"
                tono={tonoImpresoras}
                principal={sincronizacion.impresoras.total === 0 ? 'Sin impresoras activas' : `${sincronizacion.impresoras.enLinea} en línea de ${sincronizacion.impresoras.total}`}
                detalle={detalleImpresoras}
              />
              <TarjetaSync
                titulo="Cola de impresión"
                tono={tonoTrabajos}
                principal={`${sincronizacion.trabajos.pendientes} pendientes · ${sincronizacion.trabajos.fallidos} fallidos`}
                detalle={sincronizacion.trabajos.ultimoExitoAt ? `Último confirmado ${fmt(sincronizacion.trabajos.ultimoExitoAt)}` : 'Sin trabajos confirmados todavía'}
              />
              <TarjetaSync
                titulo="Correo saliente"
                tono={tonoEmails}
                principal={`${sincronizacion.emails.pendientes} en cola · ${sincronizacion.emails.fallidos} fallidos`}
                detalle="Verificaciones, invitaciones y avisos de la empresa"
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-ink-600 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-mute">Últimos webhooks de AEX</p>
                  <span className="text-xs text-mute">{sincronizacion.aex.ultimoEventoAt ? `Último ${fmt(sincronizacion.aex.ultimoEventoAt)}` : 'Sin eventos'}</span>
                </div>
                {sincronizacion.aex.ultimos.length ? (
                  <ul className="mt-2 divide-y divide-ink-600/60">
                    {sincronizacion.aex.ultimos.map((evento) => (
                      <li key={evento.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-xs">
                        <span className="truncate font-medium" title={evento.guia}>{evento.guia}</span>
                        <span className="text-mute">{evento.estado || evento.tipoEvento || 'Evento'} · {fmt(evento.fechaEvento || evento.recibidoEn)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mute">Todavía no llegó ningún webhook de AEX.</p>
                )}
              </div>
              <div className="rounded-xl border border-ink-600 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-mute">Errores recientes ({sincronizacion.errores.ventanaHoras} h)</p>
                  <Badge color={sincronizacion.errores.recientes > 0 ? 'red' : 'slate'}>{sincronizacion.errores.recientes}</Badge>
                </div>
                {sincronizacion.errores.ultimos.length ? (
                  <ul className="mt-2 divide-y divide-ink-600/60">
                    {sincronizacion.errores.ultimos.map((reporte) => (
                      <li key={reporte.id} className="py-1.5 text-xs">
                        <p className="truncate font-medium" title={reporte.message}>{reporte.message}</p>
                        <p className="mt-0.5 truncate text-mute">{reporte.kind === 'rejection' ? 'Promesa rechazada' : 'Error no manejado'} · {fmt(reporte.createdAt)}{reporte.url ? ` · ${reporte.url}` : ''}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mute">Sin errores en las últimas {sincronizacion.errores.ventanaHoras} horas.</p>
                )}
              </div>
            </div>

            {(sincronizacion.trabajos.fallidos > 0 || sincronizacion.emails.fallidos > 0 || sincronizacion.reservas.vencidasSinLiberar > 0) && (
              <div className="space-y-2">
                {sincronizacion.trabajos.fallidos > 0 && (
                  <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-mute">
                    Hay <b className="text-fore">{sincronizacion.trabajos.fallidos}</b> trabajo(s) de impresión fallidos: revisalos en <b className="text-fore">Impresoras</b>.
                  </p>
                )}
                {sincronizacion.emails.fallidos > 0 && (
                  <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-mute">
                    Hay <b className="text-fore">{sincronizacion.emails.fallidos}</b> correo(s) que no salieron: revisá la configuración del correo.
                  </p>
                )}
                {sincronizacion.reservas.vencidasSinLiberar > 0 && (
                  <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
                    Hay <b className="text-fore">{sincronizacion.reservas.vencidasSinLiberar}</b> reserva(s) vencidas sin liberar: revisalas en <b className="text-fore">Inventario → Reservas</b>.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {errorSync && sincronizacion && <p role="alert" className="text-sm text-bad">{errorSync}</p>}
      </Card>
    </div>
  )
}
