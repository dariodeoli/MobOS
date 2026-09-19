import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Eyebrow, FormField, Input, Modal, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { URL_AGENTE, cargarImpresoras, colaAgente, configImpresora, confirmarJob, diagnosticoAgente, enmascararToken, estadoAgente, estadoDePuente, guardarImpresoras, guardarPuentes, historialAgente, imprimirTicketDirecto, limpiarFallidos, puenteDe, reintentarFallidos, repararRed, sincronizarAgente } from '@/lib/printing/agent'
import { TIPOS_TICKET_PRUEBA, ticketPruebaTipo } from '@/lib/printing/tickets'
import Avatar from '@/components/shared/Avatar'

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
// `usb:<cola>` es una cola CUPS local (puede salir por LAN o por USB físico):
// se muestra como CUPS y su URI real la informa el agente.
// Resultado honesto del trabajo: confirmado en papel, aceptado por el
// transporte, incierto (pudo salir) o fallido.
const COLOR_RESULTADO = { confirmado: 'green', impreso: 'green', aceptado: 'blue', incierto: 'orange', fallido: 'red' }

const conexionDe = (destino) => (/^(usb|cups):/.test(String(destino || '')) ? 'CUPS' : 'LAN')

const vacioFormulario = () => ({
  id: null,
  nombre: '',
  marca: '',
  modelo: '',
  ubicacion: '',
  predeterminada: false,
  conexion: 'lan',
  destinoUsb: '',
  ip: '192.168.1.23',
  puerto: '9100',
  ancho: 80,
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
  const [pruebaDe, setPruebaDe] = useState(null) // impresora del modal de prueba
  const [eliminarId, setEliminarId] = useState(null)
  const [verColaAbierta, setVerColaAbierta] = useState(false)
  const [filtroActividad, setFiltroActividad] = useState('')
  const [seleccionados, setSeleccionados] = useState([])
  const [reparando, setReparando] = useState(false)
  const [puentesAbiertos, setPuentesAbiertos] = useState(false)
  const [equiposAbiertos, setEquiposAbiertos] = useState(false)
  const [filtroRango, setFiltroRango] = useState('hoy')
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [detalleAbierto, setDetalleAbierto] = useState('')
  const [sufijos, setSufijos] = useState({})
  const [confirmandoId, setConfirmandoId] = useState('')
  const [puenteEdit, setPuenteEdit] = useState(null)
  const [puenteProbando, setPuenteProbando] = useState('')
  const [puenteEstado, setPuenteEstado] = useState({})

  const consultar = useCallback(async () => {
    setCargando(true)
    const agente = await estadoAgente({ forzar: true })
    setEstado(agente)
    const config = configImpresora()
    if (agente.disponible && config.token) {
      try {
        const [actividad, trabajos] = await Promise.all([historialAgente(60), colaAgente()])
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

  const puentePrincipal = puenteDe(store)

  // Método honesto de cada impresora: `usb:` es una cola CUPS local (puede
  // salir por red o por USB físico), no un cable.
  function metodoDe(impresora) {
    const destino = String(impresora?.destino || '')
    if (!destino) return 'Sin destino'
    if (/^(usb|cups):/.test(destino)) {
      const tipo = destino === predeterminada?.destino ? estado?.red?.colaTipo : ''
      if (tipo === 'red') return 'CUPS · sale por red'
      if (tipo === 'usb') return 'CUPS · USB físico'
      return 'CUPS (cola local)'
    }
    return 'LAN (TCP directo)'
  }

  // Actividad: filtra el historial del agente y arma el CSV exportable.
  const historialFiltrado = historial.filter((fila) => {
    if (filtroActividad && fila.impresora !== filtroActividad) return false
    if (filtroTipo === 'prueba' && !String(fila.tipo || '').startsWith('prueba') && !fila.validacion) return false
    if (filtroTipo === 'venta' && fila.validacion) return false
    if (filtroRango !== 'todo') {
      const visto = new Date(fila.fecha || 0).getTime()
      const dias = filtroRango === 'hoy' ? 1 : 7
      if (!Number.isFinite(visto) || Date.now() - visto > dias * 24 * 60 * 60 * 1000) return false
    }
    return true
  })

  function exportarActividad() {
    const filas = [['Fecha', 'Usuario', 'Equipo', 'Impresora', 'Modo', 'Puente', 'Validación', 'Sufijo', 'Resultado', 'Bytes', 'Trabajo']]
    for (const fila of historialFiltrado) {
      filas.push([fila.fecha, fila.usuario, fila.cliente, fila.impresora, fila.modo, fila.puente, fila.validacion, fila.sufijo, fila.resultado, fila.bytes, fila.ref])
    }
    const csv = filas.map((columnas) => columnas.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    enlace.download = `mobos-impresion-${new Date().toISOString().slice(0, 10)}.csv`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  async function confirmarEnPapel(fila) {
    const sufijo = String(sufijos[fila.jobId] ?? '').trim()
    if (!sufijo) return toast.error('Falta el número', 'Escribí el número secreto que salió impreso después del guion.')
    setConfirmandoId(fila.jobId)
    try {
      await confirmarJob(fila.jobId, sufijo)
      toast.success('Confirmado en papel', 'El número coincide con el impreso: el trabajo quedó verificado.')
      setSufijos((actual) => ({ ...actual, [fila.jobId]: '' }))
      await consultar()
    } catch (cause) {
      toast.error('No coincide', cause?.message || 'El número secreto no es el del papel.')
    } finally { setConfirmandoId('') }
  }

  function estadoDe(impresora) {
    if (!estado?.disponible) return { label: 'Agente desconectado', color: 'slate' }
    if (!impresora.destino) return { label: 'Error de configuración', color: 'red' }
    if (impresora.ultimaPrueba?.ok) return { label: 'Prueba exitosa', color: 'green' }
    if (/^(usb|cups)$/.test(impresora.conexion || '') || /^(usb|cups):/.test(String(impresora.destino || ''))) {
      const detectada = (estado.impresoras?.usb || []).includes(String(impresora.destino || '').slice(String(impresora.destino || '').indexOf(':') + 1))
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
      conexion: impresora.conexion === 'usb' ? 'cups' : impresora.conexion,
      puenteId: impresora.bridgeId || '',
      destinoUsb: /^(usb|cups):/.test(destino) ? destino.slice(destino.indexOf(':') + 1) : '',
      ip: ip || '192.168.1.23',
      puerto: puerto || '9100',
      ancho: impresora.ancho,
      copias: impresora.copias,
      corte: impresora.corte,
      densidad: impresora.densidad || 3,
      caracteres: impresora.caracteres,
    })
  }

  const destinoDelFormulario = (f) => (f.conexion === 'cups' ? `cups:${f.destinoUsb.trim()}` : `lan:${f.ip.trim()}:${f.puerto.trim() || '9100'}`)

  async function guardarFormulario({ probar = false } = {}) {
    const f = formulario
    if (!f) return
    const destino = destinoDelFormulario(f)
    if (!f.nombre.trim()) return toast.error('Falta el nombre', 'Poné un nombre visible para reconocer la impresora.')
    if (!destino || (f.conexion === 'cups' && destino === 'cups:') || (f.conexion === 'lan' && (!f.ip.trim() || !f.puerto.trim()))) return toast.error('Falta el destino', f.conexion === 'cups' ? 'Elegí la cola CUPS.' : 'Completá la IP y el puerto.')
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
      bridgeId: f.puenteId || '',
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
    setPruebaDe(impresora)
  }

  async function enviarPrueba({ tipo, copias, ticket }) {
    const impresora = pruebaDe
    if (!impresora || probandoId) return
    setProbandoId(impresora.id)
    setProgreso('Enviando al agente…')
    const puente = puenteDe(store, impresora)
    const resultado = await imprimirTicketDirecto(ticket, {
      impresora: impresora.destino,
      copias,
      usuario: sesion?.nombre || usuario?.name || '',
      ref: ticket.ref,
      tipo,
      validacion: ticket.validacion,
      puente: puente.nombre,
      tokenPista: enmascararToken(puente.token),
      modo: impresora.conexion,
      ancho: impresora.ancho,
    })
    if (resultado.ok) {
      const encolado = Boolean(resultado.encolado)
      setProgreso(encolado ? 'Encolada…' : 'Impresión enviada…')
      const siguiente = {
        ...store,
        impresoras: store.impresoras.map((item) => (item.id === impresora.id ? { ...item, ultimaPrueba: { ok: !encolado, encolado, fecha: new Date().toISOString(), tipo, ref: ticket.ref, validacion: ticket.validacion, metodo: metodoDe(impresora), transporte: resultado.transporte || '', corte: Boolean(ticket.corte) } } : item)),
      }
      guardarImpresoras(tenantId, siguiente)
      setStore(siguiente)
      if (encolado) {
        toast.success('Prueba encolada', 'La impresora no respondió; el agente reintenta solo.')
      } else {
        const via = resultado.transporte === 'cups' ? 'por la cola CUPS' : resultado.transporte === 'usb' ? 'por USB' : 'por TCP'
        toast.success(`Prueba enviada ${via}`, 'El agente confirmó el envío. La confirmación final es visual: verificá el código en el papel y que se cortó solo.')
      }
    } else {
      setProgreso('La impresora no respondió.')
      toast.error('No se pudo imprimir', resultado.error)
    }
    setProbandoId(null)
    setPruebaDe(null)
    consultar()
  }

  async function diagnosticar(impresora = null) {
    if (diagnosticando) return
    const destino = impresora?.destino || configImpresora().impresora || ''
    if (!destino) {
      setDiagnostico({ ok: true, sinDestino: true, mensaje: 'No hay impresora configurada.' })
      return
    }
    setDiagnosticando(true)
    setDiagnostico(null)
    try {
      setDiagnostico({ destino, ...(await diagnosticoAgente(destino)) })
    } catch (cause) {
      setDiagnostico({ ok: false, error: cause?.message || 'No se pudo consultar el diagnóstico.' })
    } finally { setDiagnosticando(false) }
  }

  function guardarPuenteFormulario() {
    const f = puenteEdit
    if (!f) return
    if (!String(f.url || '').trim()) return toast.error('Falta la dirección', 'Completá la URL del puente (por ejemplo http://192.168.100.110:17890).')
    const lista = Array.isArray(store.bridges) ? [...store.bridges] : []
    const original = lista.find((item) => item.id === f.id)
    const puente = {
      id: f.id || `puente-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      nombre: String(f.nombre || '').trim() || 'Computadora puente',
      url: String(f.url).trim().replace(/\/+$/, ''),
      token: f.token ? String(f.token) : (original?.token || ''),
      predeterminado: Boolean(f.predeterminado) || lista.length === 0,
    }
    const siguiente = lista.some((item) => item.id === puente.id)
      ? lista.map((item) => (item.id === puente.id ? puente : item))
      : [...lista, puente]
    setStore(guardarPuentes(tenantId, siguiente))
    setPuenteEdit(null)
    toast.success('Puente guardado', puente.url)
  }

  function eliminarPuente(id) {
    const lista = (store.bridges || []).filter((puente) => puente.id !== id)
    setStore(guardarPuentes(tenantId, lista))
    toast.success('Puente eliminado', 'Las impresoras que lo usaban vuelven al predeterminado.')
  }

  async function probarPuente(puente) {
    if (puenteProbando) return
    setPuenteProbando(puente.id)
    try {
      const resultado = await estadoDePuente(puente)
      setPuenteEstado((mapa) => ({ ...mapa, [puente.id]: resultado }))
      toast.success('Puente conectado', `v${resultado.version}${resultado.equipo ? ` · ${resultado.equipo}` : ''}`)
    } catch (cause) {
      setPuenteEstado((mapa) => ({ ...mapa, [puente.id]: { disponible: false, error: cause?.message || '' } }))
      toast.error('Sin respuesta', cause?.message || 'No se pudo consultar el puente.')
    } finally { setPuenteProbando('') }
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

  async function limpiar(ids = []) {
    try {
      const resultado = await limpiarFallidos(ids)
      setSeleccionados([])
      toast.success('Cola limpia', `${resultado?.limpiados || 0} trabajo(s) fallido(s) quitado(s).`)
    } catch (cause) { toast.error('No se pudo limpiar la cola', cause?.message) }
    consultar()
  }

  async function repararConexion() {
    if (reparando) return
    setReparando(true)
    try {
      const resultado = await repararRed()
      if (resultado.cups?.ok) toast.success('Cola CUPS disponible', `${resultado.cups.cola}${resultado.cups.uri ? ` · ${resultado.cups.uri}` : ''}`)
  else if (resultado.cups?.motivo) toast.info('Sin cola CUPS', resultado.cups.motivo)
  if (resultado.agregado) toast.success('IP secundaria lista', `${resultado.alias} en ${resultado.iface || 'la interfaz activa'}. ${resultado.impresoraOk ? 'La impresora responde.' : 'La impresora todavía no responde.'}`)
      else toast.error('No se pudo agregar la IP secundaria', resultado.permiso || 'Revisá el permiso de administrador.')
    } catch (cause) { toast.error('No se pudo reparar la red', cause?.message) }
    setReparando(false)
    consultar()
  }

  function exportarDiagnostico() {
    const datos = {
      generado: new Date().toISOString(),
      agente: {
        disponible: Boolean(estado?.disponible),
        version: estado?.version || null,
        equipo: estado?.equipo || null,
        host: estado?.host || null,
        direccion: store.agentUrl || URL_AGENTE,
        token: enmascararToken(store.agentToken), // nunca el token completo
      },
      impresoras: (store.impresoras || []).map((item) => ({
        nombre: item.nombre,
        destino: item.destino,
        conexion: item.conexion,
        ancho: item.ancho,
        copias: item.copias,
        predeterminada: Boolean(item.predeterminada),
        activa: item.activa,
        ultimaPrueba: item.ultimaPrueba ? { fecha: item.ultimaPrueba.fecha, tipo: item.ultimaPrueba.tipo, resultado: item.ultimaPrueba.ok ? 'confirmado-por-tcp' : item.ultimaPrueba.encolado ? 'encolado' : 'fallido', ref: item.ultimaPrueba.ref, corte: Boolean(item.ultimaPrueba.corte) } : null,
      })),
      red: {
        alias: estado?.alias || null,
        cliente: estado?.cliente || null,
      },
      cola: { pendientes: estado?.cola?.pendientes ?? 0, fallidos: estado?.cola?.fallidos ?? 0 },
      diagnostico,
    }
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(blob)
    enlace.download = `mobos-diagnostico-impresion-${new Date().toISOString().slice(0, 10)}.json`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
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
              <p className="mt-1 truncate text-xs text-mute" title={puentePrincipal.url}>{puentePrincipal.nombre} · {puentePrincipal.url.includes('127.0.0.1') || puentePrincipal.url.includes('localhost') ? 'solo esta computadora' : puentePrincipal.url}</p>
              <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-fono-light" onClick={() => setPuentesAbiertos(true)}>Gestionar puentes ({(store.bridges || []).length})</Button>
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
                {(fallidos.length > 0) && <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-warn" onClick={() => reintentar()}>Reintentar fallidos</Button>}
                {(fallidos.length > 0) && <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-bad" onClick={() => limpiar([])}>Limpiar fallidos</Button>}
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
        {estado?.disponible && estado.alias && !estado.alias.presente && (configImpresora().impresora || store.impresoras.some((item) => String(item.destino || '').startsWith('lan:'))) && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
            La IP secundaria <b className="text-fore">{estado.alias.ip}</b> (red de la impresora) no está agregada: se pierde al reiniciar o cambiar de red. El agente la recrea solo al iniciar la Mac; si no, usá <b className="text-fore">Reparar conexión</b>.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => diagnosticar(null)} disabled={diagnosticando || !estado?.disponible}>{diagnosticando ? 'Consultando…' : 'Diagnóstico de red'}</Button>
          <Button type="button" variant="outline" onClick={repararConexion} disabled={reparando || !estado?.disponible}>{reparando ? 'Reparando…' : 'Reparar conexión'}</Button>
          <Button type="button" variant="ghost" onClick={exportarDiagnostico}>Exportar diagnóstico</Button>
        </div>
        {diagnostico && (
          <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-mute">Diagnóstico de red{diagnostico.destino ? ` · ${diagnostico.destino}` : ''}</p>
            {diagnostico.ok === false && <p role="alert" className="mt-1 text-bad">{diagnostico.error}</p>}
            {diagnostico.sinDestino && <p className="mt-1 text-mute">{diagnostico.mensaje || 'No hay impresora configurada.'}</p>}
            {diagnostico.ok && !diagnostico.sinDestino && <ExplicacionDiagnostico diagnostico={diagnostico} estado={estado} nombre={predeterminada?.nombre} />}
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
                  <span>Método: <b className="text-fore">{metodoDe(impresora)}</b></span>
                  <span>Ancho: <b className="text-fore">{impresora.ancho} mm</b></span>
                  <span>Copias: <b className="text-fore">{impresora.copias}</b></span>
                  {impresora.ubicacion && <span>Ubicación: <b className="text-fore">{impresora.ubicacion}</b></span>}
                </div>
                <p className="text-xs text-mute">Última prueba: <b className="text-fore">{impresora.ultimaPrueba ? `${impresora.ultimaPrueba.ok ? 'Impresa correctamente' : impresora.ultimaPrueba.encolado ? 'Encolada' : 'Falló'} · ${TIPOS_TICKET_PRUEBA[impresora.ultimaPrueba.tipo] || 'Prueba'} · ${fmt(impresora.ultimaPrueba.fecha)}${impresora.ultimaPrueba.transporte ? ` · vía ${impresora.ultimaPrueba.transporte}` : ''}${impresora.ultimaPrueba.validacion ? ` · Código ${impresora.ultimaPrueba.validacion}` : ''}${impresora.ultimaPrueba.corte ? ' · Corte solicitado ✓' : ''}` : 'Sin prueba todavía'}</b></p>
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="printer" className="h-4 w-4 text-mute" />Actividad de impresión</h3>
            <p className="mt-1 text-sm text-mute">Trabajos que pasaron por el agente. Cada prueba tiene un número secreto impreso: escribilo para confirmar que el papel salió.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Rango de actividad" className="w-28" value={filtroRango} onChange={(event) => setFiltroRango(event.target.value)}>
              <option value="hoy">Hoy</option>
              <option value="7d">7 días</option>
              <option value="todo">Todo</option>
            </Select>
            <Select aria-label="Tipo de trabajo" className="w-32" value={filtroTipo} onChange={(event) => setFiltroTipo(event.target.value)}>
              <option value="todas">Todas</option>
              <option value="prueba">Pruebas</option>
              <option value="venta">Ventas</option>
            </Select>
            <Button type="button" variant="ghost" onClick={exportarActividad} disabled={!historialFiltrado.length}><Icon name="download" className="h-3.5 w-3.5" />CSV</Button>
            {filtroActividad && <Button type="button" variant="outline" onClick={() => setFiltroActividad('')}>Quitar filtro</Button>}
          </div>
        </div>
        {!historialFiltrado.length ? (
          <EmptyState compact icon="receipt" title="Todavía no hay impresiones en este rango." description="Cuando imprimas un comprobante o una prueba, queda acá." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Impresora</th>
                  <th className="px-2 py-2">Modo</th>
                  <th className="px-2 py-2">Puente</th>
                  <th className="px-2 py-2">Validación</th>
                  <th className="px-2 py-2">Confirmar en papel</th>
                  <th className="px-2 py-2 text-right">Resultado</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {historialFiltrado.map((fila, indice) => {
                  const clave = fila.jobId || `${fila.fecha}-${indice}`
                  const abierto = detalleAbierto === clave
                  return [
                    <tr key={`fila-${clave}`} className="border-b border-ink-600/50">
                      <td className="px-2 py-2 text-xs text-mute">{fmt(fila.fecha)}</td>
                      <td className="px-2 py-2 text-xs">{fila.usuario || '—'}</td>
                      <td className="px-2 py-2 truncate text-xs text-mute" title={`${fila.impresora}${fila.ancho ? ` · ${fila.ancho} mm` : ''}`}>{fila.impresora}</td>
                      <td className="px-2 py-2 text-xs text-mute" title={fila.modo === 'usb' ? 'Cola CUPS local' : fila.modo === 'lan' ? 'LAN (TCP directo)' : undefined}>{fila.modo === 'usb' ? 'CUPS' : fila.modo === 'lan' ? 'LAN' : conexionDe(fila.impresora)}</td>
                      <td className="px-2 py-2 truncate text-xs text-mute" title={`${fila.puente || '—'}${fila.tokenPista ? ` · token ${fila.tokenPista}` : ''}`}>{fila.puente || '—'}</td>
                      <td className="px-2 py-2 text-xs font-semibold" title={fila.tipo ? `Tipo: ${fila.tipo}` : undefined}>{fila.validacion || '—'}</td>
                      <td className="px-2 py-2">
                        {fila.resultado === 'aceptado' && fila.validacion ? (
                          <span className="flex items-center gap-1">
                            <input value={sufijos[fila.jobId] || ''} onChange={(event) => setSufijos((actual) => ({ ...actual, [fila.jobId]: event.target.value.replace(/\D/g, '').slice(0, 2) }))} inputMode="numeric" maxLength={2} placeholder="número" aria-label={`Número secreto de la validación ${fila.validacion}`} className="w-16 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-center text-xs" />
                            <button type="button" onClick={() => confirmarEnPapel(fila)} disabled={confirmandoId === fila.jobId} className="rounded-lg border border-ok/40 px-2 py-1 text-[10px] font-bold text-ok transition hover:bg-ok/10 disabled:opacity-50">{confirmandoId === fila.jobId ? '…' : 'Confirmar'}</button>
                          </span>
                        ) : fila.resultado === 'confirmado' ? (
                          <span className="text-xs font-semibold text-ok">✓ en papel</span>
                        ) : (
                          <span className="text-xs text-mute">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Badge color={COLOR_RESULTADO[fila.resultado] || 'slate'}>{fila.resultado}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button type="button" variant="ghost" className="h-auto px-1 py-1" onClick={() => setDetalleAbierto(abierto ? '' : clave)} aria-expanded={abierto} aria-label={abierto ? 'Ocultar detalle' : 'Ver detalle'}>
                          <Icon name="chevron" className={`h-3.5 w-3.5 transition ${abierto ? 'rotate-180' : ''}`} />
                        </Button>
                      </td>
                    </tr>,
                    abierto ? (
                      <tr key={`detalle-${clave}`} className="border-b border-ink-600/50 bg-ink-800/40">
                        <td colSpan={9} className="px-3 py-3">
                          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                            {[
                              ['Trabajo', fila.jobId || '—'],
                              ['Referencia', fila.ref || '—'],
                              ['Destino', fila.impresora || '—'],
                              ['Ancho', fila.ancho ? `${fila.ancho} mm` : '—'],
                              ['Token', fila.tokenPista || 'sin token'],
                              ['Bytes', String(fila.bytes || 0)],
                              ['Confirmado', fila.confirmadoEn ? fmt(fila.confirmadoEn) : '—'],
                              ['Error', fila.error || '—'],
                            ].map(([etiqueta, valor]) => (
                              <div key={etiqueta} className="flex justify-between gap-2 border-b border-ink-600/40 pb-1">
                                <dt className="text-mute">{etiqueta}</dt>
                                <dd className="truncate text-fore" title={String(valor)}>{valor}</dd>
                              </div>
                            ))}
                          </dl>
                          {(fila.resultado === 'fallido' || fila.resultado === 'incierto') && (
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              <Button type="button" variant="ghost" className="text-bad" onClick={() => limpiar([fila.jobId])}>Limpiar este trabajo</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
        {pendientes.length > 0 && <p className="text-xs text-mute">{pendientes.length} trabajo(s) esperando impresión.</p>}
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="users" className="h-4 w-4 text-mute" />Equipos con acceso</h3>
            <p className="mt-1 text-sm text-mute">Sesiones de la empresa: en verde las que estuvieron activas en los últimos 15 minutos.</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => setEquiposAbiertos((actual) => !actual)} aria-expanded={equiposAbiertos}>
            <Icon name="chevron" className={`h-3.5 w-3.5 transition ${equiposAbiertos ? 'rotate-180' : ''}`} />
            {equiposAbiertos ? 'Ocultar' : `Ver ${sesiones?.length || 0}`}
          </Button>
        </div>
        {equiposAbiertos && (sesiones === null ? (
          <Skeleton className="h-16 w-full" />
        ) : !sesiones.length ? (
          <EmptyState compact icon="users" title="No hay sesiones registradas." />
        ) : (
          <div className="space-y-2">
            {sesiones.map((activa) => (
              <div key={activa.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar user={activa.user} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{activa.user?.name || 'Acceso de empresa'}</p>
                    <p className="mt-0.5 truncate text-xs text-mute">{activa.user?.role || activa.level} · {activa.deviceId || 'Dispositivo no identificado'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-mute">{hace(activa.lastSeenAt)}</span>
                  <Badge color={sesionActiva(activa) ? 'green' : 'slate'}>{sesionActiva(activa) ? 'Activa' : 'Sin sesión reciente'}</Badge>
                </div>
              </div>
            ))}
          </div>
        ))}
      </Card>

      {formulario && (
        <FormularioImpresora
          formulario={formulario}
          setFormulario={setFormulario}
          estado={estado}
          tokenGuardado={store.agentToken}
          agentUrl={puenteDe(store, { bridgeId: formulario.puenteId }).url}
          bridges={store.bridges || []}
          onGuardar={guardarFormulario}
        />
      )}

      {pruebaDe && (
        <ModalPrueba
          impresora={pruebaDe}
          metodo={metodoDe(pruebaDe)}
          usuario={sesion?.nombre || usuario?.name || ''}
          puente={puenteDe(store, pruebaDe).nombre}
          tokenPista={enmascararToken(puenteDe(store, pruebaDe).token)}
          equipo={estado?.equipo || puentePrincipal.url}
          enviando={Boolean(probandoId)}
          progreso={progreso}
          onCerrar={() => setPruebaDe(null)}
          onEnviar={enviarPrueba}
        />
      )}

      <Modal open={puentesAbiertos} onClose={() => { setPuentesAbiertos(false); setPuenteEdit(null) }} title="Puentes de impresión" className="max-w-2xl">
        <div className="space-y-4">
          <p className="text-sm text-mute">Cada puente es una computadora con el agente instalado. Cada impresora usa su puente; sin elección, usa el predeterminado.</p>
          <div className="space-y-2">
            {(store.bridges || []).map((puente) => {
              const visto = puenteEstado[puente.id]
              return (
                <div key={puente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {puente.nombre}
                      {puente.predeterminado && <Badge color="blue">Predeterminado</Badge>}
                      {visto && <Badge color={visto.disponible ? 'green' : 'red'}>{visto.disponible ? `v${visto.version || ''}` : 'sin respuesta'}</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-mute" title={puente.url}>{puente.url}{puente.token ? ` · token ${enmascararToken(puente.token)}` : ' · sin token'}</p>
                    {visto && !visto.disponible && <p className="mt-0.5 text-xs text-bad">{visto.error}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" onClick={() => probarPuente(puente)} disabled={puenteProbando === puente.id}>{puenteProbando === puente.id ? 'Probando…' : 'Probar'}</Button>
                    <Button type="button" variant="ghost" onClick={() => setPuenteEdit({ ...puente, token: '' })}>Editar</Button>
                    {(store.bridges || []).length > 1 && <Button type="button" variant="ghost" className="text-bad" onClick={() => eliminarPuente(puente.id)}>Eliminar</Button>}
                  </div>
                </div>
              )
            })}
          </div>
          {puenteEdit ? (
            <div className="space-y-3 rounded-xl border border-ink-600 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Nombre" htmlFor="puente-nombre">
                  <Input id="puente-nombre" value={puenteEdit.nombre} onChange={(event) => setPuenteEdit((actual) => ({ ...actual, nombre: event.target.value }))} placeholder="Mac del local" />
                </FormField>
                <FormField label="Dirección" htmlFor="puente-url">
                  <Input id="puente-url" value={puenteEdit.url} onChange={(event) => setPuenteEdit((actual) => ({ ...actual, url: event.target.value }))} placeholder={URL_AGENTE} autoCapitalize="off" spellCheck={false} />
                </FormField>
                <FormField label="Token" htmlFor="puente-token" hint={puenteEdit.id && !puenteEdit.token ? 'Dejalo vacío para conservar el guardado.' : 'Lo muestra el instalador del agente.'}>
                  <Input id="puente-token" value={puenteEdit.token} onChange={(event) => setPuenteEdit((actual) => ({ ...actual, token: event.target.value }))} autoCapitalize="off" spellCheck={false} />
                </FormField>
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-fono)]" checked={Boolean(puenteEdit.predeterminado)} onChange={(event) => setPuenteEdit((actual) => ({ ...actual, predeterminado: event.target.checked }))} />
                  Puente predeterminado
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPuenteEdit(null)}>Cancelar</Button>
                <Button type="button" onClick={guardarPuenteFormulario}>Guardar puente</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setPuenteEdit({ id: '', nombre: '', url: URL_AGENTE, token: '', predeterminado: (store.bridges || []).length === 0 })}><Icon name="plus" className="h-3.5 w-3.5" />Agregar puente</Button>
          )}
        </div>
      </Modal>

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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-bad">Fallidos ({fallidos.length})</h4>
                    <label className="flex items-center gap-1.5 text-xs text-mute">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-fono)]" checked={seleccionados.length === fallidos.length && fallidos.length > 0} onChange={(event) => setSeleccionados(event.target.checked ? fallidos.map((trabajo) => trabajo.id) : [])} />
                      Seleccionar todos
                    </label>
                  </div>
                  <TablaTrabajos trabajos={fallidos} seleccionados={seleccionados} onSeleccion={(id, marcado) => setSeleccionados((actual) => (marcado ? [...actual, id] : actual.filter((item) => item !== id)))} />
                </section>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {fallidos.length > 0 && <Button type="button" variant="outline" onClick={() => reintentar()}>Reintentar fallidos</Button>}
            {fallidos.length > 0 && <Button type="button" variant="ghost" disabled={!seleccionados.length} onClick={() => limpiar(seleccionados)}>Limpiar seleccionados ({seleccionados.length})</Button>}
            {fallidos.length > 0 && <Button type="button" variant="ghost" onClick={() => limpiar([])}>Limpiar todos</Button>}
            <Button type="button" variant="outline" onClick={consultar}>Actualizar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TablaTrabajos({ trabajos, seleccionados = [], onSeleccion }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
            {onSeleccion && <th className="w-8 px-2 py-2" />}
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
              {onSeleccion && <td className="px-2 py-2"><input type="checkbox" className="h-3.5 w-3.5 accent-[var(--color-fono)]" checked={seleccionados.includes(trabajo.id)} onChange={(event) => onSeleccion(trabajo.id, event.target.checked)} aria-label={`Seleccionar ${trabajo.id}`} /></td>}
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

function ExplicacionDiagnostico({ diagnostico, estado, nombre }) {
  const destino = String(diagnostico.destino || '')
  const metodo = diagnostico.metodo || (/^(usb|cups):/.test(destino) ? 'CUPS' : 'LAN')
  const host = diagnostico.host || (destino.startsWith('lan:') ? destino.slice(4).split(':')[0] : '')
  const puerto = diagnostico.puerto || (destino.startsWith('lan:') ? destino.slice(4).split(':')[1] || '9100' : '—')
  const interfaces = diagnostico.interfaces || []
  const subred = (ip) => ip.split('.').slice(0, 3).join('.')
  // Alias presente o una interfaz en la subred de la impresora equivalen a
  // "misma red": no corresponde pedir una IP secundaria.
  const aliasPresente = diagnostico.alias?.presente === true || estado?.alias?.presente === true
  const mismaRed = Boolean(host) && (aliasPresente || interfaces.some((ip) => subred(ip) === subred(host)))
  const cupsDisponible = Boolean(diagnostico.cups)
  const filas = [
    ['Método', metodo],
    ['Impresora', nombre || '—'],
    ['IP', host || '—'],
    ['Puerto', puerto],
    ['Agente', estado?.disponible ? `v${estado.version || ''} en ${estado.equipo || 'el puente'}` : 'desconectado'],
    ['IP secundaria', aliasPresente ? `presente (${diagnostico.alias?.ip || estado?.alias?.ip || '—'})` : 'ausente'],
    ['Subred de la Mac', interfaces.length ? interfaces.map((ip) => `${ip} (${subred(ip)}.x)`).join(' · ') : '—'],
    ['Resultado TCP', diagnostico.alcance ? 'responde ✓' : 'no responde ✗'],
    ...(cupsDisponible ? [['Cola CUPS', `disponible (${diagnostico.cups})`]] : []),
    ...(diagnostico.transporte ? [['Transporte', diagnostico.transporte === 'directo' ? 'directo (TCP)' : diagnostico.transporte === 'cups' ? `respaldo CUPS (${diagnostico.cups || 'MobOS_LAN'})` : 'sin transporte']] : []),
    ...(diagnostico.alcance ? [] : [['Error TCP', diagnostico.error || 'EHOSTUNREACH sin detalle']]),
  ]
  return (
    <div className="mt-1 space-y-2 text-xs">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex justify-between gap-2 border-b border-ink-600/40 pb-1">
            <dt className="text-mute">{etiqueta}</dt>
            <dd className={etiqueta === 'Resultado TCP' ? (diagnostico.alcance ? 'text-ok' : 'text-bad') : 'text-fore'}>{valor}</dd>
          </div>
        ))}
      </dl>
      {metodo === 'CUPS' && (
        <p className="text-mute">
          Cola CUPS de la computadora puente{diagnostico.cupsUri ? <> · URI real: <b className="text-fore">{diagnostico.cupsUri}</b>{String(diagnostico.cupsUri).startsWith('socket://') ? ' (sale por red, no por cable USB)' : String(diagnostico.cupsUri).startsWith('usb://') ? ' (USB físico)' : ''}</> : null}
        </p>
      )}
      {metodo === 'LAN' && diagnostico.alcance && <p className="text-ok">La impresora responde por TCP: la conexión está lista.</p>}
      {metodo === 'LAN' && !diagnostico.alcance && !mismaRed && !aliasPresente && (
        <div className="space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-2">
          <p className="font-semibold text-warn">La Mac necesita una IP secundaria para alcanzar la impresora.</p>
          <p className="text-mute">La impresora está en {host} (subred {subred(host)}.x) y la Mac en {interfaces.length ? subred(interfaces[0]) : '—'}.x: no están en la misma subred. En el puente corré:</p>
          <code className="block rounded bg-ink-700 p-2 text-fore">bash print-agent/red-mac.sh agregar</code>
          <p className="text-mute">Agrega {host.split('.').slice(0, 3).join('.')}.100 sin tocar el DHCP ni el internet, y es reversible con <code className="rounded bg-ink-700 px-1">red-mac.sh quitar</code>.</p>
        </div>
      )}
      {metodo === 'LAN' && !diagnostico.alcance && diagnostico.motivo === 'red_cambiada' && (
        <div className="space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-2">
          <p className="font-semibold text-warn">La impresora no está en esta red.</p>
          <p className="text-mute">No hay ruta hacia {host}: la computadora puente pudo cambiar de Wi‑Fi/red, o la impresora cambió de IP. Conectá la Mac a la red de la impresora (o corregí la IP) y volvé a probar. No es un permiso de macOS.</p>
        </div>
      )}
      {metodo === 'LAN' && !diagnostico.alcance && (!diagnostico.motivo || diagnostico.motivo === 'permisos_red_local') && aliasPresente && (
        <div className="space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-2">
          <p className="font-semibold text-warn">El agente automático no puede salir a la red (permiso de macOS).</p>
          <p className="text-mute">La IP secundaria está presente y <code className="rounded bg-ink-700 px-1">nc -s {diagnostico.alias?.ip || estado?.alias?.ip || '192.168.1.100'}</code> conecta, pero el proceso de launchd no: el agente ya usa bind al alias, así que falta el <b className="text-fore">permiso de Red Local</b>. En el puente: <b className="text-fore">Ajustes → Privacidad y seguridad → Red local</b> → habilitá <b className="text-fore">node</b> (o reinstalá con <code className="rounded bg-ink-700 px-1">bash print-agent/install-macos.sh</code>, que abre el panel). Después usá <b className="text-fore">Reparar conexión → Imprimir prueba</b>.</p>
        </div>
      )}
      {metodo === 'LAN' && !diagnostico.alcance && !aliasPresente && mismaRed && (
        <p className="text-bad">El TCP directo no responde ({cupsDisponible ? `la cola CUPS ${diagnostico.cups} queda como respaldo` : 'revisá que esté encendida, el cable LAN y el puerto'}). Revisá que la impresora esté encendida, el cable LAN y el puerto {puerto} siga abierto.</p>
      )}
    </div>
  )
}

function FormularioImpresora({ formulario, setFormulario, estado, tokenGuardado, agentUrl, bridges = [], onGuardar }) {
  const [validacion, setValidacion] = useState(null)
  const [validando, setValidando] = useState(false)
  const f = formulario
  const set = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }))
  const destino = f.conexion === 'cups' ? `cups:${f.destinoUsb.trim()}` : `lan:${f.ip.trim()}:${f.puerto.trim() || '9100'}`
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
            {[['cups', 'CUPS local'], ['lan', 'LAN (TCP directo)']].map(([valor, etiqueta]) => (
              <button key={valor} type="button" onClick={() => set({ conexion: valor })} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${f.conexion === valor ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore'}`}>{etiqueta}</button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {f.conexion === 'cups' ? (
              <FormField label="Cola CUPS local" htmlFor="imp-usb" hint="Una cola CUPS puede salir por red (socket://) o por USB físico (usb://); la URI real la informa el agente.">
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
                <div className="mt-2 text-xs text-mute">
                  {validacion.ok === false ? <span className="text-bad">{validacion.error}</span> : <ExplicacionDiagnostico diagnostico={validacion} estado={estado} nombre={f.nombre} />}
                </div>
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
            <FormField label="Puente" htmlFor="imp-puente">
              <Select id="imp-puente" value={f.puenteId || ''} onChange={(event) => set({ puenteId: event.target.value })}>
                <option value="">Puente predeterminado</option>
                {bridges.map((puente) => <option key={puente.id} value={puente.id}>{puente.nombre}{puente.predeterminado ? ' (predeterminado)' : ''}</option>)}
              </Select>
            </FormField>
            <FormField label="Dirección del puente" htmlFor="imp-agente-url">
              <Input id="imp-agente-url" value={agentUrl} onChange={() => {}} readOnly />
            </FormField>
          </div>
          {tokenGuardado && <p className="mt-2 text-xs text-mute">Token del puente: <b className="text-fore">{tokenEnmascarado}</b>. Se administra desde “Gestionar puentes”.</p>}
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

function ModalPrueba({ impresora, metodo, usuario, puente, tokenPista, equipo, enviando, progreso, onCerrar, onEnviar }) {
  const [tipo, setTipo] = useState('corta')
  const [copias, setCopias] = useState(1)
  const [turno, setTurno] = useState(0) // regenera el ticket (y su número de 4 dígitos)
  const ticket = useMemo(
    () => ticketPruebaTipo(tipo, {
      ancho: impresora.ancho,
      impresora: impresora.destino,
      nombre: impresora.nombre,
      equipo,
      copias,
      metodo,
      conexion: impresora.conexion,
      puente,
      tokenPista,
      usuario,
    }),
    // turno solo dispara la regeneración: un número nuevo por ejecución.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, copias, turno, impresora, equipo, metodo, puente, tokenPista, usuario],
  )
  return (
    <Modal open onClose={enviando ? undefined : onCerrar} title={`Probar: ${impresora.nombre}`} className="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Tipo de prueba" htmlFor="prueba-tipo">
            <Select id="prueba-tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>
              {Object.entries(TIPOS_TICKET_PRUEBA).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </Select>
          </FormField>
          <FormField label="Copias" htmlFor="prueba-copias">
            <Input id="prueba-copias" inputMode="numeric" maxLength={1} value={String(copias)} onChange={(event) => setCopias(Number(event.target.value.replace(/\D/g, '').slice(0, 1) || '1'))} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
          <span>Impresora: <b className="text-fore">{impresora.nombre}</b></span>
          <span>Método: <b className="text-fore">{metodo || conexionDe(impresora.destino)}</b></span>
          <span>Destino: <b className="text-fore">{impresora.destino}</b></span>
          <span>Ancho: <b className="text-fore">{impresora.ancho} mm</b></span>
          <span>Trabajo: <b className="text-fore">{ticket.ref}</b></span>
          <span>Validación: <b className="text-fore">{ticket.validacion}</b></span>
          <span>Corte: <b className="text-fore">solicitado (GS V 0 + ESC i)</b></span>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Vista previa</p>
            <Button type="button" variant="ghost" onClick={() => setTurno((n) => n + 1)} disabled={enviando}><Icon name="refresh" className="h-3.5 w-3.5" />Nuevo número</Button>
          </div>
          <pre className="max-h-80 overflow-y-auto rounded-xl border border-ink-600 bg-ink-900 p-3 font-mono text-[11px] leading-4 text-fore">{ticket.lineas().join('')}</pre>
        </div>
        {tipo === 'corte' && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-xs text-mute">
            La verificación del corte es <b className="text-fore">física</b>: el ticket debe separarse del rollo solo. El éxito por TCP confirma el envío, no la cuchilla. Si no corta, revisá <b className="text-fore">Cutter Enable: YES</b> en la impresora.
          </p>
        )}
        {enviando && <p role="status" className="rounded-lg border border-fono/25 bg-fono/10 p-2 text-xs text-fono-light">{progreso}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={() => onEnviar({ tipo, copias, ticket })} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar e imprimir'}</Button>
        </div>
      </div>
    </Modal>
  )
}
