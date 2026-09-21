import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, ConfirmDialog, EmptyState, FormField, Input, Modal, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { fechaHora as fmt } from '@/utils/fecha'
import { descargarArchivo, descargarCsvCliente } from '@/utils/descargarArchivo'
import { printingApi } from '@/lib/api/printing'
import { URL_AGENTE, cargarImpresoras, colaAgente, configImpresora, confirmarJob, diagnosticoAgente, enmascararToken, esIdBackend, estadoAgente, historialAgente, impresoraHaciaBackend, importarConfigUnaVez, imprimirTicketRouter, limpiarFallidos, puenteDe, refrescarDesdeBackend, registrarUltimaPrueba, reintentarFallidos, repararRed, sincronizarAgente } from '@/lib/printing/agent'
import { TIPOS_TICKET_PRUEBA, ticketPruebaTipo } from '@/lib/printing/tickets'
import { ESTADO_IMPRESORA, ETIQUETA_ESTADO, colorTrabajo, etiquetaTrabajo, textoVerificacion } from '@/lib/printing/estadoImpresoras'
import { colaDemo, historialDemo, storeDemo } from '@/lib/printing/demo'
import { etiquetaTipoImpresion, memoriaDeImpresion, olvidarTipoDeImpresion } from '@/lib/printing/preferencias'
import { useEstadoImpresoras } from '@/hooks/useEstadoImpresoras'
import Avatar from '@/components/shared/Avatar'
import ImpresionComparativa from './ImpresionComparativa'
import ImpresionGraficos from './ImpresionGraficos'
import { ROTULO_SECCION } from '@/components/shared/tabla'

// Día y hora con segundos: la telemetría se mide en milisegundos y la columna
// de actividad tiene que mostrar el segundo exacto, no solo el minuto.
const fmtDia = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PY', { dateStyle: 'short' }) : '—')
const fmtHora = (valor) => (valor ? new Date(valor).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—')
const fmtTiempo = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? `${Math.round(valor)} ms` : '—')
const fechaConSegundos = (valor) => (valor ? `${fmtDia(valor)} ${fmtHora(valor)}` : '—')

// Transporte real que reportó el agente; sin dato se cae al modo configurado.
const etiquetaTransporte = (fila) => {
  const transporte = String(fila.transporte || '').toLowerCase()
  if (transporte === 'directo') return 'LAN directo'
  if (transporte === 'cups') return 'CUPS'
  if (transporte === 'usb') return 'USB'
  if (transporte) return transporte
  if (fila.modo === 'usb') return 'CUPS'
  if (fila.modo === 'lan') return 'LAN'
  return conexionDe(fila.impresora)
}
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
// Un trabajo pendiente sin reporte del puente por más de 10 minutos se marca
// como "sin respuesta": la impresora o el puente no contestaron.
const MINUTOS_SIN_RESPUESTA = 10
function sinRespuesta(fila) {
  const cuando = fila?.fecha ? new Date(fila.fecha).getTime() : 0
  return Boolean(cuando) && Date.now() - cuando > MINUTOS_SIN_RESPUESTA * 60 * 1000
}

// Tono semántico del estado vivo → color/clase del sistema de diseño.
const COLOR_TONO = { ok: 'green', bad: 'red', slate: 'slate', blue: 'blue', orange: 'orange' }
const CLASE_TONO = { ok: 'text-ok', bad: 'text-bad', slate: 'text-mute' }

// Detalle de la última prueba física (una sola línea, sin repetir el chip).
const textoUltimaPrueba = (ultimaPrueba) => {
  if (!ultimaPrueba) return 'Sin prueba todavía'
  const resultado = ultimaPrueba.ok ? 'Impresa correctamente' : ultimaPrueba.remoto && ultimaPrueba.encolado ? 'Encolada al puente' : ultimaPrueba.encolado ? 'Encolada' : 'Falló'
  return `${resultado} · ${TIPOS_TICKET_PRUEBA[ultimaPrueba.tipo] || 'Prueba'} · ${fmt(ultimaPrueba.fecha)}${ultimaPrueba.transporte ? ` · vía ${ultimaPrueba.transporte}` : ''}${ultimaPrueba.validacion ? ` · Código ${ultimaPrueba.validacion}` : ''}${ultimaPrueba.corte ? ' · Corte solicitado ✓' : ''}`
}

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
  branchId: '',
})

// Los trabajos del backend se muestran con la misma forma que el historial del
// agente: la tabla de actividad y la cola no distinguen el origen.
const filaDesdeJob = (job) => ({
  jobId: job.id,
  fecha: job.createdAt,
  enqueuedAt: job.enqueuedAt || job.createdAt,
  reclamadoEn: job.claimedAt || null,
  enColaMs: typeof job.queueMs === 'number' ? job.queueMs : null,
  totalMs: typeof job.durationMs === 'number' ? job.durationMs : null,
  transporte: job.transport || '',
  usuario: job.requestedByName || '',
  impresora: job.destination || '',
  impresoraNombre: job.printerName || '',
  modo: job.mode || '',
  puente: job.bridgeName || '',
  validacion: job.validation || '',
  ref: job.reference || '',
  tipo: job.kind || '',
  resultado: String(job.state || '').toLowerCase(),
  confirmadoEn: job.confirmedAt || null,
  bytes: job.payloadBytes || 0,
  intentos: job.attempts || 0,
  ancho: job.width || 0,
  error: job.error || '',
  suffixLength: Number(job.suffixLength) || 0,
  remoto: true,
})

// Largo máximo del sufijo de confirmación (espejo de MAX_SUFIJO del backend).
const LARGO_SUFIJO_MAX = 8

// Largo del sufijo que hay que escribir para validar en papel (#138). El panel
// lo conoce sin saber el valor: el backend manda `suffixLength` y el agente
// local `sufijoLargo`. 0 = desconocido (trabajo viejo): sin auto-validación,
// queda el botón Confirmar.
const largoDelSufijo = (fila) => {
  const largo = Number(fila?.suffixLength ?? fila?.sufijoLargo ?? 0)
  return Number.isInteger(largo) && largo > 0 ? Math.min(largo, LARGO_SUFIJO_MAX) : 0
}

const filaColaDesdeJob = (job) => ({
  id: job.id,
  creadoEn: job.createdAt,
  impresora: job.destination || '',
  cliente: job.deviceName || '',
  usuario: job.requestedByName || '',
  intentos: job.attempts || 0,
  bytes: job.payloadBytes || 0,
  error: job.error || '',
})

// Firma de los campos que el backend guarda: evita PATCH cuando nada cambió.
const CAMPOS_IMPRESORA = ['nombre', 'marca', 'modelo', 'ubicacion', 'conexion', 'destino', 'ancho', 'copias', 'corte', 'densidad', 'caracteres', 'predeterminada', 'activa', 'bridgeId', 'branchId']
const firmaImpresora = (impresora) => JSON.stringify(CAMPOS_IMPRESORA.map((campo) => impresora?.[campo] ?? null))

// Impresoras: una sola pantalla para configurar, probar y monitorear las
// térmicas. Configuración, estado, cola y actividad en un mismo lugar.
export default function Impresoras() {
  const toast = useToast()
  const { usuario, sesion, perfilEmpresa, esDemo } = useSesion()
  const tenantId = usuario?.tenantId || 'sin-tenant'
  const [store, setStore] = useState(() => cargarImpresoras(tenantId))
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [historial, setHistorial] = useState([])
  const [cola, setCola] = useState(null)
  const [remotos, setRemotos] = useState([])
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
  const [guiaAbierta, setGuiaAbierta] = useState(false)
  const [puenteNuevo, setPuenteNuevo] = useState(null)
  const [creandoPuente, setCreandoPuente] = useState(false)
  const [codigoVinculacion, setCodigoVinculacion] = useState(null)
  const [puenteRevocar, setPuenteRevocar] = useState(null)
  const [equiposAbiertos, setEquiposAbiertos] = useState(false)
  const [filtroRango, setFiltroRango] = useState('hoy')
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [detalleAbierto, setDetalleAbierto] = useState('')
  const [sufijos, setSufijos] = useState({})
  const [confirmandoId, setConfirmandoId] = useState('')
  // Memoria de impresión (#209): impresora recordada por tipo de documento.
  const [memoriaImpresion, setMemoriaImpresion] = useState(() => memoriaDeImpresion())
  // Temporizadores de la auto-validación en papel (#138): uno por trabajo, se
  // cancelan al corregir el código y se limpian al desmontar la pantalla.
  const timersAuto = useRef(new Map())
  // Verdad sincrónica de "hay una confirmación en vuelo": el estado de React
  // llega un render tarde y la validación automática no puede depender de eso
  // (en CI el clic de respaldo tardaba más que el debounce y el intento se
  // descartaba en silencio).
  const confirmandoRef = useRef(false)
  useEffect(() => () => { for (const temporizador of timersAuto.current.values()) clearTimeout(temporizador) }, [])

  const consultar = useCallback(async () => {
    setCargando(true)
    if (esDemo) {
      // Modo demo (#194): datos ficticios en memoria. No se llama al agente
      // local ni al backend real (el demo público no tiene sesión).
      setStore(storeDemo())
      setRemotos([])
      setHistorial(historialDemo())
      setCola(colaDemo())
      setEstado({ disponible: false, version: 'demo', equipo: 'Demo' })
      setSesiones([])
      setMemoriaImpresion(memoriaDeImpresion())
      setCargando(false)
      return
    }
    // Import único de la configuración legacy (solo ADMIN; un 403 se ignora).
    try { await importarConfigUnaVez(tenantId) } catch { /* sin permiso o sin backend */ }
    // El backend manda: pisa la caché. Si no responde, se muestra la última.
    try {
      setStore(await refrescarDesdeBackend(tenantId))
    } catch {
      setStore(cargarImpresoras(tenantId))
    }
    // Cola e historial remotos de la empresa.
    try {
      const datos = await printingApi.trabajos({ limit: 60 })
      setRemotos(datos?.jobs || [])
    } catch { setRemotos([]) }
    // Agente local de esta computadora.
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
    setMemoriaImpresion(memoriaDeImpresion())
    setCargando(false)
  }, [esDemo, tenantId])

  useEffect(() => {
    setStore(cargarImpresoras(tenantId))
    consultar()
    const intervalo = setInterval(consultar, 20000)
    return () => clearInterval(intervalo)
  }, [consultar, tenantId])

  // Difunde a la API la diferencia entre la lista mostrada y la nueva: alta de
  // las locales, edición de las del backend y baja de las que ya no están.
  const difundirCambios = async (anteriores, siguientes) => {
    const previas = new Map(anteriores.map((item) => [item.id, item]))
    const vigentes = new Set(siguientes.map((item) => item.id))
    for (const impresora of siguientes) {
      if (!esIdBackend(impresora.id)) {
        await printingApi.guardarImpresora(null, impresoraHaciaBackend(impresora))
        continue
      }
      const previa = previas.get(impresora.id)
      if (!previa || firmaImpresora(previa) !== firmaImpresora(impresora)) {
        await printingApi.guardarImpresora(impresora.id, impresoraHaciaBackend(impresora))
      }
    }
    for (const previa of anteriores) {
      if (esIdBackend(previa.id) && !vigentes.has(previa.id)) await printingApi.eliminarImpresora(previa.id)
    }
  }

  // API primero y luego refresco de la caché (solo lectura). Devuelve la config
  // fresca o null si no se pudo guardar; nunca deja la caché divergente.
  const persistir = async (siguiente) => {
    if (esDemo) {
      // Demo (#194): los cambios quedan en memoria, con aviso honesto.
      const demo = { ...siguiente, syncedAt: new Date().toISOString() }
      setStore(demo)
      toast.success('Cambios simulados (demo)', 'Dato ficticio: no se guardó en el servidor.')
      return demo
    }
    try {
      await difundirCambios(store.impresoras || [], siguiente.impresoras || [])
      const fresco = await refrescarDesdeBackend(tenantId)
      setStore(fresco)
      // Con el modo remoto apagado el poller no sincroniza: se avisa al agente
      // local como antes.
      if (fresco.remoteEnabled === false) {
        try { await sincronizarAgente(fresco) } catch { toast.error('El agente no respondió', 'Los cambios quedaron en el servidor; se sincronizan cuando el agente vuelva.') }
      }
      return fresco
    } catch (cause) {
      toast.error('No se pudo guardar en el servidor', cause?.message || 'La configuración quedó como estaba.')
      return null
    }
  }

  const impresoras = useMemo(() => store.impresoras || [], [store.impresoras])
  const predeterminada = impresoras.find((item) => item.activa && item.predeterminada) || impresoras.find((item) => item.activa) || null

  const puentePrincipal = puenteDe(store)

  const sucursales = useMemo(() => store.sucursales || [], [store.sucursales])
  // Cobertura por sucursal (#95): qué puente sirve a cada una, cuántas
  // impresoras tiene y alerta cuando una sucursal con ventas quedó sin puente.
  const cobertura = useMemo(() => sucursales.map((sucursal) => {
    const puentes = (store.bridges || []).filter((puente) => puente.branchId === sucursal.id)
    const impresorasDe = impresoras.filter((impresora) => impresora.branchId === sucursal.id)
    return {
      ...sucursal,
      puentes,
      impresoras: impresorasDe,
      online: puentes.some((puente) => puente.online),
      alerta: sucursal.activa !== false && sucursal.hasSales && puentes.length === 0,
    }
  }), [sucursales, store.bridges, impresoras])
  const sucursalesSinPuente = cobertura.filter((sucursal) => sucursal.alerta)

  // Verificación invisible de las impresoras activas. Se pausa mientras hay
  // una impresión, prueba o diagnóstico en curso para no competir con el agente.
  const impresorasActivas = useMemo(() => impresoras.filter((impresora) => impresora.activa), [impresoras])
  const sondeoEnPausa = Boolean(probandoId) || diagnosticando || reparando
  const { estados: estadosVivos, agregado } = useEstadoImpresoras(impresorasActivas, { enPausa: sondeoEnPausa || esDemo })

  // Estado de configuración cuando todavía no hay verificación viva: la prueba
  // anterior y la detección del agente dan el contexto.
  function estadoConfigurado(impresora) {
    if (impresora.ultimaPrueba?.ok) return { label: 'Prueba exitosa', color: 'green' }
    if (/^(usb|cups)$/.test(impresora.conexion || '') || /^(usb|cups):/.test(String(impresora.destino || ''))) {
      const detectada = (estado?.impresoras?.usb || []).includes(String(impresora.destino || '').slice(String(impresora.destino || '').indexOf(':') + 1))
      return detectada ? { label: 'Conectada', color: 'green' } : { label: 'Configurada', color: 'slate' }
    }
    if (impresora.destino === estado?.impresora) {
      return estado?.impresoraOk ? { label: 'Conectada', color: 'green' } : { label: 'Sin conexión', color: 'red' }
    }
    return { label: 'Configurada', color: 'slate' }
  }

  // Un solo badge por impresora: manda el estado vivo; sin datos vivos todavía
  // se muestra el contexto (o "Sin verificar" si no hay agente local).
  function chipDe(impresora) {
    if (!impresora.destino) return { label: 'Error de configuración', color: 'red' }
    const vivo = estadosVivos[impresora.id]?.estado
    if (vivo === ESTADO_IMPRESORA.OK) return { label: ETIQUETA_ESTADO[ESTADO_IMPRESORA.OK], color: 'green' }
    if (vivo === ESTADO_IMPRESORA.ERROR) return { label: ETIQUETA_ESTADO[ESTADO_IMPRESORA.ERROR], color: 'red' }
    if (vivo === ESTADO_IMPRESORA.VERIFICANDO) return { label: ETIQUETA_ESTADO[ESTADO_IMPRESORA.VERIFICANDO], color: 'slate' }
    if (!estado?.disponible) return { label: ETIQUETA_ESTADO[ESTADO_IMPRESORA.SIN_VERIFICAR], color: 'slate' }
    return estadoConfigurado(impresora)
  }

  // Línea única de última verificación/última prueba. Sin agente local se
  // aclara dónde se verifica: esta computadora no puede comprobarlo.
  function verificacionDe(impresora) {
    const vivo = estadosVivos[impresora.id]
    if (vivo && vivo.estado !== ESTADO_IMPRESORA.SIN_VERIFICAR) return textoVerificacion(vivo)
    if (!impresora.destino) return 'Falta configurar el destino'
    if (!impresora.activa) return 'Desactivada: no se verifica'
    if (!estado?.disponible) {
      if (store.remoteEnabled === false) return 'Sin verificación local: la impresión remota está apagada'
      const esperaPuente = (store.bridges || []).length > 0 || impresora.bridgeId
      return esperaPuente ? 'Se verifica en la computadora puente' : 'Sin agente local en esta computadora'
    }
    return textoVerificacion(vivo)
  }

  function tonoDe(impresora) {
    const vivo = estadosVivos[impresora.id]?.estado
    if (vivo === ESTADO_IMPRESORA.OK) return 'ok'
    if (vivo === ESTADO_IMPRESORA.ERROR) return 'bad'
    return 'slate'
  }

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

  // Actividad: une la cola/historial remotos del backend con el historial
  // local del agente y arma el CSV exportable. El backend gana ante un mismo
  // jobId; los trabajos locales ya impresos siguen visibles.
  const historialCombinado = useMemo(() => {
    const porId = new Map()
    for (const job of remotos) porId.set(job.id, filaDesdeJob(job))
    for (const fila of historial) if (!porId.has(fila.jobId)) porId.set(fila.jobId, fila)
    return [...porId.values()].sort((izquierda, derecha) => new Date(derecha.fecha || 0).getTime() - new Date(izquierda.fecha || 0).getTime())
  }, [remotos, historial])

  const historialFiltrado = useMemo(() => historialCombinado.filter((fila) => {
    if (filtroActividad && fila.impresora !== filtroActividad) return false
    if (filtroTipo === 'prueba' && !String(fila.tipo || '').startsWith('prueba') && !fila.validacion) return false
    if (filtroTipo === 'venta' && fila.validacion) return false
    if (filtroRango !== 'todo') {
      const visto = new Date(fila.fecha || 0).getTime()
      const dias = filtroRango === 'hoy' ? 1 : 7
      if (!Number.isFinite(visto) || Date.now() - visto > dias * 24 * 60 * 60 * 1000) return false
    }
    return true
  }), [historialCombinado, filtroActividad, filtroTipo, filtroRango])

  function exportarActividad() {
    const filas = [['Fecha', 'Hora', 'Usuario', 'Equipo', 'Impresora', 'Transporte', 'En cola (ms)', 'Total (ms)', 'Puente', 'Validación', 'Sufijo', 'Resultado', 'Bytes', 'Trabajo']]
    for (const fila of historialFiltrado) {
      filas.push([fmtDia(fila.fecha), fmtHora(fila.fecha), fila.usuario, fila.cliente, fila.impresoraNombre || fila.impresora, fila.transporte || '', fila.enColaMs ?? '', fila.totalMs ?? '', fila.puente, fila.validacion, fila.sufijo, fila.resultado, fila.bytes, fila.ref])
    }
    const csv = filas.map((columnas) => columnas.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    descargarCsvCliente(`mobos-impresion-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  async function confirmarEnPapel(fila, valorDirecto = null) {
    // Un solo envío por vez: el guard cubre el botón, Enter y la auto-validación.
    if (confirmandoRef.current) return
    const sufijo = String(valorDirecto ?? sufijos[fila.jobId] ?? '').trim()
    if (!sufijo) return toast.error('Falta el número', 'Escribí el número secreto que salió impreso después del guion.')
    if (esDemo) {
      // Demo (#194): la verificación se simula contra el número ficticio de la
      // fila (una sola comparación local); no se llama al servidor.
      if (!fila.sufijo) return toast.info('Todavía no salió', 'El trabajo está pendiente: se valida cuando salga el papel (demo).')
      if (sufijo !== String(fila.sufijo)) return toast.error('No coincide', 'Probá con el número ficticio de la fila (demo).')
      setHistorial((actual) => actual.map((item) => (item.jobId === fila.jobId ? { ...item, resultado: 'confirmado', confirmadoEn: new Date().toISOString() } : item)))
      setSufijos((actual) => ({ ...actual, [fila.jobId]: '' }))
      toast.success('Confirmado en papel (demo)', 'Dato ficticio: no se llamó al servidor.')
      return
    }
    confirmandoRef.current = true
    setConfirmandoId(fila.jobId)
    try {
      // Un trabajo del backend (remoto o espejado) se confirma contra el
      // servidor; un trabajo solo-local, contra el agente.
      if (fila.remoto) await printingApi.confirmar(fila.jobId, sufijo)
      else await confirmarJob(fila.jobId, sufijo)
      toast.success('Confirmado en papel', 'El número coincide con el impreso: el trabajo quedó verificado.')
      setSufijos((actual) => ({ ...actual, [fila.jobId]: '' }))
      await consultar()
    } catch (cause) {
      toast.error('No coincide', cause?.message || 'El número secreto no es el del papel.')
    } finally { confirmandoRef.current = false; setConfirmandoId('') }
  }

  // Auto-validación al completar el código (#138): al escribir el último dígito
  // esperado se confirma solo, con un debounce corto para poder corregir. La
  // prueba (1 dígito) dispara apenas se escribe; un sufijo más largo, al llegar
  // a su largo (el panel lo conoce sin saber el valor). El botón Confirmar y
  // Enter siguen como respaldo.
  function escribirSufijo(fila, texto) {
    const esperado = largoDelSufijo(fila)
    const valor = String(texto || '').replace(/\D/g, '').slice(0, esperado || LARGO_SUFIJO_MAX)
    setSufijos((actual) => ({ ...actual, [fila.jobId]: valor }))
    const programado = timersAuto.current.get(fila.jobId)
    if (programado) { clearTimeout(programado); timersAuto.current.delete(fila.jobId) }
    if (!esperado || valor.length !== esperado) return
    programarAutoValidacion(fila, valor, 0)
  }

  // Espera a que no haya otra confirmación en vuelo en lugar de descartar el
  // intento: reintenta cada 250 ms (hasta ~5 s) y recién ahí confirma.
  function programarAutoValidacion(fila, valor, reintento) {
    timersAuto.current.set(fila.jobId, setTimeout(() => {
      timersAuto.current.delete(fila.jobId)
      if (confirmandoRef.current) {
        if (reintento < 20) programarAutoValidacion(fila, valor, reintento + 1)
        return
      }
      confirmarEnPapel(fila, valor)
    }, reintento === 0 ? 350 : 250))
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
      branchId: impresora.branchId || '',
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
      branchId: f.branchId || '',
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
    const fresco = await persistir(siguiente)
    if (!fresco) return
    setFormulario(null)
    toast.success('Impresora guardada', datos.destino)
    if (probar) {
      const guardada = (fresco.impresoras || []).find((item) => item.destino === datos.destino)
      if (guardada) probar(guardada)
    }
  }

  function probar(impresora) {
    setPruebaDe(impresora)
  }

  async function enviarPrueba({ tipo, copias, ticket }) {
    const impresora = pruebaDe
    if (!impresora || probandoId) return
    setProbandoId(impresora.id)
    setProgreso('Enviando…')
    if (esDemo) {
      // Demo (#194): la prueba se simula; no se envía nada a ningún equipo.
      const ultimaPrueba = { ok: true, encolado: false, remoto: false, fecha: new Date().toISOString(), tipo, ref: ticket.ref, validacion: ticket.validacion, metodo: metodoDe(impresora), transporte: 'directo', jobId: null, corte: Boolean(ticket.corte) }
      setProgreso('Prueba simulada')
      setStore((actual) => ({ ...actual, impresoras: actual.impresoras.map((item) => (item.id === impresora.id ? { ...item, ultimaPrueba } : item)) }))
      setPruebaDe(null)
      setProbandoId(null)
      toast.success('Prueba simulada (demo)', 'Dato ficticio: no se envió nada a la impresora ni al servidor.')
      return
    }
    const puente = puenteDe(store, impresora)
    // Local primero: en la Mac del puente imprime 127.0.0.1; en cualquier otro
    // dispositivo (o si el local rechaza antes de aceptar) se encola remoto.
    // El sufijo del ticket viaja en ambos caminos para validarlo en papel.
    const resultado = await imprimirTicketRouter(ticket, {
      store,
      impresora,
      copias,
      usuario: sesion?.nombre || usuario?.name || '',
      tipo,
      equipo: estado?.equipo || '',
      puente,
      tokenPista: enmascararToken(puente.token),
    })
    if (resultado.ok) {
      const encolado = Boolean(resultado.encolado)
      setProgreso(encolado ? 'Encolada…' : 'Impresión enviada…')
      const ultimaPrueba = {
        ok: !encolado && !resultado.remoto,
        encolado,
        remoto: Boolean(resultado.remoto),
        fecha: new Date().toISOString(),
        tipo,
        ref: ticket.ref,
        validacion: ticket.validacion,
        metodo: metodoDe(impresora),
        transporte: resultado.transporte || '',
        jobId: resultado.jobId || null,
        corte: Boolean(ticket.corte),
      }
      await registrarUltimaPrueba(impresora, ultimaPrueba)
      // Solo estado de pantalla: la caché se refresca desde el backend (arriba
      // quedó persistido `lastTest`); la UI no escribe la caché.
      setStore({
        ...store,
        impresoras: store.impresoras.map((item) => (item.id === impresora.id ? { ...item, ultimaPrueba } : item)),
      })
      if (resultado.remoto) {
        toast.success('Prueba encolada para el puente', 'El puente la reclama y la imprime. Cuando salga el papel, confirmá el número secreto en Actividad.')
      } else if (encolado) {
        toast.success('Prueba encolada', 'La impresora no respondió; el agente reintenta solo.')
      } else {
        const via = resultado.transporte === 'cups' ? 'por la cola CUPS' : resultado.transporte === 'usb' ? 'por USB' : 'por TCP'
        toast.success(`Prueba enviada ${via}`, 'El agente confirmó el envío. La confirmación final es visual: verificá el código en el papel y que se cortó solo.')
      }
    } else {
      setProgreso(resultado.remoto ? 'No se pudo encolar.' : 'La impresora no respondió.')
      toast.error(resultado.remoto ? 'No se pudo encolar la prueba' : 'No se pudo imprimir', resultado.error)
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
    if (esDemo) {
      // Demo (#194): diagnóstico ficticio, sin consultar al agente.
      setDiagnostico({ ok: true, alcance: true, destino, metodo: 'LAN (demo)', mensaje: 'Diagnóstico simulado: la impresora demo responde.' })
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

  async function crearPuente() {
    const nombre = String(puenteNuevo?.nombre || '').trim()
    if (!nombre) return toast.error('Falta el nombre', 'Poné un nombre para reconocer la computadora puente.')
    if (creandoPuente) return
    setCreandoPuente(true)
    try {
      const datos = await printingApi.crearPuente(nombre, puenteNuevo?.branchId || null)
      setCodigoVinculacion({ nombre: datos?.bridge?.name || nombre, code: datos?.pairingCode || '', expiresAt: datos?.expiresAt || null })
      setPuenteNuevo(null)
      await consultar()
    } catch (cause) {
      toast.error('No se pudo crear el puente', cause?.message || 'Revisá tu sesión y permisos.')
    } finally { setCreandoPuente(false) }
  }

  // Cambia la sucursal de un puente ya creado: el backend valida el tenant y
  // deja auditoría del antes/después.
  async function cambiarSucursalPuente(puente, branchId) {
    try {
      await printingApi.actualizarPuente(puente.id, { branchId: branchId || null })
      toast.success('Sucursal del puente actualizada', branchId ? `${puente.nombre} sirve a la sucursal elegida.` : `${puente.nombre} vuelve a ser puente de empresa.`)
      await consultar()
    } catch (cause) {
      toast.error('No se pudo cambiar la sucursal', cause?.message || 'Intentá de nuevo.')
    }
  }

  async function generarCodigo(puente) {
    try {
      const datos = await printingApi.regenerarCodigo(puente.id)
      setCodigoVinculacion({ nombre: puente.nombre, code: datos?.pairingCode || '', expiresAt: datos?.expiresAt || null })
    } catch (cause) {
      toast.error('No se pudo generar el código', cause?.message || 'El puente pudo haber sido revocado.')
    }
  }

  async function revocarPuenteConfirmado() {
    const puente = puenteRevocar
    setPuenteRevocar(null)
    if (!puente) return
    try {
      await printingApi.revocarPuente(puente.id)
      toast.success('Puente revocado', `${puente.nombre} ya no puede reclamar trabajos ni autenticarse.`)
      await consultar()
    } catch (cause) {
      toast.error('No se pudo revocar el puente', cause?.message || 'Intentá de nuevo.')
    }
  }

  async function eliminar() {
    const id = eliminarId
    setEliminarId(null)
    if (!id) return
    const siguiente = { ...store, impresoras: store.impresoras.filter((item) => item.id !== id) }
    if (siguiente.impresoras.length && !siguiente.impresoras.some((item) => item.predeterminada)) siguiente.impresoras[0].predeterminada = true
    const fresco = await persistir(siguiente)
    if (fresco) toast.success('Impresora eliminada')
  }

  function duplicar(impresora) {
    // La copia se revisa antes de guardar: el destino es único por empresa.
    abrirFormulario({ ...impresora, id: null, nombre: `${impresora.nombre} (copia)`, predeterminada: false, ultimaPrueba: null })
    toast.info('Copia lista para revisar', 'Cambiá el destino (no puede repetirse) y guardala.')
  }

  async function alternarActiva(impresora) {
    const siguiente = {
      ...store,
      impresoras: store.impresoras.map((item) => (item.id === impresora.id ? { ...item, activa: !item.activa, predeterminada: item.activa ? false : item.predeterminada } : item)),
    }
    if (siguiente.impresoras.some((item) => item.activa) && !siguiente.impresoras.some((item) => item.activa && item.predeterminada)) {
      siguiente.impresoras.find((item) => item.activa).predeterminada = true
    }
    const fresco = await persistir(siguiente)
    if (fresco) toast.success(impresora.activa ? 'Impresora desactivada' : 'Impresora activada', impresora.nombre)
  }

  async function marcarPredeterminada(impresora) {
    const siguiente = {
      ...store,
      impresoras: store.impresoras.map((item) => ({ ...item, predeterminada: item.id === impresora.id })),
    }
    const fresco = await persistir(siguiente)
    if (fresco) toast.success('Impresora predeterminada', impresora.nombre)
  }

  function cancelarDemo(ids) {
    setCola((actual) => actual ? { ...actual, pendientes: actual.pendientes.filter((trabajo) => !ids.includes(trabajo.id)) } : actual)
    toast.success(ids.length === 1 ? 'Trabajo cancelado (demo)' : `${ids.length} trabajos cancelados (demo)`, 'Dato ficticio: no salen cuando el puente reconecte.')
  }

  async function reintentar() {
    if (esDemo) {
      // Demo (#194): simulación local, sin agente.
      setCola((actual) => actual ? { ...actual, pendientes: [...actual.pendientes, ...actual.fallidos.map((trabajo) => ({ ...trabajo, estado: 'pendiente', intentos: 0, error: '' }))], fallidos: [] } : actual)
      setSeleccionados([])
      toast.success('Reintento simulado (demo)', 'Dato ficticio: la cola del agente no se toca.')
      return
    }
    try {
      const resultado = await reintentarFallidos()
      toast.success('Reintentando', `${resultado?.reintentados || 0} trabajo(s) fallido(s) vuelven a la cola.`)
    } catch (cause) { toast.error('No se pudo reintentar', cause?.message) }
    consultar()
  }

  async function limpiar(ids = []) {
    if (esDemo) {
      // Demo (#194): limpieza local, sin agente.
      setCola((actual) => actual ? { ...actual, fallidos: actual.fallidos.filter((trabajo) => (ids.length ? !ids.includes(trabajo.id) : false)) } : actual)
      setSeleccionados([])
      toast.success('Limpieza simulada (demo)', 'Dato ficticio: la cola del agente no se toca.')
      return
    }
    try {
      const resultado = await limpiarFallidos(ids)
      setSeleccionados([])
      toast.success('Cola limpia', `${resultado?.limpiados || 0} trabajo(s) fallido(s) quitado(s).`)
    } catch (cause) { toast.error('No se pudo limpiar la cola', cause?.message) }
    consultar()
  }

  async function repararConexion() {
    if (reparando) return
    if (esDemo) {
      // Demo (#194): no se toca la red.
      toast.info('Reparación simulada (demo)', 'Dato ficticio: no se agregó ninguna IP ni cola CUPS.')
      return
    }
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
    descargarArchivo(`mobos-diagnostico-impresion-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(datos, null, 2), { tipo: 'application/json' })
  }

  const sesionActiva = (s) => Date.now() - new Date(s.lastSeenAt || 0).getTime() < 15 * 60 * 1000
  const pendientes = cola?.pendientes || []
  const fallidos = cola?.fallidos || []
  // Cola remota del backend: en curso (pendiente/reclamado) y aceptados que
  // esperan la confirmación en papel.
  const remotosEnCurso = remotos.filter((job) => job.state === 'PENDIENTE' || job.state === 'RECLAMADO')
  const remotosAceptados = remotos.filter((job) => job.state === 'ACEPTADO')

  return (
    <div className="space-y-4">
      {esDemo && (
        <p role="status" className="rounded-xl border border-fono/30 bg-fono/10 p-3 text-sm text-mute">
          <b className="text-fore">Datos ficticios de demostración</b>: las impresoras, la cola, la actividad y las verificaciones de esta pantalla son de mentira. Nada de lo que hagas acá toca tus equipos ni el servidor.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-mute">Configurá, probá y monitoreá tus impresoras térmicas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar estado</Button>
          <Button type="button" variant="outline" onClick={() => setGuiaAbierta(true)}><Icon name="info" className="h-3.5 w-3.5" />Guía de impresión</Button>
          <Button type="button" onClick={() => abrirFormulario(null)}><Icon name="plus" className="h-3.5 w-3.5" />Agregar impresora</Button>
        </div>
      </div>

      {Object.keys(memoriaImpresion).length > 0 && (
        <Card className="space-y-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="printer" className="h-4 w-4 text-mute" />Impresora por tipo de documento</h3>
            <p className="mt-1 text-sm text-mute">Se recuerda la última impresora usada en cada tipo (siempre se puede cambiar eligiéndola al imprimir). «Olvidar» vuelve a la predeterminada de la empresa.</p>
          </div>
          <ul className="divide-y divide-ink-600/60">
            {Object.entries(memoriaImpresion).map(([tipo, datos]) => (
              <li key={tipo} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium">{etiquetaTipoImpresion(tipo)}</span>
                <span className="flex items-center gap-2 text-xs text-mute">
                  <span className="truncate" title={datos.destino}>{impresoras.find((item) => item.destino === datos.destino)?.nombre || datos.destino}</span>
                  {datos.ancho ? <span>· {datos.ancho} mm</span> : null}
                  <Button type="button" variant="ghost" className="h-auto px-1 py-0.5 text-xs text-fono-light" onClick={() => { olvidarTipoDeImpresion(tipo); setMemoriaImpresion(memoriaDeImpresion()) }}>Olvidar</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Estado del sistema de impresión</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={COLOR_TONO[agregado.tono]} title={agregado.detalle}>{agregado.label}</Badge>
            <Badge color={store.remoteEnabled === false ? 'orange' : 'blue'}>{store.remoteEnabled === false ? 'Remoto apagado' : `Remoto activo · ${(store.bridges || []).length} puente(s)`}</Badge>
            <Badge color={estado?.disponible ? 'green' : 'slate'}>{cargando ? 'Consultando…' : estado?.disponible ? `Agente conectado · v${estado.version || ''}` : 'Sin agente local'}</Badge>
          </div>
        </div>
        {cargando && !estado ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Computadora puente</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${estado?.disponible ? 'bg-ok' : 'bg-bad'}`} />{estado?.disponible ? 'Encendida' : 'Apagada o sin agente'}</p>
              <p className="mt-1 truncate text-xs text-mute" title={puentePrincipal.url || puentePrincipal.nombre}>
                {puentePrincipal.nombre} · {puentePrincipal.backend
                  ? (puentePrincipal.online ? 'en línea' : `último contacto ${hace(puentePrincipal.lastSeenAt)}`)
                  : puentePrincipal.url.includes('127.0.0.1') || puentePrincipal.url.includes('localhost') ? 'solo esta computadora' : puentePrincipal.url}
              </p>
              <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-fono-light" onClick={() => setPuentesAbiertos(true)}>Gestionar puentes ({(store.bridges || []).length})</Button>
              {estado?.disponible && <p className="mt-1 text-xs text-mute">Dirección local {URL_AGENTE} · {estado.host === '0.0.0.0' ? 'acepta la red local' : 'solo local'}</p>}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Impresora predeterminada</p>
              <p className="mt-1 truncate text-sm font-semibold" title={predeterminada?.nombre || undefined}>{predeterminada ? predeterminada.nombre : 'Sin configurar'}</p>
              {predeterminada ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge color={chipDe(predeterminada).color} title={verificacionDe(predeterminada)}>{chipDe(predeterminada).label}</Badge>
                  <Button type="button" variant="ghost" className="h-auto px-0 py-1 text-xs text-fono-light" onClick={() => abrirFormulario(predeterminada)}>Gestionar</Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" className="mt-1 h-auto px-0 py-1 text-xs text-fono-light" onClick={() => abrirFormulario(null)}>Agregar impresora</Button>
              )}
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Cola</p>
              <p className="mt-1 text-sm font-semibold">{estado?.cola?.pendientes ?? cola?.resumen?.pendientes ?? 0} pendientes · {estado?.cola?.fallidos ?? cola?.resumen?.fallidos ?? 0} fallidos</p>
              {remotosEnCurso.length > 0 && <p className="mt-1 text-xs text-mute">Remoto: {remotosEnCurso.length} en curso · {remotosAceptados.length} por confirmar</p>}
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
            No se encontró el agente en <b className="text-fore">{store.agentUrl}</b>. En esta computadora la impresión sale por acá; en cualquier otro dispositivo los trabajos se encolan y los imprime el puente vinculado. Para instalar el agente, usá <b className="text-fore">Gestionar puentes</b> y vinculá esta computadora con el código.
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

      {sucursales.length > 0 && (
        <Card className="space-y-3" data-testid="cobertura-sucursales">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="store" className="h-4 w-4 text-mute" />Cobertura por sucursal</h3>
            <p className="mt-1 text-sm text-mute">Cada trabajo sale por el puente de la sucursal del pedido o del vendedor. Si la sucursal no tiene puente activo, el trabajo se encola al puente de la empresa.</p>
          </div>
          {sucursalesSinPuente.length > 0 && (
            <p role="alert" data-testid="alerta-sucursal-sin-puente" className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
              <b className="text-warn">Sucursal sin puente activo:</b> {sucursalesSinPuente.map((sucursal) => sucursal.nombre).join(', ')} {sucursalesSinPuente.length === 1 ? 'tiene' : 'tienen'} ventas y ningún puente asignado. Sus impresiones se encolan al puente de la empresa.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cobertura.map((sucursal) => (
              <div key={sucursal.id} className="rounded-xl border border-ink-600 p-3">
                <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="truncate" title={sucursal.nombre}>{sucursal.nombre}</span>
                  <Badge color={sucursal.alerta ? 'orange' : sucursal.puentes.length ? (sucursal.online ? 'green' : 'slate') : 'slate'}>
                    {sucursal.alerta ? 'Sin puente activo' : sucursal.puentes.length ? (sucursal.online ? 'Puente en línea' : 'Puente sin conexión') : 'Sin puente'}
                  </Badge>
                </p>
                <p className="mt-1 truncate text-xs text-mute" title={sucursal.puentes.map((puente) => puente.nombre).join(', ')}>{sucursal.puentes.length ? `Puente: ${sucursal.puentes.map((puente) => puente.nombre).join(', ')}` : 'Puente: el de la empresa (respaldo)'}</p>
                <p className="mt-0.5 text-xs text-mute">{sucursal.impresoras.length ? `Impresoras: ${sucursal.impresoras.length}` : 'Sin impresoras propias'}{sucursal.hasSales ? ' · con ventas' : ''}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {impresoras.length === 0 ? (
        <Card>
          <EmptyState icon="receipt" title="Todavía no hay impresoras." description="Agregá la térmica con “Agregar impresora” y probala para dejarla lista." action={<Button type="button" onClick={() => abrirFormulario(null)}>Agregar impresora</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {impresoras.map((impresora) => {
            const chip = chipDe(impresora)
            const verificacion = verificacionDe(impresora)
            const tono = tonoDe(impresora)
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
                  <Badge color={chip.color} title={verificacion}>{chip.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                  <span>Método: <b className="text-fore">{metodoDe(impresora)}</b></span>
                  <span>Ancho: <b className="text-fore">{impresora.ancho} mm</b></span>
                  <span>Copias: <b className="text-fore">{impresora.copias}</b></span>
                  {impresora.ubicacion && <span>Ubicación: <b className="text-fore">{impresora.ubicacion}</b></span>}
                </div>
                <p className="text-xs text-mute">
                  <span className={CLASE_TONO[tono]}>{verificacion}</span>
                  <span> · Última prueba: <b className="text-fore">{textoUltimaPrueba(impresora.ultimaPrueba)}</b></span>
                </p>
                {probandoId === impresora.id && <p role="status" className="rounded-lg border border-fono/25 bg-fono/10 p-2 text-xs text-fono-light">{progreso}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => probar(impresora)} disabled={Boolean(probandoId) || !impresora.activa}>{probandoId === impresora.id ? 'Enviando…' : 'Imprimir prueba'}</Button>
                  <Button type="button" variant="outline" onClick={() => abrirFormulario(impresora)}>Editar</Button>
                  <Button type="button" variant="ghost" onClick={() => diagnosticar(impresora)}>Diagnóstico</Button>
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

      {/* La demo no tiene puentes ni backend real: comparativa y métricas solo
          con sesión real, para no mostrar errores que no existen. */}
      {!esDemo && (
        <>
          <ImpresionComparativa
            impresoras={impresoras}
            usuario={sesion?.nombre || usuario?.name || ''}
            equipo={estado?.equipo || 'navegador'}
            onAgregar={() => abrirFormulario(null)}
            onGestionarPuentes={() => setPuentesAbiertos(true)}
          />
          <ImpresionGraficos impresoras={impresorasActivas} />
        </>
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
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs uppercase tracking-wider text-mute">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Impresora</th>
                  <th className="px-2 py-2">Transporte</th>
                  <th className="px-2 py-2">Tiempos</th>
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
                  const largoSufijo = largoDelSufijo(fila)
                  return [
                    <tr key={`fila-${clave}`} className="border-b border-ink-600/50">
                      <td className="px-2 py-2 text-xs text-mute">
                        <span className="block">{fmtDia(fila.fecha)}</span>
                        <span className="block tabular-nums text-fore" title={`Creado ${fechaConSegundos(fila.fecha)}`}>{fmtHora(fila.fecha)}</span>
                      </td>
                      <td className="px-2 py-2 text-xs">{fila.usuario || '—'}</td>
                      <td className="px-2 py-2 truncate text-xs text-mute" title={`${fila.impresoraNombre || fila.impresora}${fila.ancho ? ` · ${fila.ancho} mm` : ''}`}>{fila.impresora}</td>
                      <td className="px-2 py-2 text-xs text-mute" title={fila.transporte ? `Reportado por el agente: ${fila.transporte}` : 'Sin reporte del agente: se muestra el modo configurado'}>{etiquetaTransporte(fila)}</td>
                      <td className="px-2 py-2 text-[11px] text-mute">
                        <span className="block">en cola <b className="text-fore tabular-nums">{fmtTiempo(fila.enColaMs)}</b></span>
                        <span className="block">total <b className="text-fore tabular-nums">{fmtTiempo(fila.totalMs)}</b></span>
                      </td>
                      <td className="px-2 py-2 truncate text-xs text-mute" title={`${fila.puente || '—'}${fila.tokenPista ? ` · token ${fila.tokenPista}` : ''}`}>{fila.puente || '—'}</td>
                      <td className="px-2 py-2 text-xs font-semibold" title={fila.tipo ? `Tipo: ${fila.tipo}` : undefined}>
                        {fila.validacion || '—'}
                        {fila.resultado === 'pendiente' && sinRespuesta(fila) && <p className="mt-0.5 text-[10px] font-semibold text-warn" title="El puente no reportó el resultado; revisá la impresora y reintentá.">sin respuesta del puente</p>}
                      </td>
                      <td className="px-2 py-2">
                        {(fila.resultado === 'aceptado' || fila.resultado === 'pendiente') && fila.validacion ? (
                          <span className="flex items-center gap-1">
                            <input value={sufijos[fila.jobId] || ''} onChange={(event) => escribirSufijo(fila, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); confirmarEnPapel(fila) } }} inputMode="numeric" maxLength={largoSufijo || LARGO_SUFIJO_MAX} placeholder={largoSufijo ? `${largoSufijo} díg.` : 'número'} title={largoSufijo ? `El papel trae ${largoSufijo} dígito(s): se valida solo al completarlo.` : 'Escribí el número del papel y confirmá.'} aria-label={`Número secreto de la validación ${fila.validacion}`} className="w-16 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-center text-xs" />
                            <button type="button" onClick={() => confirmarEnPapel(fila)} disabled={confirmandoId === fila.jobId} className="rounded-lg border border-ok/40 px-2 py-1 text-[10px] font-bold text-ok transition hover:bg-ok/10 disabled:opacity-50">{confirmandoId === fila.jobId ? '…' : 'Confirmar'}</button>
                          </span>
                        ) : fila.resultado === 'confirmado' ? (
                          <span className="text-xs font-semibold text-ok">✓ en papel</span>
                        ) : (
                          <span className="text-xs text-mute">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Badge color={colorTrabajo(fila.resultado)}>{etiquetaTrabajo(fila.resultado)}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button type="button" variant="ghost" className="h-auto px-1 py-1" onClick={() => setDetalleAbierto(abierto ? '' : clave)} aria-expanded={abierto} aria-label={abierto ? 'Ocultar detalle' : 'Ver detalle'}>
                          <Icon name="chevron" className={`h-3.5 w-3.5 transition ${abierto ? 'rotate-180' : ''}`} />
                        </Button>
                      </td>
                    </tr>,
                    abierto ? (
                      <tr key={`detalle-${clave}`} className="border-b border-ink-600/50 bg-ink-800/40">
                        <td colSpan={10} className="px-3 py-3">
                          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                            {[
                              ['Trabajo', fila.jobId || '—'],
                              ['Referencia', fila.ref || '—'],
                              ['Destino', fila.impresora || '—'],
                              ['Ancho', fila.ancho ? `${fila.ancho} mm` : '—'],
                              ['Token', fila.tokenPista || 'sin token'],
                              ['Bytes', String(fila.bytes || 0)],
                              ['Encolado', fechaConSegundos(fila.enqueuedAt)],
                              ['Reclamado', fechaConSegundos(fila.reclamadoEn)],
                              ['En cola', fmtTiempo(fila.enColaMs)],
                              ['Total', fmtTiempo(fila.totalMs)],
                              ['Transporte', fila.transporte || 'sin reporte'],
                              ['Confirmado', fechaConSegundos(fila.confirmadoEn)],
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
          <EmptyState compact icon="users" title="No hay sesiones registradas." description="Las sesiones activas de la empresa aparecen acá para revocarlas." />
        ) : (
          <div className="space-y-2">
            {sesiones.map((activa) => (
              <div key={activa.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar user={activa.user} picture={activa.user?.name === perfilEmpresa?.name || (!activa.user && String(activa.deviceId || '').startsWith('google:')) ? perfilEmpresa?.picture : undefined} size="md" />
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
          bridges={store.bridges || []}
          sucursales={sucursales}
          onGuardar={guardarFormulario}
          onGestionarPuentes={() => { setFormulario(null); setPuentesAbiertos(true) }}
        />
      )}

      {pruebaDe && (
        <ModalPrueba
          impresora={pruebaDe}
          chip={chipDe(pruebaDe)}
          verificacion={verificacionDe(pruebaDe)}
          metodo={metodoDe(pruebaDe)}
          usuario={sesion?.nombre || usuario?.name || ''}
          puente={puenteDe(store, pruebaDe).nombre}
          tokenPista={enmascararToken(puenteDe(store, pruebaDe).token)}
          equipo={estado?.equipo || 'navegador'}
          enviando={Boolean(probandoId)}
          progreso={progreso}
          onCerrar={() => setPruebaDe(null)}
          onEnviar={enviarPrueba}
        />
      )}

      <Modal open={puentesAbiertos} onClose={() => { setPuentesAbiertos(false); setPuenteNuevo(null); setCodigoVinculacion(null) }} title="Puentes de impresión" className="max-w-2xl">
        <div className="space-y-4">
          <p className="text-sm text-mute">Cada puente es una computadora con el agente instalado que reclama los trabajos del backend. Un código de vinculación se usa una sola vez, vence en 15 minutos y nunca se vuelve a mostrar.</p>
          {(store.bridges || []).length === 0 ? (
            <EmptyState compact icon="printer" title="Todavía no hay puentes." description="Creá uno y vinculá la computadora con el código." />
          ) : (
            <div className="space-y-2">
              {(store.bridges || []).map((puente) => (
                <div key={puente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {puente.nombre}
                      {puente.predeterminado && <Badge color="blue">Predeterminado</Badge>}
                      <Badge color={puente.online ? 'green' : 'slate'}>{puente.online ? `en línea${puente.version ? ` · v${puente.version}` : ''}` : `sin conexión · ${hace(puente.lastSeenAt)}`}</Badge>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-mute">{puente.plataforma ? `${puente.plataforma} · ` : ''}reclama trabajos por HTTPS (conexión saliente)</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-mute">
                      Sucursal
                      <Select aria-label={`Sucursal de ${puente.nombre}`} className="w-40" value={puente.branchId || ''} onChange={(event) => cambiarSucursalPuente(puente, event.target.value)}>
                        <option value="">Toda la empresa</option>
                        {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                      </Select>
                    </label>
                    <Button type="button" variant="ghost" onClick={() => generarCodigo(puente)}>Código</Button>
                    <Button type="button" variant="ghost" className="text-bad" onClick={() => setPuenteRevocar(puente)}>Revocar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {codigoVinculacion && (
            <div className="space-y-2 rounded-xl border border-fono/40 bg-fono/10 p-3">
              <p className="text-sm font-semibold text-fore">Código para {codigoVinculacion.nombre}</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-fono-light">{codigoVinculacion.code}</p>
              <p className="text-xs text-mute">Vence {fmt(codigoVinculacion.expiresAt)}. En la computadora puente: <code className="rounded bg-ink-700 px-1">node print-agent/pair.mjs --code {codigoVinculacion.code} --api-url &lt;backend&gt;</code></p>
            </div>
          )}
          {puenteNuevo ? (
            <div className="space-y-3 rounded-xl border border-ink-600 p-3">
              <FormField label="Nombre del puente" htmlFor="puente-nombre">
                <Input id="puente-nombre" value={puenteNuevo.nombre} onChange={(event) => setPuenteNuevo((actual) => ({ ...actual, nombre: event.target.value }))} placeholder="Mac del local" />
              </FormField>
              <FormField label="Sucursal que sirve" htmlFor="puente-sucursal" hint="Con sucursal, solo imprime los trabajos de esa sucursal. Sin sucursal, es el puente de respaldo de la empresa.">
                <Select id="puente-sucursal" value={puenteNuevo.branchId || ''} onChange={(event) => setPuenteNuevo((actual) => ({ ...actual, branchId: event.target.value }))}>
                  <option value="">Toda la empresa</option>
                  {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                </Select>
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPuenteNuevo(null)}>Cancelar</Button>
                <Button type="button" onClick={crearPuente} disabled={creandoPuente}>{creandoPuente ? 'Creando…' : 'Crear y vincular'}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setPuenteNuevo({ nombre: '', branchId: '' })}><Icon name="plus" className="h-3.5 w-3.5" />Agregar puente</Button>
          )}
        </div>
      </Modal>

      <Modal open={guiaAbierta} onClose={() => setGuiaAbierta(false)} title="Guía de impresión" className="max-w-2xl">
        <GuiaImpresion />
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

      <ConfirmDialog
        open={Boolean(puenteRevocar)}
        onCancel={() => setPuenteRevocar(null)}
        onConfirm={revocarPuenteConfirmado}
        title="¿Revocar este puente?"
        description="El token deja de autenticar y no puede reclamar trabajos. Para volver a usarlo hay que crear otro puente y vincularlo de nuevo."
        confirmLabel="Revocar puente"
        variant="danger"
      />

      <Modal open={verColaAbierta} onClose={() => setVerColaAbierta(false)} title="Cola de impresión" className="max-w-2xl">
        <div className="space-y-4">
          {!pendientes.length && !fallidos.length && !remotosEnCurso.length ? (
            <EmptyState compact icon="check" title="La cola está vacía." description="Cuando un trabajo no sale, queda acá para reintentarlo o limpiarlo." />
          ) : (
            <div className="space-y-4">
              {pendientes.length > 0 && (
                <section>
                  <h4 className={ROTULO_SECCION}>Pendientes del agente ({pendientes.length})</h4>
                  <TablaTrabajos trabajos={pendientes} onCancelar={esDemo ? (trabajo) => cancelarDemo([trabajo.id]) : undefined} />
                </section>
              )}
              {remotosEnCurso.length > 0 && (
                <section>
                  <h4 className={ROTULO_SECCION}>En curso del puente ({remotosEnCurso.length})</h4>
                  <TablaTrabajos trabajos={remotosEnCurso.map(filaColaDesdeJob)} />
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
            {esDemo && pendientes.length > 0 && <Button type="button" variant="outline" className="border-bad/40 text-bad hover:bg-bad/10" onClick={() => cancelarDemo(pendientes.map((trabajo) => trabajo.id))}>Cancelar pendientes ({pendientes.length})</Button>}
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

function TablaTrabajos({ trabajos, seleccionados = [], onSeleccion, onCancelar }) {
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
            {onCancelar && <th className="px-2 py-2" />}
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
              {onCancelar && <td className="px-2 py-2 text-right"><Button type="button" variant="outline" className="border-bad/40 text-bad hover:bg-bad/10" onClick={() => onCancelar(trabajo)}>Cancelar</Button></td>}
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
      {metodo === 'LAN' && !diagnostico.alcance && diagnostico.motivo === 'permiso_o_red' && aliasPresente && (
        <div className="space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-2">
          <p className="font-semibold text-warn">El agente automático no pudo salir a la red local.</p>
          <p className="text-mute">Falló con {diagnostico.errno || 'EHOSTUNREACH'} y la IP secundaria <b className="text-fore">{diagnostico.alias?.ip || estado?.alias?.ip || '192.168.1.100'}</b> está presente. Si desde Terminal <code className="rounded bg-ink-700 px-1">ping {host}</code> y <code className="rounded bg-ink-700 px-1">nc -vz {host} {puerto}</code> conectan, falta el <b className="text-fore">permiso de Red Local</b>: Ajustes → Privacidad y seguridad → Red local → habilitá <b className="text-fore">node</b> (reinstalar con <code className="rounded bg-ink-700 px-1">bash print-agent/install-macos.sh</code> abre el panel). Si tampoco conectan, revisá que la impresora esté encendida y en la misma red. Después usá <b className="text-fore">Reparar conexión → Imprimir prueba</b>.</p>
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

function FormularioImpresora({ formulario, setFormulario, estado, bridges = [], sucursales = [], onGuardar, onGestionarPuentes }) {
  const [validacion, setValidacion] = useState(null)
  const [validando, setValidando] = useState(false)
  const f = formulario
  const set = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }))
  const destino = f.conexion === 'cups' ? `cups:${f.destinoUsb.trim()}` : `lan:${f.ip.trim()}:${f.puerto.trim() || '9100'}`

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
          <h4 className={ROTULO_SECCION}>Identificación</h4>
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
          <h4 className={ROTULO_SECCION}>Conexión</h4>
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
          <h4 className={ROTULO_SECCION}>Formato</h4>
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
          <h4 className={ROTULO_SECCION}>Agente</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FormField label="Sucursal" htmlFor="imp-sucursal" hint="Los documentos de esta sucursal prefieren esta impresora. Sin sucursal, sirve a toda la empresa.">
              <Select id="imp-sucursal" value={f.branchId || ''} onChange={(event) => set({ branchId: event.target.value })}>
                <option value="">Toda la empresa</option>
                {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
              </Select>
            </FormField>
            <FormField label="Puente" htmlFor="imp-puente" hint="El puente que imprime esta impresora. Sin elección, el de su sucursal o el primero de la empresa.">
              <Select id="imp-puente" value={f.puenteId || ''} onChange={(event) => set({ puenteId: event.target.value })}>
                <option value="">Puente de la sucursal o predeterminado</option>
                {bridges.map((puente) => <option key={puente.id} value={puente.id}>{puente.nombre}{puente.predeterminado ? ' (predeterminado)' : ''}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="mt-2">
            <FormField label="Vinculación" htmlFor="imp-puentes-gestionar" hint="Los puentes se vinculan con un código de un solo uso.">
              <Button id="imp-puentes-gestionar" type="button" variant="outline" onClick={onGestionarPuentes}>Gestionar puentes</Button>
            </FormField>
          </div>
          <p className="mt-2 text-xs text-mute">Estado: <b className={estado?.disponible ? 'text-ok' : 'text-bad'}>{estado?.disponible ? `agente local conectado · v${estado.version || ''}` : 'esta computadora no tiene el agente local'}</b>{estado?.disponible ? ` · ${estado.host === '0.0.0.0' ? 'acceso: red local' : 'acceso: solo esta computadora'}` : ' · los trabajos se encolan al puente'}.</p>
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

// Guía operativa del sistema de impresión: los dos modos, cómo instalar el
// agente en una computadora y qué hacer cuando algo no sale. Está pensada para
// que el local no dependa de soporte técnico para operar y reinstalar.
function GuiaImpresion() {
  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h4 className={ROTULO_SECCION}>Cómo se imprime</h4>
        <div className="rounded-xl border border-ink-600 p-3">
          <p className="font-semibold text-fore">Modo rápido · esta computadora</p>
          <p className="mt-1 text-mute">Si acá hay un agente instalado y vinculado, la app le manda el ticket por 127.0.0.1 y sale al instante: directo por LAN o por la cola CUPS. Es el modo de la Mac del local.</p>
        </div>
        <div className="rounded-xl border border-ink-600 p-3">
          <p className="font-semibold text-fore">Modo puente · cualquier dispositivo</p>
          <p className="mt-1 text-mute">Desde el celular, otra PC o fuera del local, el ticket viaja al servidor y lo imprime la computadora puente vinculada (tarda unos segundos más: el puente reclama cada 2 s).</p>
        </div>
        <p className="text-mute">La app elige solo: si el agente de <b className="text-fore">esta</b> computadora responde y la impresora es de su puente, imprime local; si no, encola remoto. Los dos modos conviven: la Mac del local imprime rápido mientras el resto de los equipos encola hacia ese mismo puente.</p>
      </section>

      <section className="space-y-2">
        <h4 className={ROTULO_SECCION}>Instalar el modo rápido en una computadora</h4>
        <ol className="list-decimal space-y-1 pl-5 text-mute">
          <li>En <b className="text-fore">Gestionar puentes → Código</b>, generá el código de un solo uso (vence en 15 minutos).</li>
          <li>En esa Mac, pegá este comando en la Terminal con el código (reemplazá ABCDE-FGHIJ):</li>
        </ol>
        <code className="block overflow-x-auto rounded bg-ink-700 p-2 text-xs text-fore">curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ</code>
        <ul className="space-y-1 text-mute">
          <li>El instalador deja el agente arrancando al iniciar sesión, verifica la descarga y avisa si falta algo de red.</li>
          <li>Volvé a esta pantalla y tocá <b className="text-fore">Actualizar estado</b>: debe decir <b className="text-fore">Agente conectado</b>. Después, <b className="text-fore">Imprimir prueba</b>.</li>
          <li>Para actualizar el agente, volvé a correr el mismo comando (sin código si ya está vinculado).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className={ROTULO_SECCION}>Pasar de un modo a otro</h4>
        <ul className="space-y-1 text-mute">
          <li><b className="text-fore">Rápido</b>: tener el agente instalado y vinculado en esa computadora (arranca solo con la sesión).</li>
          <li><b className="text-fore">Remoto (puente)</b>: no hace falta nada; cualquier PC, tablet o celular lo usa automáticamente.</li>
          <li>Si esta computadora tiene agente pero la impresora elegida depende de <b className="text-fore">otro</b> puente, el trabajo se encola remoto solo.</li>
          <li>El modo activo se ve en <b className="text-fore">Estado del sistema de impresión</b>: «Agente conectado» = rápido en este equipo; «Sin agente local» = remoto.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className={ROTULO_SECCION}>Cuando algo no imprime</h4>
        <ul className="space-y-2 text-mute">
          <li><b className="text-fore">«Sin agente local»</b>: la Mac del local está apagada o el servicio no arrancó. Encendela y esperá un minuto; si sigue, reinstalá el agente con el comando de arriba.</li>
          <li><b className="text-fore">«Sin respuesta» en el panel</b>: revisá <b className="text-fore">Actividad</b>; si el trabajo figura <b className="text-fore">aceptado</b>, ya salió del puente y solo falta confirmar el número impreso en el papel.</li>
          <li><b className="text-fore">La impresora no responde por TCP</b>: el agente imprime igual por la cola CUPS del sistema (el daemon de macOS sí llega a la red). Es el respaldo normal; no hay que hacer nada.</li>
          <li><b className="text-fore">Permiso de Red Local</b>: solo hace falta para TCP directo. Si macOS lo pide, se habilita para «node» en Ajustes → Privacidad y seguridad → Red local. Sin ese permiso, el respaldo CUPS imprime igual.</li>
          <li><b className="text-fore">No sale nada</b>: verificá que la impresora esté encendida, con papel y con la IP correcta (<b className="text-fore">Editar</b> en la impresora).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className={ROTULO_SECCION}>Confirmación y mantenimiento</h4>
        <ul className="space-y-1 text-mute">
          <li>Cada prueba imprime un <b className="text-fore">número secreto</b>: escribilo en Actividad para confirmar que el papel salió de verdad.</li>
          <li>Los logs del agente quedan en <code className="rounded bg-ink-700 px-1">~/.mobos-print/agente.log</code>.</li>
          <li>Para dar de baja un puente: <b className="text-fore">Gestionar puentes → Revocar</b> (su token deja de autenticar).</li>
        </ul>
      </section>
    </div>
  )
}

function ModalPrueba({ impresora, chip, verificacion, metodo, usuario, puente, tokenPista, equipo, enviando, progreso, onCerrar, onEnviar }) {
  const [tipo, setTipo] = useState('corta')
  const [turno, setTurno] = useState(0) // regenera el ticket (y su número de 4 dígitos)
  const [verPrevia, setVerPrevia] = useState(false)
  // Las pruebas salen SIEMPRE con 1 copia: no hay campo ni estado de copias.
  const ticket = useMemo(
    () => ticketPruebaTipo(tipo, {
      ancho: impresora.ancho,
      impresora: impresora.destino,
      nombre: impresora.nombre,
      equipo,
      copias: 1,
      metodo,
      conexion: impresora.conexion,
      puente,
      tokenPista,
      usuario,
    }),
    // turno solo dispara la regeneración: un número nuevo por ejecución.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, turno, impresora, equipo, metodo, puente, tokenPista, usuario],
  )
  return (
    <Modal open onClose={enviando ? undefined : onCerrar} title={`Probar: ${impresora.nombre}`} className="max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 p-3">
          <Badge color={chip.color} title={verificacion || undefined}>{chip.label}</Badge>
          <p className="min-w-0 flex-1 truncate text-xs text-mute" title={`${impresora.destino || 'Sin destino'} · ${impresora.ancho} mm`}>{impresora.destino || 'Sin destino'} · {impresora.ancho} mm</p>
        </div>
        <FormField label="Tipo de prueba" htmlFor="prueba-tipo">
          <Select id="prueba-tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>
            {Object.entries(TIPOS_TICKET_PRUEBA).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </Select>
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-mute">Sale <b className="text-fore">1 copia</b>, con un número secreto para confirmarla en papel.</p>
          <Button type="button" variant="ghost" onClick={() => setVerPrevia((actual) => !actual)} aria-expanded={verPrevia}>
            <Icon name="eye" className="h-3.5 w-3.5" />{verPrevia ? 'Ocultar vista previa' : 'Ver vista previa'}
          </Button>
        </div>
        {verPrevia && (
          <div>
            <div className="mb-1 flex items-center justify-end">
              <Button type="button" variant="ghost" onClick={() => setTurno((n) => n + 1)} disabled={enviando}><Icon name="refresh" className="h-3.5 w-3.5" />Nuevo número</Button>
            </div>
            <pre className="max-h-80 overflow-y-auto rounded-xl border border-ink-600 bg-ink-900 p-3 font-mono text-[11px] leading-4 text-fore">{ticket.lineas().join('')}</pre>
          </div>
        )}
        {tipo === 'corte' && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-xs text-mute">
            La verificación del corte es <b className="text-fore">física</b>: el ticket debe separarse del rollo solo. El éxito por TCP confirma el envío, no la cuchilla. Si no corta, revisá <b className="text-fore">Cutter Enable: YES</b> en la impresora.
          </p>
        )}
        {enviando && <p role="status" className="rounded-lg border border-fono/25 bg-fono/10 p-2 text-xs text-fono-light">{progreso}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={() => onEnviar({ tipo, copias: 1, ticket })} disabled={enviando}>{enviando ? 'Enviando…' : 'Imprimir prueba'}</Button>
        </div>
      </div>
    </Modal>
  )
}
