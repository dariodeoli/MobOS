import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Badge, Button, Card, Dot, Nota, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { useSesion } from '@/lib/sesion'
import { sistemaDemo } from '@/lib/demo/sistema.js'
import { APP_VERSION } from '@/lib/brand'
import { fechaHora as fmt } from '@/utils/fecha'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

// Estado del sistema: la misma lista de chequeos que se corre antes de entregar
// una versión, dentro de la app, para ver de un vistazo qué configuración falta.
const BADGE = { ok: 'green', atencion: 'orange', error: 'red' }
const TEXTO = { ok: 'En orden', atencion: 'A revisar', error: 'Con error' }

const COLOR_TONO = { ok: 'green', bad: 'red', warn: 'orange', slate: 'slate' }

// Tarjeta compacta del monitor: un tono, un dato principal y el detalle.
function TarjetaSync({ titulo, tono = 'slate', principal, detalle }) {
  return (
    <div className="rounded-xl border border-ink-600 p-3">
      <p className="text-xs uppercase tracking-wider text-mute">{titulo}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
        <Dot color={COLOR_TONO[tono] || 'slate'} />
        <span className="break-words">{principal}</span>
      </p>
      {detalle && <p className="mt-1 text-xs text-mute">{detalle}</p>}
    </div>
  )
}

export default function EstadoSistema() {
  const toast = useToast()
  const { esDemo } = useSesion()
  const [datos, setDatos] = useState(null)
  const [sincronizacion, setSincronizacion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [errorSync, setErrorSync] = useState('')

  const consultar = useCallback(async () => {
    // #324: en demo el estado sale de la fixture local y no consulta servicios reales.
    if (esDemo) {
      const fixture = sistemaDemo()
      setDatos(fixture.checks)
      setSincronizacion(fixture.sincronizacion)
      setError(''); setErrorSync('')
      setCargando(false)
      return
    }
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
    setCargando(false)
  }, [esDemo])

  useEffect(() => { consultar() }, [consultar])

  const chequeos = datos?.checks || []
  const resumen = chequeos.reduce((acumulado, chequeo) => {
    acumulado[chequeo.estado] = (acumulado[chequeo.estado] || 0) + 1
    return acumulado
  }, {})

  const tonoEmails = !sincronizacion ? 'slate' : sincronizacion.emails.fallidos > 0 ? 'bad' : sincronizacion.emails.pendientes > 0 ? 'warn' : 'slate'

  async function copiar() {
    const lineas = [
      `Estado del sistema · ${APP_VERSION} · ${fmt(datos?.checkedAt)}`,
      `${resumen.ok || 0} en orden · ${resumen.atencion || 0} a revisar · ${resumen.error || 0} con error`,
      '',
      ...chequeos.map((chequeo) => `[${TEXTO[chequeo.estado]}] ${chequeo.label}: ${chequeo.detalle}`),
    ]
    if (await copiarAlPortapapeles(lineas.join('\n'))) {
      toast.success('Informe copiado', 'Pegalo en el reporte o en el chat de soporte.')
    } else {
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
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={copiar} disabled={cargando} title={cargando ? 'Se habilita al terminar la comprobación en curso.' : 'Copia el informe de estado para soporte.'}><Icon name="copy" className="h-3.5 w-3.5" />Copiar informe</Button>
              <Button type="button" variant="outline" onClick={consultar} disabled={cargando} title={cargando ? 'Se habilita al terminar la comprobación en curso.' : 'Vuelve a comprobar el estado del sistema.'}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
            </div>
            {cargando && <p role="status" data-testid="sistema-comprobando" className="text-xs text-mute">Comprobando… los botones se habilitan al terminar.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <Badge color="slate">{APP_VERSION}</Badge>
          <span data-testid="sistema-resumen-chequeos">{chequeos.length} {chequeos.length === 1 ? 'chequeo' : 'chequeos'} · {datos?.checkedAt ? fmt(datos.checkedAt) : cargando ? 'comprobando…' : 'sin datos'}</span>
          {resumen.atencion > 0 && <Badge color="orange">{resumen.atencion} a revisar</Badge>}
          {resumen.error > 0 && <Badge color="red">{resumen.error} con error</Badge>}
        </div>

        {cargando && !datos ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : (
          <div className="divide-y divide-ink-600/60">
            {chequeos.map((chequeo) => (
              <div key={chequeo.id} data-testid="sistema-chequeo" className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{chequeo.label}</p>
                  <p className="mt-0.5 break-words text-xs text-mute">{chequeo.detalle}</p>
                </div>
                <Badge color={BADGE[chequeo.estado] || 'slate'}>{TEXTO[chequeo.estado] || chequeo.estado}</Badge>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {(resumen.atencion > 0 || resumen.error > 0) && (
          <Nota>
            Los puntos “a revisar” corresponden a servicios del servidor o a este equipo. La gestión de impresoras y su agente está en <b className="text-fore">Impresoras</b>; el resto de los servicios se completa en <b className="text-fore">Configuración</b>.
          </Nota>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="pulse" className="h-4 w-4 text-mute" />Sincronización</h3>
            <p className="mt-1 text-sm text-mute">Correo saliente, webhooks de AEX, errores recientes y reservas vencidas. El estado de puentes, impresoras y cola remota está centralizado en Impresoras.</p>
            <p className="mt-1 text-xs text-mute" data-testid="monitoreo-vs-impresoras">
              Para <b className="text-fore">ver estado y sincronización, agregar, probar o formatear</b> impresoras, abrí <Link to="/configuracion/dispositivos?panel=sincronizacion" className="toque-44 font-semibold text-fono-light underline underline-offset-2">Impresoras</Link>; acá se monitorean los servicios de la empresa.
            </p>
          </div>
          {sincronizacion && <span className="text-xs text-mute">Generado {fmt(sincronizacion.generadoEn)}</span>}
        </div>

        {cargando && !sincronizacion ? (
          <div className={cn('lg:grid-cols-2', GRILLA_DOS_COLUMNAS)}><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : !sincronizacion ? (
          errorSync && <p role="alert" className="text-sm text-bad">{errorSync}</p>
        ) : (
          <>
            <div className={cn('lg:grid-cols-2', GRILLA_DOS_COLUMNAS)}>
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
                {/* #301: sin credenciales, la lista vacía no puede leerse como
                    «todo en orden». */}
                {!sincronizacion.aex.configurado && (
                  <Aviso tono="warn" compact className="mt-2">Faltan las claves de AEX: no se pueden cotizar envíos ni generar guías.</Aviso>
                )}
                {sincronizacion.aex.configurado && !sincronizacion.aex.webhookToken && (
                  <p className="mt-2 text-[11px] text-mute">Sin token de webhook: el endpoint de AEX acepta cualquier origen.</p>
                )}
                {sincronizacion.aex.ultimos.length ? (
                  <ul className="mt-2 divide-y divide-ink-600/60">
                    {sincronizacion.aex.ultimos.map((evento) => (
                      <li key={evento.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-xs">
                        <span className="break-words font-medium" title={evento.guia}>{evento.guia}</span>
                        <span className="text-mute">{evento.estado || evento.tipoEvento || 'Evento'} · {fmt(evento.recibidoEn)}</span>
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
                  <Badge color={sincronizacion.errores.recientes > 0 ? 'red' : 'slate'} data-testid="errores-recientes">{sincronizacion.errores.recientes}</Badge>
                </div>
                {sincronizacion.errores.ultimos.length ? (
                  <ul className="mt-2 divide-y divide-ink-600/60">
                    {sincronizacion.errores.ultimos.map((reporte) => (
                      <li key={reporte.id} className="py-1.5 text-xs">
                        <p className="break-words font-medium" title={reporte.message}>{reporte.message}</p>
                        <p className="mt-0.5 break-words text-mute">{reporte.kind === 'rejection' ? 'Promesa rechazada' : 'Error no manejado'} · {fmt(reporte.createdAt)}{reporte.url ? ` · ${reporte.url}` : ''}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mute">Sin errores en las últimas {sincronizacion.errores.ventanaHoras} horas.</p>
                )}
                {sincronizacion.errores.recientes > sincronizacion.errores.ultimos.length && (
                  <p className="mt-2 text-xs text-mute" data-testid="errores-y-mas">y {sincronizacion.errores.recientes - sincronizacion.errores.ultimos.length} más en las últimas {sincronizacion.errores.ventanaHoras} h.</p>
                )}
              </div>
            </div>

            {(sincronizacion.emails.fallidos > 0 || sincronizacion.reservas.vencidasSinLiberar > 0) && (
              <div className="space-y-2">
                {sincronizacion.emails.fallidos > 0 && (
                  <Aviso tono="error" className="p-3 rounded-xl text-mute">
                    Hay <b className="text-fore">{sincronizacion.emails.fallidos}</b> correo(s) que no salieron: revisá la configuración del correo.
                  </Aviso>
                )}
                {sincronizacion.reservas.vencidasSinLiberar > 0 && (
                  <Nota>
                    Hay <b className="text-fore">{sincronizacion.reservas.vencidasSinLiberar}</b> reserva(s) vencidas sin liberar: revisalas en <b className="text-fore">Inventario → Reservas</b>.
                  </Nota>
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
