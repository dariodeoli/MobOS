import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Eyebrow, FormField, Input, Modal, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { URL_AGENTE, cargarImpresoras, colaAgente, configImpresora, diagnosticoAgente, enmascararToken, estadoAgente, guardarImpresoras, historialAgente, imprimirTicketDirecto, limpiarFallidos, reintentarFallidos, sincronizarAgente } from '@/lib/printing/agent'
import { ticketPrueba } from '@/lib/printing/tickets'

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
const conexionDe = (destino) => (String(destino || '').startsWith('usb:') ? 'USB' : 'LAN')

const vacioFormulario = () => ({
  id: null,
  nombre: '',
  marca: '',
  modelo: '',
  ubicacion: '',
  predeterminada: false,
  conexion: 'usb',
  destinoUsb: '',
  ip: '192.168.1.23',
  puerto: '9100',
  ancho: 58,
  copias: 1,
  corte: true,
  densidad: 3,
  caracteres: true,
})

// Impresoras: una sola pantalla para configurar, probar y monitorear las
// térmicas. Configuración, estado, cola y actividad en un mismo lugar.
export default function Impresoras() {
  const toast = useToast()
  const { usuario, sesion } = useSesion()
  const tenantId = usuario?.tenantId || 'sin-tenant'
  const [store, setStore] = useState(() => cargarImpresoras(tenantId))
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [historial, setHistorial] = useState([])
  const [cola, setCola] = useState(null)
  const [sesiones, setSesiones] = useState(null)
  const [formulario, setFormulario] = useState(null)
  const [diagnostico, setDiagnostico] = useState(null)
  const [diagnosticando, setDiagnosticando] = useState(false)
  const [probandoId, setProbandoId] = useState(null)
  const [progreso, setProgreso] = useState('')
  const [eliminarId, setEliminarId] = useState(null)
  const [verColaAbierta, setVerColaAbierta] = useState(false)
  const [filtroActividad, setFiltroActividad] = useState('')

  const consultar = useCallback(async () => {
    setCargando(true)
    const agente = await estadoAgente({ forzar: true })
    setEstado(agente)
    const config = configImpresora()
    if (agente.disponible && config.token) {
      try {
        const [actividad, trabajos] = await Promise.all([historialAgente(30), colaAgente()])
        setHistorial(actividad?.historial || [])
        setCola(trabajos)
      } catch { setHistorial([]); setCola(null) }
    } else {
      setHistorial([]); setCola(null)
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
  }, [consultar, tenantId])

  const persistir = async (siguiente) => {
    setStore(siguiente)
    guardarImpresoras(tenantId, siguiente)
    try { await sincronizarAgente(siguiente) } catch { toast.error('El agente no respondió', 'Los cambios quedaron guardados acá; se sincronizan cuando el agente vuelva a estar en línea.') }
  }

  const impresoras = store.impresoras || []
  const predeterminada = impresoras.find((item) => item.activa && item.predeterminada) || impresoras.find((item) => item.activa) || null

  function estadoDe(impresora) {
    if (!estado?.disponible) return { label: 'Agente desconectado', color: 'slate' }
    if (!impresora.destino) return { label: 'Error de configuración', color: 'red' }
    if (impresora.ultimaPrueba?.ok) return { label: 'Prueba exitosa', color: 'green' }
    if (impresora.conexion === 'usb') {
      const detectada = (estado.impresoras?.usb || []).includes(String(impresora.destino).slice(4))
      return detectada ? { label: 'Conectada', color: 'green' } : { label: 'Configurada', color: 'slate' }
    }
    if (impresora.destino === estado.impresora) {
      return estado.impresoraOk ? { label: 'Conectada', color: 'green' } : { label: 'Sin conexión', color: 'red' }
    }
    return { label: 'Configurada', color: 'slate' }
  }

  function abrirFormulario(impresora = null) {
    if (!impresora) { setFormulario({ ...vacioFormulario(), predeterminada: impresoras.length === 0 }); return }
    const destino = String(impresora.destino || '')
    const [ip, puerto] = destino.startsWith('lan:') ? destino.slice(4).split(':') : ['', '']
    setFormulario({
      id: impresora.id,
      nombre: impresora.nombre,
      marca: impresora.marca,
      modelo: impresora.modelo,
      ubicacion: impresora.ubicacion,
      predeterminada: Boolean(impresora.predeterminada),
      conexion: impresora.conexion,
      destinoUsb: destino.startsWith('usb:') ? destino.slice(4) : '',
      ip: ip || '192.168.1.23',
      puerto: puerto || '9100',
      ancho: impresora.ancho,
      copias: impresora.copias,
      corte: impresora.corte,
      densidad: impresora.densidad || 3,
      caracteres: impresora.caracteres,
    })
  }

  const destinoDelFormulario = (f) => (f.conexion === 'usb' ? `usb:${f.destinoUsb.trim()}` : `lan:${f.ip.trim()}:${f.puerto.trim() || '9100'}`)

  async function guardarFormulario({ probar = false } = {}) {
    const f = formulario
    if (!f) return
    const destino = destinoDelFormulario(f)
    if (!f.nombre.trim()) return toast.error('Falta el nombre', 'Poné un nombre visible para reconocer la impresora.')
    if (!destino || (f.conexion === 'usb' && destino === 'usb:') || (f.conexion === 'lan' && (!f.ip.trim() || !f.puerto.trim()))) return toast.error('Falta el destino', f.conexion === 'usb' ? 'Elegí la cola USB.' : 'Completá la IP y el puerto.')
    let siguiente = { ...store }
    let impresoras = [...siguiente.impresoras]
    if (f.predeterminada) impresoras = impresoras.map((item) => ({ ...item, predeterminada: false }))
    const datos = {
      nombre: f.nombre.trim(),
      marca: f.marca.trim(),
      modelo: f.modelo.trim(),
      ubicacion: f.ubicacion.trim(),
      conexion: f.conexion,
      destino,
      ancho: f.ancho,
      copias: f.copias,
      corte: f.corte,
      densidad: f.densidad,
      caracteres: f.caracteres,
      predeterminada: Boolean(f.predeterminada),
      activa: true,
    }
    if (f.id) {
      const actual = impresoras.find((item) => item.id === f.id)
      impresoras = impresoras.map((item) => (item.id === f.id ? { ...actual, ...datos } : item))
    } else {
      impresoras = [...impresoras, { id: `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`, ultimaPrueba: null, ...datos }]
    }
    if (impresoras.length === 1) impresoras[0].predeterminada = true
    siguiente = { ...siguiente, impresoras }
    await persistir(siguiente)
    setFormulario(null)
    toast.success('Impresora guardada', datos.destino)
    if (probar) {
      const guardada = siguiente.impresoras.find((item) => item.destino === datos.destino)
      if (guardada) probar(guardada)
    }
  }

  async function probar(impresora) {
    if (probandoId) return
    setProbandoId(impresora.id)
    setProgreso('Preparando prueba…')
    const ticket = ticketPrueba({ ancho: impresora.ancho, impresora: impresora.destino, nombre: impresora.nombre })
    setProgreso('Enviando al agente…')
    const resultado = await imprimirTicketDirecto(ticket, { impresora: impresora.destino, copias: 1, usuario: sesion?.nombre || usuario?.name || '' })
    if (resultado.ok) {
      setProgreso(resultado.encolado ? 'Encolada…' : 'Impresión exitosa.')
      const siguiente = {
        ...store,
        impresoras: store.impresoras.map((item) => (item.id === impresora.id ? { ...item, ultimaPrueba: { ok: true, fecha: new Date().toISOString() } } : item)),
      }
      guardarImpresoras(tenantId, siguiente)
      setStore(siguiente)
      toast.success('Prueba enviada', resultado.encolado ? 'La impresora no respondió; el agente reintenta solo.' : 'El ticket de prueba salió por la térmica.')
    } else {
      setProgreso('La impresora no respondió.')
      toast.error('No se pudo imprimir', resultado.error)
    }
    setProbandoId(null)
    consultar()
  }

  async function diagnosticar(impresora = null) {
    if (diagnosticando) return
    setDiagnosticando(true)
    setDiagnostico(null)
    try {
      const destino = impresora?.destino || configImpresora().impresora || ''
      setDiagnostico({ destino, ...(await diagnosticoAgente(destino)) })
    } catch (cause) {
      setDiagnostico({ ok: false, error: cause?.message || 'No se pudo consultar el diagnóstico.' })
    } finally { setDiagnosticando(false) }
  }

  async function eliminar() {
    const id = eliminarId
    setEliminarId(null)
    if (!id) return
    const siguiente = { ...store, impresoras: store.impresoras.filter((item) => item.id !== id) }
    if (siguiente.impresoras.length && !siguiente.impresoras.some((item) => item.predeterminada)) siguiente.impresoras[0].predeterminada = true
    await persistir(siguiente)
    toast.success('Impresora eliminada')
  }

  async function duplicar(impresora) {
    const copia = { ...impresora, id: `imp-${Date.now()}-${Math.random().toString(16).slice(2)}`, nombre: `${impresora.nombre} (copia)`, predeterminada: false, ultimaPrueba: null }
    await persistir({ ...store, impresoras: [...store.impresoras, copia] })
    toast.success('Configuración duplicada', copia.nombre)
  }

  async function alternarActiva(impresora) {
    const siguiente = {
      ...store,
      impresoras: store.impresoras.map((item) => (item.id === impresora.id ? { ...item, activa: !item.activa, predeterminada: item.activa ? false : item.predeterminada } : item)),
    }
    if (siguiente.impresoras.some((item) => item.activa) && !siguiente.impresoras.some((item) => item.activa && item.predeterminada)) {
      siguiente.impresoras.find((item) => item.activa).predeterminada = true
    }
    await persistir(siguiente)
    toast.success(impresora.activa ? 'Impresora desactivada' : 'Impresora activada', impresora.nombre)
  }

  async function marcarPredeterminada(impresora) {
    const siguiente = {
      ...store,
      impresoras: store.impresoras.map((item) => ({ ...item, predeterminada: item.id === impresora.id })),
    }
    await persistir(siguiente)
    toast.success('Impresora predeterminada', impresora.nombre)
  }

  async function reintentar() {
    try {
      const resultado = await reintentarFallidos()
      toast.success('Reintentando', `${resultado?.reintentados || 0} trabajo(s) fallido(s) vuelven a la cola.`)
    } catch (cause) { toast.error('No se pudo reintentar', cause?.message) }
    consultar()
  }

  async function limpiar() {
    try {
      const resultado = await limpiarFallidos()
      toast.success('Cola limpia', `${resultado?.limpiados || 0} trabajos fallidos quitados.`)
    } catch (cause) { toast.error('No se pudo limpiar la cola', cause?.message) }
    consultar()
  }

  const sesionActiva = (s) => Date.now() - new Date(s.lastSeenAt || 0).getTime() < 15 * 60 * 1000
  const pendientes = cola?.pendientes || []
  const fallidos = cola?.fallidos || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow>Impresoras</Eyebrow>
          <h2 className="mt-1 font-semibold">Impresoras</h2>
          <p className="mt-1 text-sm text-mute">Configurá, probá y monitoreá tus impresoras térmicas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar estado</Button>
          <Button type="button" onClick={() => abrirFormulario(null)}><Icon name="plus" className="h-3.5 w-3.5" />Agregar impresora</Button>
        </div>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Estado del sistema de impresión</h3>
          <Badge color={estado?.disponible ? 'green' : 'slate'}>{cargando ? 'Consultando…' : estado?.disponible ? `Agente conectado · v${estado.version || ''}` : 'Agente desconectado'}</Badge>
        </div>
        {cargando && !estado ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Computadora puente</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${estado?.disponible ? 'bg-ok' : 'bg-bad'}`} />{estado?.disponible ? 'Encendida' : 'Apagada o sin agente'}</p>
              <p className="mt-1 truncate text-xs text-mute" title={store.agentUrl}>{store.agentUrl.includes('127.0.0.1') || store.agentUrl.includes('localhost') ? 'Solo esta computadora' : store.agentUrl}</p>
              {estado?.disponible && <p className="mt-1 text-xs text-mute">Dirección local {URL_AGENTE} · {estado.host === '0.0.0.0' ? 'acepta la red local' : 'solo local'}</p>}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Impresora predeterminada</p>
              <p className="mt-1 truncate text-sm font-semibold" title={predeterminada?.destino || undefined}>{predeterminada ? `${predeterminada.nombre} · ${predeterminada.destino}` : 'Sin configurar'}</p>
              {estado?.disponible && predeterminada && <p className="mt-1 text-xs text-mute">{conexionDe(predeterminada.destino)} · {predeterminada.ancho} mm · {predeterminada.copias} copia(s)</p>}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Cola</p>
              <p className="mt-1 text-sm font-semibold">{estado?.cola?.pendientes ?? cola?.resumen?.pendientes ?? 0} pendientes · {estado?.cola?.fallidos ?? cola?.resumen?.fallidos ?? 0} fallidos</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-fono-light" onClick={() => setVerColaAbierta(true)}>Ver cola</Button>
                {(fallidos.length > 0) && <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-warn" onClick={reintentar}>Reintentar fallidos</Button>}
                {(fallidos.length > 0) && <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-bad" onClick={limpiar}>Limpiar fallidos</Button>}
              </div>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Mi equipo</p>
              <p className="mt-1 truncate text-sm font-semibold">{estado?.cliente || '—'}</p>
              <p className="mt-1 text-xs text-mute">{sesion?.correo || sesion?.nombre || 'Sin sesión'}</p>
            </div>
          </div>
        )}
        {!estado?.disponible && !cargando && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
            No se encontró el agente en <b className="text-fore">{store.agentUrl}</b>. Instalalo en la computadora puente con <code className="rounded bg-ink-700 px-1">bash print-agent/install-macos.sh</code>; en las demás computadoras, apuntá la dirección del agente a la IP de esa Mac.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => diagnosticar(null)} disabled={diagnosticando || !estado?.disponible}>{diagnosticando ? 'Consultando…' : 'Diagnóstico de red'}</Button>
        </div>
        {diagnostico && (
          <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-mute">Diagnóstico de red · {diagnostico.destino || 'sin destino'}</p>
            {diagnostico.ok === false && <p role="alert" className="mt-1 text-bad">{diagnostico.error}</p>}
            {diagnostico.ok && <ExplicacionDiagnostico diagnostico={diagnostico} />}
          </div>
        )}
      </Card>

      {impresoras.length === 0 ? (
        <Card>
          <EmptyState icon="receipt" title="Todavía no hay impresoras." description="Agregá la térmica con “Agregar impresora” y probala para dejarla lista." action={<Button type="button" onClick={() => abrirFormulario(null)}>Agregar impresora</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {impresoras.map((impresora) => {
            const chip = estadoDe(impresora)
            return (
              <Card key={impresora.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {impresora.nombre || impresora.destino || 'Sin nombre'}
                      {impresora.predeterminada && impresora.activa && <Badge color="blue">Predeterminada</Badge>}
                      {!impresora.activa && <Badge>Desactivada</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-mute" title={impresora.destino}>{impresora.marca && impresora.modelo ? `${impresora.marca} ${impresora.modelo} · ` : ''}{impresora.destino || 'Sin destino'}</p>
                  </div>
                  <Badge color={chip.color}>{chip.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                  <span>Conexión: <b className="text-fore">{conexionDe(impresora.destino)}</b></span>
                  <span>Ancho: <b className="text-fore">{impresora.ancho} mm</b></span>
                  <span>Copias: <b className="text-fore">{impresora.copias}</b></span>
                  {impresora.ubicacion && <span>Ubicación: <b className="text-fore">{impresora.ubicacion}</b></span>}
                </div>
                <p className="text-xs text-mute">Última prueba: <b className="text-fore">{impresora.ultimaPrueba ? `${impresora.ultimaPrueba.ok ? 'Impresa correctamente' : 'Falló'} · ${fmt(impresora.ultimaPrueba.fecha)}` : 'Sin prueba todavía'}</b></p>
                {probandoId === impresora.id && <p role="status" className="rounded-lg border border-fono/25 bg-fono/10 p-2 text-xs text-fono-light">{progreso}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => probar(impresora)} disabled={Boolean(probandoId) || !impresora.activa}>{probandoId === impresora.id ? 'Enviando…' : 'Imprimir prueba'}</Button>
                  <Button type="button" variant="outline" onClick={() => abrirFormulario(impresora)}>Editar</Button>
                  <Button type="button" variant="ghost" onClick={() => { setFiltroActividad(impresora.destino); diagnosticar(impresora) }}>Diagnóstico</Button>
                  <Button type="button" variant="ghost" onClick={() => setFiltroActividad(impresora.destino)}>Ver actividad</Button>
                  <span className="ml-auto" />
                  {!impresora.predeterminada && impresora.activa && <Button type="button" variant="ghost" onClick={() => marcarPredeterminada(impresora)}>Predeterminada</Button>}
                  <Button type="button" variant="ghost" onClick={() => duplicar(impresora)}>Duplicar</Button>
                  <Button type="button" variant="ghost" onClick={() => alternarActiva(impresora)}>{impresora.activa ? 'Desactivar' : 'Activar'}</Button>
                  <Button type="button" variant="ghost" className="text-bad" onClick={() => setEliminarId(impresora.id)}>Eliminar</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Actividad de impresión</h3>
            <p className="mt-1 text-sm text-mute">Últimos trabajos que pasaron por el agente{filtroActividad ? ` (impresora ${filtroActividad})` : ''}.</p>
          </div>
          {filtroActividad && <Button type="button" variant="ghost" onClick={() => setFiltroActividad('')}>Quitar filtro</Button>}
        </div>
        {!historial.length ? (
          <EmptyState compact icon="receipt" title="Todavía no hay impresiones registradas." description="Cuando imprimas un comprobante o una etiqueta, queda acá." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Equipo</th>
                  <th className="px-2 py-2">Impresora</th>
                  <th className="px-2 py-2">Conexión</th>
                  <th className="px-2 py-2 text-right">Resultado</th>
                  <th className="px-2 py-2 text-right">Bytes</th>
                </tr>
              </thead>
              <tbody>
                {historial.filter((fila) => !filtroActividad || fila.impresora === filtroActividad).map((fila, indice) => (
                  <tr key={`${fila.fecha}-${indice}`} className="border-b border-ink-600/50">
                    <td className="px-2 py-2 text-xs text-mute">{fmt(fila.fecha)}</td>
                    <td className="px-2 py-2 text-xs">{fila.usuario || '—'}</td>
                    <td className="px-2 py-2 text-xs">{fila.cliente || '—'}</td>
                    <td className="px-2 py-2 truncate text-xs text-mute" title={fila.impresora}>{fila.impresora}</td>
                    <td className="px-2 py-2 text-xs text-mute">{conexionDe(fila.impresora)}</td>
                    <td className="px-2 py-2 text-right">
                      <Badge color={fila.resultado === 'impreso' ? 'green' : 'red'}>{fila.resultado}</Badge>
                      {fila.error && <span className="mt-1 block max-w-[16rem] truncate text-[10px] text-bad" title={fila.error}>{fila.error}</span>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-mute">{fila.bytes || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Equipos con acceso</h3>
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

      {formulario && (
        <FormularioImpresora
          formulario={formulario}
          setFormulario={setFormulario}
          estado={estado}
          tokenGuardado={store.agentToken}
          agentUrl={store.agentUrl}
          onGuardar={guardarFormulario}
        />
      )}

      <ConfirmDialog
        open={Boolean(eliminarId)}
        onCancel={() => setEliminarId(null)}
        onConfirm={eliminar}
        title="¿Eliminar esta impresora?"
        description="Se quita de la configuración de esta empresa. Las impresiones ya hechas siguen en el historial del agente."
        confirmLabel="Eliminar impresora"
        variant="danger"
      />

      <Modal open={verColaAbierta} onClose={() => setVerColaAbierta(false)} title="Cola de impresión" className="max-w-2xl">
        <div className="space-y-4">
          {!pendientes.length && !fallidos.length ? (
            <EmptyState compact icon="check" title="La cola está vacía." />
          ) : (
            <div className="space-y-4">
              {pendientes.length > 0 && (
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Pendientes ({pendientes.length})</h4>
                  <TablaTrabajos trabajos={pendientes} />
                </section>
              )}
              {fallidos.length > 0 && (
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-bad">Fallidos ({fallidos.length})</h4>
                  <TablaTrabajos trabajos={fallidos} />
                </section>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {fallidos.length > 0 && <Button type="button" variant="outline" onClick={reintentar}>Reintentar fallidos</Button>}
            {fallidos.length > 0 && <Button type="button" variant="ghost" onClick={limpiar}>Limpiar fallidos</Button>}
            <Button type="button" variant="outline" onClick={consultar}>Actualizar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TablaTrabajos({ trabajos }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
            <th className="px-2 py-2">Fecha</th>
            <th className="px-2 py-2">Impresora</th>
            <th className="px-2 py-2">Equipo</th>
            <th className="px-2 py-2">Usuario</th>
            <th className="px-2 py-2">Intentos</th>
            <th className="px-2 py-2 text-right">Bytes</th>
            <th className="px-2 py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {trabajos.map((trabajo) => (
            <tr key={trabajo.id} className="border-b border-ink-600/50">
              <td className="px-2 py-2 text-xs text-mute" title={trabajo.id}>{fmt(trabajo.creadoEn)}</td>
              <td className="px-2 py-2 text-xs">{trabajo.impresora}</td>
              <td className="px-2 py-2 text-xs">{trabajo.cliente || '—'}</td>
              <td className="px-2 py-2 text-xs">{trabajo.usuario || '—'}</td>
              <td className="px-2 py-2 text-xs">{trabajo.intentos || 0}</td>
              <td className="px-2 py-2 text-right text-xs text-mute">{trabajo.bytes || 0}</td>
              <td className="px-2 py-2 max-w-[14rem] truncate text-[10px] text-bad" title={trabajo.error}>{trabajo.error || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExplicacionDiagnostico({ diagnostico }) {
  const destino = String(diagnostico.destino || '')
  const host = destino.startsWith('lan:') ? destino.slice(4).split(':')[0] : ''
  const interfaces = diagnostico.interfaces || []
  const subred = (ip) => ip.split('.').slice(0, 3).join('.')
  const mismaRed = host && interfaces.some((ip) => subred(ip) === subred(host))
  if (!host) {
    return (
      <div className="mt-1 space-y-1 text-xs text-mute">
        <p>Destino USB: la impresión pasa por la cola de la computadora puente.</p>
        {interfaces.length > 0 && <p>La Mac del puente está en {interfaces.join(' · ')}.</p>}
      </div>
    )
  }
  if (diagnostico.alcance) return <p className="mt-1 text-xs text-ok">La impresora {host} responde: la conexión está lista.</p>
  if (!mismaRed) {
    return (
      <div className="mt-1 space-y-1 text-xs">
        <p className="text-warn">La impresora está en {host} y la computadora en {interfaces.length ? interfaces[0] : 'otra red'}: no están en la misma subred.</p>
        <p className="text-mute">Opciones: conectar la impresora al mismo router de la Mac, o correr <code className="rounded bg-ink-700 px-1">bash print-agent/red-mac.sh agregar</code> en el puente para sumar una IP de esa red.</p>
      </div>
    )
  }
  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className="text-bad">La impresora {host} no responde, aunque está en la misma subred.</p>
      <p className="text-mute">Revisá el cable LAN de la impresora, que esté encendida y que el puerto {destino.slice(4).split(':')[1] || '9100'} siga abierto.</p>
    </div>
  )
}

function FormularioImpresora({ formulario, setFormulario, estado, tokenGuardado, agentUrl, onGuardar }) {
  const [validacion, setValidacion] = useState(null)
  const [validando, setValidando] = useState(false)
  const f = formulario
  const set = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }))
  const destino = f.conexion === 'usb' ? `usb:${f.destinoUsb.trim()}` : `lan:${f.ip.trim()}:${f.puerto.trim() || '9100'}`
  const tokenEnmascarado = enmascararToken(tokenGuardado)

  async function validar() {
    if (validando || !destino) return
    setValidando(true)
    setValidacion(null)
    try {
      setValidacion(await diagnosticoAgente(destino))
    } catch (cause) {
      setValidacion({ ok: false, error: cause?.message || 'No se pudo validar la conexión.' })
    } finally { setValidando(false) }
  }

  return (
    <Modal open onClose={() => setFormulario(null)} title={f.id ? 'Editar impresora' : 'Agregar impresora'} className="max-w-xl">
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Identificación</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FormField label="Nombre visible" htmlFor="imp-nombre">
              <Input id="imp-nombre" value={f.nombre} onChange={(event) => set({ nombre: event.target.value })} placeholder="Térmica mostrador" />
            </FormField>
            <FormField label="Sucursal o ubicación" htmlFor="imp-ubicacion">
              <Input id="imp-ubicacion" value={f.ubicacion} onChange={(event) => set({ ubicacion: event.target.value })} placeholder="Mostrador ASU" />
            </FormField>
            <FormField label="Marca" htmlFor="imp-marca">
              <Input id="imp-marca" value={f.marca} onChange={(event) => set({ marca: event.target.value })} placeholder="ZKTeco" />
            </FormField>
            <FormField label="Modelo" htmlFor="imp-modelo">
              <Input id="imp-modelo" value={f.modelo} onChange={(event) => set({ modelo: event.target.value })} placeholder="ZKP8008" />
            </FormField>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-fono)]" checked={f.predeterminada} onChange={(event) => set({ predeterminada: event.target.checked })} />
            Impresora predeterminada
          </label>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Conexión</h4>
          <div className="mt-2 flex gap-2">
            {[['usb', 'USB'], ['lan', 'LAN']].map(([valor, etiqueta]) => (
              <button key={valor} type="button" onClick={() => set({ conexion: valor })} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${f.conexion === valor ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore'}`}>{etiqueta}</button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {f.conexion === 'usb' ? (
              <FormField label="Cola USB" htmlFor="imp-usb">
                <Input id="imp-usb" list="impresoras-usb" value={f.destinoUsb} onChange={(event) => set({ destinoUsb: event.target.value })} placeholder="ZKP8008" autoCapitalize="off" spellCheck={false} />
                <datalist id="impresoras-usb">{(estado?.impresoras?.usb || []).map((cola) => <option key={cola} value={cola} />)}</datalist>
              </FormField>
            ) : (
              <>
                <FormField label="IP" htmlFor="imp-ip">
                  <Input id="imp-ip" value={f.ip} onChange={(event) => set({ ip: event.target.value })} placeholder="192.168.1.23" autoCapitalize="off" spellCheck={false} />
                </FormField>
                <FormField label="Puerto" htmlFor="imp-puerto">
                  <Input id="imp-puerto" inputMode="numeric" value={f.puerto} onChange={(event) => set({ puerto: event.target.value.replace(/\D/g, '') })} placeholder="9100" />
                </FormField>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-mute">Destino generado: <b className="text-fore">{destino || '—'}</b></p>
          {f.conexion === 'lan' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={validar} disabled={validando || !f.ip.trim()}>{validando ? 'Validando…' : 'Validar conexión'}</Button>
              {validacion && (
                <span className="text-xs text-mute">
                  {validacion.ok === false ? <span className="text-bad">{validacion.error}</span> : <ExplicacionDiagnostico diagnostico={validacion} />}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Formato</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <FormField label="Ancho" htmlFor="imp-ancho">
              <Select id="imp-ancho" value={String(f.ancho)} onChange={(event) => set({ ancho: Number(event.target.value) })}>
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
              </Select>
            </FormField>
            <FormField label="Copias" htmlFor="imp-copias">
              <Input id="imp-copias" inputMode="numeric" maxLength={1} value={String(f.copias)} onChange={(event) => set({ copias: Number(event.target.value.replace(/\D/g, '').slice(0, 1) || '1') })} />
            </FormField>
            <FormField label="Densidad" htmlFor="imp-densidad">
              <Select id="imp-densidad" value={String(f.densidad)} onChange={(event) => set({ densidad: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5].map((nivel) => <option key={nivel} value={nivel}>{nivel}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-fono)]" checked={f.corte} onChange={(event) => set({ corte: event.target.checked })} />Corte automático</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-fono)]" checked={f.caracteres} onChange={(event) => set({ caracteres: event.target.checked })} />Caracteres especiales (acentos y ñ)</label>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Agente</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FormField label="Dirección del agente" htmlFor="imp-agente-url">
              <Input id="imp-agente-url" value={agentUrl} onChange={() => {}} readOnly />
            </FormField>
            <FormField label="Token del agente" htmlFor="imp-token" hint={tokenEnmascarado ? `Guardado: ${tokenEnmascarado}. Dejalo vacío para conservarlo.` : 'Lo muestra el instalador del agente.'}>
              <Input id="imp-token" placeholder={tokenEnmascarado ? `•••• ${tokenEnmascarado.slice(-4)}` : 'Sin token'} autoCapitalize="off" spellCheck={false} />
            </FormField>
          </div>
          <p className="mt-2 text-xs text-mute">Estado: <b className={estado?.disponible ? 'text-ok' : 'text-bad'}>{estado?.disponible ? `conectado · v${estado.version || ''}` : 'sin agente'}</b>{estado?.disponible ? ` · ${estado.host === '0.0.0.0' ? 'acceso: red local' : 'acceso: solo esta computadora'}` : ''}.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => setFormulario(null)}>Cancelar</Button>
          <Button type="button" onClick={() => onGuardar({ probar: false })}>Guardar impresora</Button>
          <Button type="button" variant="outline" onClick={() => onGuardar({ probar: true })}>Guardar y probar</Button>
        </div>
      </div>
    </Modal>
  )
}
