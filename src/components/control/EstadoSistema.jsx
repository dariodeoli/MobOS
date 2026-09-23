import { useCallback, useEffect, useState } from 'react'
import { Aviso, Badge, Button, Card, ConfirmDialog, Dot, Nota, Select, Skeleton, useToast } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { printingApi } from '@/lib/api/printing'
import { useSesion } from '@/lib/sesion'
import { APP_VERSION } from '@/lib/brand'
import { fechaHora as fmt } from '@/utils/fecha'
import { configImpresora, estadoAgente } from '@/lib/printing/agent'
import { colorTrabajo, etiquetaTrabajo } from '@/lib/printing/estadoImpresoras'
import { CELDA_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

// Estado del sistema: la misma lista de chequeos que se corre antes de entregar
// una versión, dentro de la app, para ver de un vistazo qué configuración falta.
const BADGE = { ok: 'green', atencion: 'orange', error: 'red' }
const TEXTO = { ok: 'En orden', atencion: 'A revisar', error: 'Con error' }

// Cola de impresión (#128): nombre en castellano de cada tipo de trabajo y
// estado honesto (pendiente no es impreso; cancelado no salió nunca).
const TIPO_TRABAJO = {
  comprobante: 'Comprobante',
  'nota-entrega': 'Nota de entrega',
  'recibo-interno': 'Recibo interno',
  proforma: 'Proforma',
  remision: 'Remisión',
  'cierre-caja': 'Cierre de caja',
  'resumen-dia': 'Resumen del día',
  'liquidacion-comision': 'Liquidación de comisión',
  'etiquetas-stock': 'Etiquetas de unidades',
  'etiqueta-ubicacion': 'Etiqueta de ubicación',
  'informe-dispositivo': 'Informe de dispositivo',
  'certificado-phonecheck': 'Certificado de inspección',
  'constancia-preparacion': 'Constancia de preparación',
  prueba: 'Ticket de prueba',
  'prueba-corta': 'Prueba de corte',
}
const tipoTrabajo = (kind) => TIPO_TRABAJO[kind] || String(kind || '').replace(/-/g, ' ') || 'Impresión'

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
  const { sesion, usuario } = useSesion()
  const [datos, setDatos] = useState(null)
  const [sincronizacion, setSincronizacion] = useState(null)
  const [impresion, setImpresion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [errorSync, setErrorSync] = useState('')
  // Cola de impresión remota: detalle y cancelación de lo que todavía no salió.
  const [trabajos, setTrabajos] = useState(null)
  const [errorCola, setErrorCola] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [filtroImpresora, setFiltroImpresora] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [cancelarPregunta, setCancelarPregunta] = useState(null)
  // Mismos permisos que el backend: solo administración o gerencia cancelan.
  const puedeCancelar = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN' || usuario?.role === 'GERENTE')

  const consultar = useCallback(async () => {
    const config = configImpresora()
    const [chequeos, sincro, cola] = await Promise.allSettled([
      api.get('/api/system/checks'),
      api.get('/api/system/sync-status'),
      printingApi.trabajos({ limit: 50 }),
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
    if (cola.status === 'fulfilled') {
      setTrabajos(cola.value?.jobs || [])
      setErrorCola('')
    } else {
      setErrorCola(cola.reason?.message || 'No se pudo leer la cola de impresión.')
    }
    const agente = await estadoAgente({ forzar: true })
    setImpresion({ agente, url: config.url })
    setCargando(false)
  }, [])

  useEffect(() => { consultar() }, [consultar])

  const pendientes = (trabajos || []).filter((trabajo) => trabajo.state === 'PENDIENTE')
  const conProblema = (trabajos || []).filter((trabajo) => trabajo.state === 'INCIERTO' || trabajo.state === 'FALLIDO').slice(0, 8)
  const enCola = filtroImpresora ? pendientes.filter((trabajo) => (trabajo.printerName || trabajo.destination) === filtroImpresora) : pendientes
  const impresorasEnCola = [...new Set(pendientes.map((trabajo) => trabajo.printerName || trabajo.destination).filter(Boolean))]
  const idsSeleccionados = seleccion.filter((id) => pendientes.some((trabajo) => trabajo.id === id))
  const alternar = (id) => setSeleccion((actual) => (actual.includes(id) ? actual.filter((valor) => valor !== id) : [...actual, id]))

  // Una sola vía para cancelar: selección, por impresora o todos los pendientes.
  // El backend vuelve a validar (solo PENDIENTE) y audita cada cancelación.
  async function cancelar(filtros) {
    if (cancelando) return
    setCancelando(true)
    try {
      const resultado = await printingApi.cancelarLote(filtros)
      const total = Number(resultado?.total || 0)
      toast.success(total === 1 ? 'Trabajo cancelado' : `${total} trabajos cancelados`, total ? 'No van a salir cuando el puente reconecte.' : 'No había pendientes para cancelar.')
    } catch (cause) {
      toast.error('No se pudo cancelar', cause?.message || '')
    } finally {
      setCancelando(false)
      setCancelarPregunta(null)
      setSeleccion([])
      consultar()
    }
  }

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
                  <p className={cn('mt-0.5', CELDA_DATO)} title={chequeo.detalle}>{chequeo.detalle}</p>
                </div>
                <Badge color={BADGE[chequeo.estado] || 'slate'}>{TEXTO[chequeo.estado] || chequeo.estado}</Badge>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {(resumen.atencion > 0 || resumen.error > 0) && (
          <Nota>
            Los puntos “a revisar” son configuraciones del servidor (credenciales, correo, cifrado) o de este equipo (agente de impresión). El dueño puede completarlos en <b className="text-fore">Configuración</b>; el resto de la app sigue funcionando sin ellos.
          </Nota>
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
          <div className={cn('lg:grid-cols-4', GRILLA_DOS_COLUMNAS)}><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : !sincronizacion ? (
          errorSync && <p role="alert" className="text-sm text-bad">{errorSync}</p>
        ) : (
          <>
            <div className={cn('lg:grid-cols-4', GRILLA_DOS_COLUMNAS)}>
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
                  <Aviso tono="error" className="p-3 rounded-xl text-mute">
                    Hay <b className="text-fore">{sincronizacion.trabajos.fallidos}</b> trabajo(s) de impresión fallidos: revisalos en <b className="text-fore">Impresoras</b>.
                  </Aviso>
                )}
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

      {/* Cola de impresión remota (#128): detalle con el usuario real y acción
          de cancelar solo para lo que sigue PENDIENTE. Lo que el puente ya
          reclamó (o el transporte aceptó) no se cancela: se confirma o se
          revisa en papel. */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="printer" className="h-4 w-4 text-mute" />Cola de impresión</h3>
            <p className="mt-1 text-sm text-mute">Trabajos remotos de la empresa: qué son, quién los mandó y a qué impresora. Cancelar sirve para lo que quedó esperando (por ejemplo, el puente apagado); no toca lo que ya salió.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {impresorasEnCola.length > 1 && (
              <Select
                aria-label="Filtrar la cola por impresora"
                className="w-48"
                value={filtroImpresora}
                onChange={(event) => { setFiltroImpresora(event.target.value); setSeleccion([]) }}
              >
                <option value="">Todas las impresoras</option>
                {impresorasEnCola.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
              </Select>
            )}
            <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
          </div>
        </div>

        {errorCola && <p role="alert" className="text-sm text-bad">{errorCola}</p>}
        {!errorCola && trabajos && !trabajos.length && <p className="text-sm text-mute">No hay trabajos de impresión registrados.</p>}

        {!errorCola && enCola.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-mute">{enCola.length} pendiente(s){filtroImpresora ? ` · ${filtroImpresora}` : ''}</p>
              {puedeCancelar && (
                <span className="flex flex-wrap items-center gap-2">
                  {idsSeleccionados.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-bad/40 text-bad hover:bg-bad/10"
                      onClick={() => setCancelarPregunta({ titulo: `Cancelar ${idsSeleccionados.length} trabajo(s)`, descripcion: 'Los seleccionados no van a salir cuando el puente reconecte. Queda registrado quién los canceló.', filtros: { ids: idsSeleccionados } })}
                    >
                      Cancelar seleccionados ({idsSeleccionados.length})
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="border-bad/40 text-bad hover:bg-bad/10"
                    onClick={() => setCancelarPregunta({ titulo: `Cancelar ${enCola.length} pendiente(s)`, descripcion: `${filtroImpresora ? `Todos los pendientes de ${filtroImpresora}` : 'Todos los pendientes de la cola'} no van a salir cuando el puente reconecte. No se toca lo que el puente ya reclamó.`, filtros: { ids: enCola.map((trabajo) => trabajo.id) } })}
                  >
                    Cancelar todos los pendientes
                  </Button>
                </span>
              )}
            </div>
            <ul className="divide-y divide-ink-600/60">
              {enCola.map((trabajo) => (
                <li key={trabajo.id} className="flex flex-wrap items-center gap-3 py-2">
                  {puedeCancelar && (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${tipoTrabajo(trabajo.kind)}${trabajo.reference ? ` de ${trabajo.reference}` : ''}`}
                      checked={seleccion.includes(trabajo.id)}
                      onChange={() => alternar(trabajo.id)}
                      className="h-4 w-4 accent-bad"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{tipoTrabajo(trabajo.kind)}</span>
                      {trabajo.reference && <span className="text-xs font-normal text-mute">{trabajo.reference}</span>}
                      <Badge color={colorTrabajo(trabajo.state)}>{etiquetaTrabajo(trabajo.state)}</Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute">
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar user={{ id: trabajo.requestedByUserId || `job-${trabajo.id}`, name: trabajo.requestedByName || 'Sin usuario' }} size="xs" />
                        {trabajo.requestedByName || 'Sin usuario'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate" title={[trabajo.printerName || trabajo.destination, trabajo.bridgeName].filter(Boolean).join(' · ')}>
                        {trabajo.printerName || trabajo.destination || 'sin impresora'}{trabajo.bridgeName ? ` · ${trabajo.bridgeName}` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>encolado {fmt(trabajo.enqueuedAt || trabajo.createdAt)}</span>
                      {Number(trabajo.attempts) > 0 && <span>· {trabajo.attempts} intento(s)</span>}
                    </p>
                    {trabajo.error && <p className="mt-0.5 truncate text-xs text-bad" title={trabajo.error}>{trabajo.error}</p>}
                  </div>
                  {puedeCancelar && trabajo.state === 'PENDIENTE' && (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-bad/40 text-bad hover:bg-bad/10"
                      onClick={() => setCancelarPregunta({ titulo: 'Cancelar trabajo', descripcion: `El ${tipoTrabajo(trabajo.kind).toLowerCase()}${trabajo.reference ? ` de ${trabajo.reference}` : ''} no va a salir cuando el puente reconecte. Queda registrado quién lo canceló.`, filtros: { ids: [trabajo.id] } })}
                    >
                      Cancelar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {!errorCola && conProblema.length > 0 && (
          <div className="rounded-xl border border-ink-600 p-3">
            <p className="text-xs uppercase tracking-wider text-mute">Recientes con problema</p>
            <ul className="mt-2 divide-y divide-ink-600/60">
              {conProblema.map((trabajo) => (
                <li key={trabajo.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-xs">
                  <span className="truncate font-medium" title={trabajo.error || ''}>{tipoTrabajo(trabajo.kind)}{trabajo.reference ? ` · ${trabajo.reference}` : ''}</span>
                  <span className="flex items-center gap-2 text-mute">
                    <Badge color={colorTrabajo(trabajo.state)}>{etiquetaTrabajo(trabajo.state)}</Badge>
                    <span>{trabajo.printerName || trabajo.destination || 'sin impresora'}</span>
                    <span>· {fmt(trabajo.enqueuedAt || trabajo.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {errorCola && <p className="text-xs text-mute">Sin la cola no se pueden cancelar trabajos: reintentá con «Actualizar».</p>}
      </Card>

      <ConfirmDialog
        open={Boolean(cancelarPregunta)}
        title={cancelarPregunta?.titulo || 'Cancelar trabajos'}
        description={cancelarPregunta?.descripcion || ''}
        confirmLabel="Cancelar trabajos"
        variant="danger"
        busy={cancelando}
        onCancel={() => setCancelarPregunta(null)}
        onConfirm={() => cancelar(cancelarPregunta?.filtros || {})}
      />
    </div>
  )
}
