import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GRILLA_DOS_COLUMNAS, PIE_ACCIONES } from '@/components/shared/formulario'
import { Aviso, Badge, BarraProgreso, Button, ConfirmDialog, EmptyState, Input, Label, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Avatar from '@/components/shared/Avatar'
import SerialTexto from '@/components/shared/SerialTexto'
import CameraScan from '@/components/shared/CameraScan'
import RecordHeader from '@/components/app/RecordHeader'
import { cn } from '@/lib/utils'
import { resources } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { clasificarCodigo, mensajeNoEsImei } from '@/lib/clasificarCodigo'
import { validarLote } from '@/lib/escanerSeriales'
import { avisarEscaneo } from '@/lib/feedbackEscaneo'
import { MOTIVO_INESPERADA } from '@/lib/verificacionStock'
import { fechaHora, fechaHoraCorta } from '@/utils/fecha'

// Verificación de stock («¿está físicamente?»), Stock › Control › Verificación.
// Sesión por sucursal (y depósito opcional): se escanea el IMEI (lector, cámara o
// pegado) o se tilda la fila, con progreso vivo, pendientes e inesperadas. Al
// terminar queda un resumen con quién, cuándo y qué faltó. No ajusta stock:
// eso sigue siendo el conteo (pestaña Conteos).

const TONOS = {
  ok: 'border-ok/40 bg-ok/10 text-ok',
  aviso: 'border-warn/40 bg-warn/10 text-warn',
  error: 'border-bad/40 bg-bad/10 text-bad',
}
const ESTADO = { OPEN: ['En curso', 'orange'], FINISHED: ['Terminada', 'green'], CANCELLED: ['Cancelada', 'slate'] }
const persona = (usuario) => ({ id: usuario?.id, name: usuario?.name || 'Equipo' })

function Quien({ usuario, fecha }) {
  if (!usuario) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-mute">
      <Avatar user={persona(usuario)} hasAvatar={Boolean(usuario.id)} size="xs" className="shrink-0" />
      <span className="truncate">{usuario.name}</span>
      {fecha ? <span className="shrink-0 tabular-nums" title={fechaHora(fecha)}>{fechaHoraCorta(fecha)}</span> : null}
    </span>
  )
}

function Progreso({ resumen }) {
  return (
    <div data-testid="verif-progreso" className="rounded-xl border border-ink-600 bg-ink-800/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-bold tabular-nums text-fore"><span data-testid="verif-contador">{resumen.verified}/{resumen.expected}</span> <span className="text-sm font-semibold text-mute">verificadas</span></p>
        <span className="text-sm font-semibold tabular-nums text-mute">{resumen.percent}%</span>
      </div>
      <div className="mt-2"><BarraProgreso valor={resumen.verified} max={Math.max(1, resumen.expected)} tono="ok" alto="sm" etiqueta={`Avance de la verificación: ${resumen.verified} de ${resumen.expected}`} /></div>
      <p className="mt-2 text-xs text-mute"><b className="text-warn">{resumen.missing}</b> pendientes · <b className={resumen.unexpected ? 'text-bad' : ''}>{resumen.unexpected}</b> inesperadas</p>
    </div>
  )
}

function FilaSerie({ serial, producto, children, tono }) {
  return (
    <div data-testid="verif-fila" data-serial={serial} className={cn('flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-1.5', tono || 'border-ink-600')}>
      <SerialTexto serial={serial} className="w-36 shrink-0 text-[11px]" />
      <span className="min-w-0 flex-1 truncate text-xs" title={producto || ''}>{producto || 'Producto no reconocido'}</span>
      {children}
    </div>
  )
}

function SesionActiva({ id, onCerrar, usuario }) {
  const toast = useToast()
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState('')
  const [entrada, setEntrada] = useState('')
  const [camara, setCamara] = useState(false)
  const [verPegado, setVerPegado] = useState(false)
  const [pegado, setPegado] = useState('')
  const [estado, setEstado] = useState(null)
  const [vista, setVista] = useState('pendientes')
  const [busy, setBusy] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const cola = useRef(Promise.resolve())

  const cargar = useCallback(async () => {
    try { setDetalle(await resources.stockVerifications.get(id)); setError('') } catch (causa) { setError(causa?.message || 'No se pudo cargar la verificación.') }
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const abierta = detalle?.status === 'OPEN'
  const mostrar = (tipo, texto) => { setEstado({ tipo, texto, marca: Date.now() }); avisarEscaneo(tipo) }

  const enviar = useCallback(async (serial) => {
    try {
      const r = await resources.stockVerifications.scan(id, serial, usuario)
      const nuevo = await resources.stockVerifications.get(id)
      setDetalle(nuevo)
      const cuenta = `${nuevo.summary.verified}/${nuevo.summary.expected}`
      if (r.duplicate) mostrar('aviso', `IMEI ${serial} ya estaba escaneado en esta verificación.`)
      else if (r.outcome === 'VERIFIED') mostrar('ok', `✓ ${r.productName ? `${r.productName} · ` : ''}IMEI ${serial} verificado (${cuenta}).`)
      else mostrar('error', `⚠ IMEI ${serial}: ${MOTIVO_INESPERADA[r.reason] || MOTIVO_INESPERADA.UNKNOWN}. Quedó como inesperada.`)
    } catch (causa) { mostrar('error', causa?.message || 'No se pudo registrar la lectura.') }
  }, [id, usuario])

  // Las lecturas se procesan de a una: la cámara puede entregar varias seguidas.
  const leer = useCallback((texto) => {
    const clasificado = clasificarCodigo(texto)
    if (clasificado.tipo !== 'imei' && clasificado.tipo !== 'serial') { mostrar('error', mensajeNoEsImei(clasificado)); return Promise.resolve() }
    cola.current = cola.current.then(async () => { setBusy(true); try { await enviar(clasificado.valor) } finally { setBusy(false) } })
    return cola.current
  }, [enviar])
  const alDetectar = useCallback((valor) => { leer(valor) }, [leer])
  const cerrarCamara = useCallback(() => setCamara(false), [])

  async function pegarVarios() {
    const { validos, errores } = validarLote({ entradas: pegado, yaCargados: [], limite: 500 })
    if (!validos.length) { mostrar('error', errores.map((fila) => fila.serial).join(', ') || 'No hay códigos para cargar.'); return }
    setPegado(''); setVerPegado(false)
    for (const serial of validos) await leer(serial)
  }

  async function terminar() {
    setBusy(true)
    try {
      await resources.stockVerifications.finish(id)
      toast.success('Verificación guardada', 'Quedó en el historial con lo verificado y lo que faltó.')
      onCerrar()
    } catch (causa) { setError(causa?.message || 'No se pudo terminar.'); setConfirmar(null) } finally { setBusy(false) }
  }
  async function cancelar() {
    setBusy(true)
    try { await resources.stockVerifications.cancel(id); onCerrar() } catch (causa) { setError(causa?.message || 'No se pudo cancelar.'); setConfirmar(null) } finally { setBusy(false) }
  }

  if (!detalle) return <div className="space-y-2">{error ? <Aviso tono="error">{error}</Aviso> : <><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></>}<Button type="button" variant="outline" onClick={onCerrar}>Volver</Button></div>
  const s = detalle.summary
  const [rotulo, color] = ESTADO[detalle.status] || ESTADO.OPEN
  const lista = vista === 'pendientes' ? detalle.pending : vista === 'verificadas' ? detalle.verified : detalle.unexpected
  const vistas = [['pendientes', 'Pendientes', s.missing], ['verificadas', 'Verificadas', s.verified], ['inesperadas', 'Inesperadas', s.unexpected]]

  return (
    <div className="space-y-3" data-testid="verif-sesion">
      <RecordHeader
        backLabel="Verificación"
        onBack={onCerrar}
        title={`${detalle.branch?.name || 'Sucursal'}${detalle.location ? ` · ${detalle.location.name}` : ''}`}
        chip={<Badge color={color}>{rotulo}</Badge>}
        meta={`Iniciada ${fechaHoraCorta(detalle.startedAt)} por ${detalle.startedBy?.name || '—'}${detalle.finishedAt ? ` · Terminó ${fechaHoraCorta(detalle.finishedAt)}` : ''}${detalle.note ? ` · ${detalle.note}` : ''}`}
      />
      {error && <Aviso tono="error">{error}</Aviso>}
      <Progreso resumen={s} />

      {abierta && (
        <div className="space-y-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
          <form onSubmit={(evento) => { evento.preventDefault(); const valor = entrada; setEntrada(''); leer(valor) }} className="flex flex-wrap gap-2">
            <Label htmlFor="verif-serial" className="sr-only">IMEI o serial a verificar</Label>
            <Input id="verif-serial" data-testid="verif-entrada" autoFocus autoComplete="off" autoCapitalize="characters" inputMode="text" className="min-h-11 w-full min-w-0 sm:w-auto sm:flex-1" value={entrada} onChange={(evento) => setEntrada(evento.target.value)} placeholder="Escaneá o escribí el IMEI y Enter" />
            <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={busy || !entrada.trim()}>Verificar</Button>
            <Button type="button" variant="outline" className="min-h-11" data-testid="verif-camara" onClick={() => setCamara((v) => !v)}><Icon name="image" className="h-3.5 w-3.5" />Cámara</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setVerPegado((v) => !v)}>Pegar varios</Button>
          </form>
          {camara && <CameraScan continuous onDetected={alDetectar} onClose={cerrarCamara} />}
          {verPegado && (
            <div className="space-y-2">
              <Textarea aria-label="IMEI para pegar" value={pegado} onChange={(evento) => setPegado(evento.target.value)} placeholder="Pegá los IMEI separados por coma, espacio o salto de línea…" className="min-h-24 w-full" />
              <div className={PIE_ACCIONES}><Button type="button" variant="outline" className="min-h-11" onClick={() => { setVerPegado(false); setPegado('') }}>Cerrar</Button><Button type="button" className="min-h-11" onClick={pegarVarios} disabled={busy || !pegado.trim()}>Cargar lote</Button></div>
            </div>
          )}
          <div role="status" aria-live="polite" data-testid="verif-estado" className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium', estado ? TONOS[estado.tipo] : 'border-ink-600 text-mute')}>
            <Icon name={estado?.tipo === 'ok' ? 'check' : estado ? 'alert' : 'tag'} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{estado?.texto || 'Escaneá con el lector o la cámara, o tildá las filas pendientes.'}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 sm:flex" role="tablist" aria-label="Lista de la verificación">
        {vistas.map(([clave, etiqueta, cantidad]) => (
          <button key={clave} type="button" role="tab" aria-selected={vista === clave} data-testid={`verif-vista-${clave}`} onClick={() => setVista(clave)} className={cn('min-h-11 min-w-0 rounded-lg border px-1 py-1 text-xs font-semibold leading-tight transition sm:px-3 sm:text-sm', vista === clave ? 'border-fono/50 bg-fono/10 text-fore' : 'border-ink-600 text-mute hover:text-fore')}><span className="block truncate">{etiqueta}</span><span className="block text-xs tabular-nums opacity-80">{cantidad}</span></button>
        ))}
      </div>

      <div className="space-y-1" data-testid="verif-lista">
        {lista.length === 0 && <p className="rounded-lg border border-ink-600 px-3 py-3 text-sm text-mute">{vista === 'pendientes' ? '¡No queda nada pendiente!' : vista === 'verificadas' ? 'Todavía no se verificó ningún equipo.' : 'No hubo lecturas inesperadas.'}</p>}
        {vista === 'pendientes' && lista.map((fila) => (
          <FilaSerie key={fila.serial} serial={fila.serial} producto={fila.productName}>
            {fila.locationName ? <span className="text-[11px] text-mute">{fila.locationName}</span> : null}
            {abierta && <button type="button" data-testid="verif-tildar" disabled={busy} aria-label={`Marcar ${fila.serial} como verificado`} title="Está acá: marcar verificado" onClick={() => leer(fila.serial)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-ok/40 text-ok transition hover:bg-ok/10 disabled:opacity-40"><Icon name="check" className="h-4 w-4" aria-hidden="true" /></button>}
          </FilaSerie>
        ))}
        {vista === 'verificadas' && lista.map((fila) => <FilaSerie key={fila.serial} serial={fila.serial} producto={fila.productName}><Quien usuario={fila.scannedBy} fecha={fila.createdAt} /></FilaSerie>)}
        {vista === 'inesperadas' && lista.map((fila) => (
          <FilaSerie key={fila.serial} serial={fila.serial} producto={fila.productName} tono="border-bad/30 bg-bad/5">
            <Badge color="red">{MOTIVO_INESPERADA[fila.reason] || MOTIVO_INESPERADA.UNKNOWN}</Badge>
            <Quien usuario={fila.scannedBy} fecha={fila.createdAt} />
          </FilaSerie>
        ))}
      </div>

      {abierta && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="min-h-11" data-testid="verif-terminar" disabled={busy} onClick={() => setConfirmar('terminar')}>Terminar</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmar('cancelar')}>Cancelar verificación</Button>
        </div>
      )}
      <ConfirmDialog open={confirmar === 'terminar'} onCancel={() => setConfirmar(null)} onConfirm={terminar} busy={busy} title="Terminar verificación" confirmLabel="Terminar y guardar" description={`Se guarda el resumen: ${s.verified} de ${s.expected} verificadas, ${s.missing} pendientes y ${s.unexpected} inesperadas. El stock no cambia.`} />
      <ConfirmDialog open={confirmar === 'cancelar'} onCancel={() => setConfirmar(null)} onConfirm={cancelar} busy={busy} variant="danger" title="Cancelar verificación" confirmLabel="Cancelar verificación" description="Se descarta la sesión. Lo ya verificado en las filas se mantiene registrado en cada equipo." />
    </div>
  )
}

export default function TabVerificacion({ ctx }) {
  const { branches = [], locations = [], sucursal, esDemo } = ctx
  const { usuario } = useSesion()
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [branchId, setBranchId] = useState(sucursal?.id || '')
  const [locationId, setLocationId] = useState('')
  const [busy, setBusy] = useState(false)
  const firma = useMemo(() => (esDemo && usuario ? { demoUser: { id: usuario.id, name: usuario.name || usuario.nombre, role: usuario.role } } : {}), [usuario, esDemo])

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setSesiones((await resources.stockVerifications.list()) || []); setError('') } catch (causa) { setError(causa?.message || 'No se pudo cargar el historial.') } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (!branchId && (sucursal?.id || branches[0]?.id)) setBranchId(sucursal?.id || branches[0].id) }, [sucursal, branches, branchId])

  const depositos = locations.filter((l) => l.branchId === branchId && l.isActive !== false)
  const elegida = branches.find((b) => b.id === branchId)
  const enCurso = sesiones.filter((s) => s.status === 'OPEN')
  const historial = sesiones.filter((s) => s.status !== 'OPEN')

  async function iniciar() {
    setBusy(true); setError('')
    try {
      const r = await resources.stockVerifications.create({ branchId: branchId || undefined, locationId: locationId || undefined, ...firma })
      setAbierta(r.id)
    } catch (causa) { setError(causa?.message || 'No se pudo iniciar la verificación.') } finally { setBusy(false) }
  }
  const volver = () => { setAbierta(null); cargar() }

  return (
    <div className="mt-4 space-y-4" data-testid="verificacion-tab">
      {abierta ? <SesionActiva id={abierta} onCerrar={volver} usuario={firma.demoUser} /> : (
        <>
          <div>
            <h3 className="text-sm font-bold text-fore">Verificación de stock</h3>
            <p className="mt-0.5 text-xs text-mute">Recorré el local y confirmá que cada equipo está físicamente. No cambia el stock: queda quién lo vio y cuándo.</p>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
            <div className={`${GRILLA_DOS_COLUMNAS} sm:max-w-xl`}>
              {branches.length > 1 && (
                <div><Label htmlFor="verif-sucursal">Sucursal</Label>
                  <Select id="verif-sucursal" value={branchId} onChange={(evento) => { setBranchId(evento.target.value); setLocationId('') }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></div>
              )}
              {depositos.length > 0 && (
                <div><Label htmlFor="verif-deposito">Depósito</Label>
                  <Select id="verif-deposito" value={locationId} onChange={(evento) => setLocationId(evento.target.value)}><option value="">Toda la sucursal</option>{depositos.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div>
              )}
            </div>
            <Button type="button" className="min-h-11 w-full sm:w-auto" data-testid="verif-iniciar" disabled={busy} onClick={iniciar}><Icon name="check" className="h-4 w-4" />{enCurso.length ? 'Continuar o iniciar verificación' : 'Iniciar verificación'}{elegida ? ` · ${elegida.name}` : ''}</Button>
          </div>

          {cargando && sesiones.length === 0 && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
          {enCurso.length > 0 && (
            <section className="space-y-1.5"><h4 className="text-xs font-bold uppercase tracking-wide text-mute">En curso</h4>
              {enCurso.map((s) => <FilaHistorial key={s.id} sesion={s} onAbrir={() => setAbierta(s.id)} />)}
            </section>
          )}
          <section className="space-y-1.5"><h4 className="text-xs font-bold uppercase tracking-wide text-mute">Historial</h4>
            {!cargando && historial.length === 0 && <EmptyState compact icon="box" title="Todavía no hay verificaciones." description="Iniciá una para confirmar qué hay físicamente en la sucursal." />}
            {historial.map((s) => <FilaHistorial key={s.id} sesion={s} onAbrir={() => setAbierta(s.id)} />)}
          </section>
        </>
      )}
    </div>
  )
}

function FilaHistorial({ sesion, onAbrir }) {
  const [rotulo, color] = ESTADO[sesion.status] || ESTADO.FINISHED
  const s = sesion.summary
  return (
    <button type="button" data-testid="verif-historial-fila" onClick={onAbrir} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink-600 bg-ink-800/40 px-3 py-2 text-left transition hover:border-fono/40">
      <Badge color={color}>{rotulo}</Badge>
      <b className="min-w-0 truncate text-sm">{sesion.branch?.name || 'Sucursal'}{sesion.location ? ` · ${sesion.location.name}` : ''}</b>
      {sesion.status === 'FINISHED' && <span className="text-xs tabular-nums text-mute">{s.verified}/{s.expected} verificadas · <span className={s.missing ? 'text-warn' : ''}>{s.missing} faltaron</span> · <span className={s.unexpected ? 'text-bad' : ''}>{s.unexpected} inesperadas</span></span>}
      <span className="ml-auto flex shrink-0 items-center gap-2"><Quien usuario={sesion.finishedBy || sesion.startedBy} fecha={sesion.finishedAt || sesion.startedAt} /><Icon name="chevron" className="h-3.5 w-3.5 -rotate-90 text-mute" aria-hidden="true" /></span>
    </button>
  )
}
