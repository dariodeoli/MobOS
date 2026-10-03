import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { Aviso, Badge, Button, Card, Drawer, EmptyState, FormActions, FormField, Input, Label, Modal, MoneyInput, SaveActions, Select, Skeleton, Textarea, useToast, useValidacionCampos } from '@/components/ui'
import { obligatorio } from 'owncoding-ui/utils'
import BarraLote from '@/components/shared/BarraLote'
import BarraModulo from '@/components/shared/BarraModulo'
import ResumenMetricas from '@/components/shared/ResumenMetricas'
import SearchField from '@/components/shared/SearchField'
import InspeccionEquipo from '@/components/shared/InspeccionEquipo'
import PatronDesbloqueo from '@/components/shared/PatronDesbloqueo'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import SerialField from '@/components/shared/SerialField'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { temaV2Activo } from '@/lib/temaV2'
import { fechaHora } from '@/utils/fecha'
import { ticketRecepcionServicio } from '@/lib/printing/tickets'
import { imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { useSesion } from '@/lib/sesion'
import { buildServiceIntakeHtml, buildServiceReportHtml, ordenParaImpresion } from '@/lib/servicioImpresion'
import { CHECKLISTS } from '@/lib/servicioChecklist'
import { getDemoServicio, saveDemoServicio, siguienteNumeroDemo } from '@/lib/demoServicio'
import { SEED_DEMO_CLIENTES, clientesDemoGuardados } from '@/lib/demoClientes'
import { api } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { coincideCliente } from '@/utils/cliente'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'
import { CELDA_DATO, CELDA_ENCABEZADO } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { ESTADOS_SERVICIO as ESTADOS, ESTADO_SERVICIO_LABEL as ESTADO_LABEL, ESTADO_SERVICIO_TONO as ESTADO_TONE, SIGUIENTE_SERVICIO as SIGUIENTE } from '@/lib/estadosServicio'
import { partesDispositivo, tipoDeDispositivo } from '@/lib/dispositivos'
import { BuscadorDispositivo, etiquetaDispositivo } from 'owncoding-ui'
// Plantilla sugerida del menú central por estado del pipeline (#134): al abrir
// WhatsApp desde la fila, el mensaje ya sale con el contexto del taller.
const PLANTILLA_POR_ESTADO = {
  RECIBIDO: 'equipo_recibido',
  DIAGNOSTICO: 'diagnostico_listo',
  CON_TECNICO: 'diagnostico_listo',
  ESPERANDO_REPUESTO: 'esperando_repuesto',
  REPARADO: 'reparado',
  LISTO: 'reparacion_lista',
}
const FORM_VACIO = { customerName: '', customerId: '', deviceType: 'iPhone', serviceName: '', device: '', serial: '', reportedIssue: '', diagnosis: '', technicianName: '', status: 'RECIBIDO', pricePyg: '', costPyg: '', partsPyg: '', laborPyg: '', otherCostPyg: '', notes: '', checklist: {}, unlockCode: '', unlockPattern: [] }
const DEVICE_TYPES = ['iPhone', 'MacBook', 'AirPods', 'iPad', 'Apple Watch', 'Otros']
const fecha = (value) => value ? new Date(value).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '') : '—'
const utilidad = (row) => Number(row.pricePyg || 0) - Number(row.costPyg || 0)
// Etiqueta corta para el botón de avance: la completa queda en el title.
const SIGUIENTE_CORTO = { RECIBIDO: 'Recibido', DIAGNOSTICO: 'Diagnóstico', CON_TECNICO: 'Con técnico', ESPERANDO_REPUESTO: 'Repuesto', REPARADO: 'Reparado', LISTO: 'Listo', ENTREGADO: 'Entregado' }
const numeroDe = (valor) => Number(String(valor || '').replace(/\D/g, '')) || 0
// Tipo del checklist de una orden: el guardado o el que surge del modelo.
const tipoDeFila = (row) => row.deviceType || tipoDeDispositivo(row.device) || 'Otros'
// Variables de la plantilla de WhatsApp para una orden del taller (misma
// fuente para la fila y el detalle, #134/#315).
const contextoWhatsApp = (row) => ({
  cliente: row.customerName || '',
  nombre: (row.customerName || '').split(' ')[0] || '',
  equipo: row.device || '',
  producto: row.deviceType || row.device || '',
  servicio: row.serviceName || row.reportedIssue || row.diagnosis || '',
  estado: ESTADO_LABEL[row.status] || row.status || '',
  total: Number(row.pricePyg || 0) > 0 ? gs(row.pricePyg) : '',
  fecha: row.receivedAt ? new Date(row.receivedAt).toLocaleDateString('es-PY') : '',
})

// Tabla compacta: una fila por orden de servicio, encabezados ordenables y el
// avance de estado en la misma línea.
const GRID_SERVICIO = 'grid min-w-[65rem] grid-cols-[1.75rem_minmax(8rem,1.3fr)_minmax(6rem,1fr)_minmax(7rem,1.5fr)_5.5rem_5rem_5.5rem_5.5rem_6.5rem_8.5rem] items-center gap-x-2'
// Última plantilla elegida para el taller: se recuerda entre órdenes.
const ULTIMA_PLANTILLA_SERVICIO = 'mobos:plantilla:servicio'
// Flujo del taller para la vista previa v2 (#241): agrupa los estados reales
// del pipeline en los pasos que muestra el stepper. Solo se dibuja con el flag
// `preview v2`; sin él la pantalla queda igual.
const PASOS_FLUJO = [
  ['Recepción', ['RECIBIDO']],
  ['Diagnóstico', ['DIAGNOSTICO', 'CON_TECNICO', 'ESPERANDO_REPUESTO']],
  ['Reparación', ['REPARADO']],
  ['Listo para retirar', ['LISTO']],
  ['Entrega', ['ENTREGADO']],
]

export default function ServicioTecnico() {
  const toast = useToast()
  const { empresa, esDemo } = useSesion()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useUrlState('filtro', 'activos')
  const [orden, setOrden] = useState({ key: 'recibido', dir: 'desc' })
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [seleccionados, setSeleccionados] = useState([])
  const [clientes, setClientes] = useState([])
  const [servicios, setServicios] = useState([])
  const [busquedaServicio, setBusquedaServicio] = useState('')
  const [catalogoOpen, setCatalogoOpen] = useState(false)
  const [servicioEdit, setServicioEdit] = useState({ id: '', name: '', deviceType: 'iPhone', precio: '' })
  const [catalogoBusy, setCatalogoBusy] = useState(false)
  const [checklists, setChecklists] = useState({})
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [nuevoPunto, setNuevoPunto] = useState('')
  const [checklistBusy, setChecklistBusy] = useState(false)
  // Recepción del equipo con el buscador dependiente (#250): el modelo manda
  // y capacidad/color se despliegan después.
  const [dispositivo, setDispositivo] = useState({})
  // #315: la lista general queda compacta y el detalle de cada reparación
  // (etapas + inspección + acciones) vive en un panel; los filtros avanzados,
  // en un panel lateral.
  const [detalleId, setDetalleId] = useState(null)
  const [filtros, setFiltros] = useState({ tecnico: '', tipo: '', desde: '', hasta: '' })
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [referenciaForm, setReferenciaForm] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    if (esDemo) { setRows(getDemoServicio().rows); setLoading(false); return }
    try {
      const data = await api.get('/api/service-orders')
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las órdenes de servicio.')
    } finally { setLoading(false) }
  }, [esDemo])
  useEffect(() => { load() }, [load])

  const cargarServicios = useCallback(async () => {
    if (esDemo) { setServicios(getDemoServicio().servicios); return }
    try {
      const data = await api.get('/api/service-items')
      setServicios(Array.isArray(data) ? data : [])
    } catch { setServicios([]) }
  }, [esDemo])
  useEffect(() => { cargarServicios() }, [cargarServicios])

  // Checklist configurable por tipo de dispositivo: si la tienda no definió
  // puntos, se usa la lista sugerida del módulo.
  const cargarChecklists = useCallback(async () => {
    if (esDemo) { setChecklists(getDemoServicio().checklists || {}); return }
    try {
      const data = await api.get('/api/service-checklists')
      const mapa = {}
      for (const item of Array.isArray(data) ? data : []) (mapa[item.deviceType] ||= []).push(item)
      setChecklists(mapa)
    } catch { setChecklists({}) }
  }, [esDemo])
  useEffect(() => { cargarChecklists() }, [cargarChecklists])
  const puntosDe = (deviceType) => checklists[deviceType]?.length ? checklists[deviceType].map(item => item.label) : (CHECKLISTS[deviceType] || CHECKLISTS.Otros)

  useEffect(() => {
    const query = (form?.customerName || '').trim()
    if (query.length < 2) { setClientes([]); return undefined }
    if (esDemo) {
      const demo = [...SEED_DEMO_CLIENTES, ...clientesDemoGuardados()]
      setClientes(demo.filter((cliente) => coincideCliente(cliente, query)).slice(0, 5))
      return undefined
    }
    let active = true
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/api/customers?q=${encodeURIComponent(query)}`)
        if (active) setClientes((Array.isArray(data) ? data : []).filter(cliente => coincideCliente(cliente, query)).slice(0, 5))
      } catch { if (active) setClientes([]) }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [form?.customerName, esDemo])

  const conteos = useMemo(() => {
    const base = { activos: 0, ...Object.fromEntries(ESTADOS.map(([id]) => [id, 0])) }
    for (const row of rows) {
      base[row.status] = (base[row.status] || 0) + 1
      if (!['ENTREGADO', 'CANCELADO'].includes(row.status)) base.activos++
    }
    return base
  }, [rows])

  // Vista previa v2 (#241): el flujo suma un stepper y los importes suben un
  // escalón. Se apaga solo con el flag; sin él todo queda como estaba.
  const v2 = temaV2Activo()
  const detalle = useMemo(() => rows.find((row) => row.id === detalleId) || null, [rows, detalleId])
  const tecnicos = useMemo(() => [...new Set(rows.map((row) => row.technicianName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [rows])
  const filtrosActivos = [filtros.tecnico, filtros.tipo, filtros.desde, filtros.hasta].filter(Boolean).length
  const limpiarFiltros = () => setFiltros({ tecnico: '', tipo: '', desde: '', hasta: '' })
  // Validación por campo (#323): el alta muestra el error junto al campo en
  // vez de un único toast al pie.
  const { errorDe: errorOrden, validar: validarOrden, limpiar: limpiarOrden } = useValidacionCampos({
    customerName: [obligatorio('Escribí el nombre del cliente.')],
    device: [obligatorio('Elegí el dispositivo.')],
  })
  // Cierre con cambios (#323): el modal de la orden pide confirmación en vez de
  // descartar el formulario en silencio. El catálogo hace lo mismo mientras
  // haya un servicio a medio cargar o editado.
  const formSucio = Boolean(form) && Boolean(referenciaForm) && JSON.stringify(form) !== referenciaForm
  const catalogoSucio = useMemo(() => {
    const base = servicioEdit.id ? servicios.find((item) => item.id === servicioEdit.id) : null
    const original = base
      ? { name: base.name, deviceType: base.deviceType, precio: base.suggestedPricePyg ? String(base.suggestedPricePyg) : '' }
      : { name: '', deviceType: 'iPhone', precio: '' }
    return servicioEdit.name !== original.name || servicioEdit.deviceType !== original.deviceType || servicioEdit.precio !== original.precio
  }, [servicioEdit, servicios])

  const ordenarPor = (key) => setOrden(current => current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: ['recibido', 'precio', 'utilidad'].includes(key) ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )
  const valorOrden = (row, key) => {
    if (key === 'equipo') return String(row.device || '')
    if (key === 'cliente') return String(row.customerName || '')
    if (key === 'falla') return String(row.reportedIssue || row.diagnosis || '')
    if (key === 'tecnico') return String(row.technicianName || '')
    if (key === 'recibido') return row.receivedAt ? new Date(row.receivedAt).getTime() : 0
    if (key === 'precio') return Number(row.pricePyg || 0)
    if (key === 'utilidad') return utilidad(row)
    if (key === 'estado') return ESTADOS.findIndex(([id]) => id === row.status)
    return 0
  }
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const lista = rows
      .filter(row => filtro === 'activos' ? !['ENTREGADO', 'CANCELADO'].includes(row.status) : filtro === 'todos' ? true : row.status === filtro)
      .filter(row => !texto || [row.customerName, row.device, row.serial, row.reportedIssue, row.diagnosis, row.technicianName].filter(Boolean).join(' ').toLowerCase().includes(texto))
      .filter(row => !filtros.tecnico || row.technicianName === filtros.tecnico)
      .filter(row => !filtros.tipo || tipoDeFila(row) === filtros.tipo)
      .filter(row => {
        if (!filtros.desde && !filtros.hasta) return true
        const dia = String(row.receivedAt || row.createdAt || '').slice(0, 10)
        if (!dia) return false
        if (filtros.desde && dia < filtros.desde) return false
        if (filtros.hasta && dia > filtros.hasta) return false
        return true
      })
    if (orden.key === 'recientes') return lista
    const factor = orden.dir === 'asc' ? 1 : -1
    return [...lista].sort((a, b) => {
      const va = valorOrden(a, orden.key); const vb = valorOrden(b, orden.key)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [rows, filtro, q, orden, filtros])

  // Análisis del taller sobre lo que se está viendo: facturación, costos
  // (repuesto + mano de obra + otros) y utilidad real del período filtrado.
  const totales = useMemo(() => visibles.reduce((acc, row) => {
    acc.facturado += Number(row.pricePyg || 0)
    acc.costos += Number(row.costPyg || 0)
    return acc
  }, { facturado: 0, costos: 0 }), [visibles])

  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    if (!validarOrden({ customerName: form.customerName, device: form.device }).valido) return
    setBusy(true)
    try {
      const desglose = {
        partsPyg: numeroDe(form.partsPyg),
        laborPyg: numeroDe(form.laborPyg),
        otherCostPyg: numeroDe(form.otherCostPyg),
      }
      const payload = {
        customerName: form.customerName.trim(),
        customerId: form.customerId || undefined,
        device: form.device.trim(),
        serviceName: form.serviceName || undefined,
        checklist: form.checklist || {},
        ...(form.unlockCode?.trim() ? { unlockCode: form.unlockCode.trim() } : {}),
        ...(Array.isArray(form.unlockPattern) && form.unlockPattern.length ? { unlockPattern: form.unlockPattern } : {}),
        serial: form.serial.trim(),
        reportedIssue: form.reportedIssue.trim(),
        diagnosis: form.diagnosis.trim(),
        technicianName: form.technicianName.trim(),
        status: form.status,
        pricePyg: numeroDe(form.pricePyg),
        costPyg: numeroDe(form.costPyg),
        // El backend usa el desglose si algún valor es mayor a 0 y, si no, el
        // costo total directo; los ceros limpian un desglose viejo.
        ...desglose,
        notes: form.notes.trim(),
      }
      if (esDemo) {
        // Modo demo (#194): la orden se guarda en el navegador, sin API.
        const actuales = getDemoServicio().rows
        const receta = {
          customerName: form.customerName.trim(), customerId: form.customerId || '', customerPhone: form.customerPhone || '', customerCountryCode: '+595',
          device: form.device.trim(), deviceType: form.deviceType, serial: form.serial.trim(), serviceName: form.serviceName || undefined,
          reportedIssue: form.reportedIssue.trim(), diagnosis: form.diagnosis.trim(), technicianName: form.technicianName.trim(), status: form.status,
          pricePyg: numeroDe(form.pricePyg), costPyg: numeroDe(form.costPyg),
          partsPyg: desglose.partsPyg ?? 0, laborPyg: desglose.laborPyg ?? 0, otherCostPyg: desglose.otherCostPyg ?? 0,
          checklist: form.checklist || {}, notes: form.notes.trim(),
        }
        const siguientes = editing
          ? actuales.map((row) => row.id === editing.id ? { ...row, ...receta } : row)
          : [{ id: `demo-os-${Date.now()}`, serviceNumber: siguienteNumeroDemo(actuales), receivedAt: new Date().toISOString(), ...receta }, ...actuales]
        saveDemoServicio({ rows: siguientes })
        toast.success(editing ? 'Orden de prueba actualizada en este navegador.' : 'Orden de prueba guardada en este navegador.')
        setForm(null); setEditing(null)
        setBusy(false)
        await load()
        return
      }
      if (editing) await api.patch('/api/service-orders', { id: editing.id, ...payload })
      else await api.post('/api/service-orders', payload)
      toast.success(editing ? 'Orden de servicio actualizada.' : 'Orden de servicio creada.')
      setForm(null); setEditing(null)
      await load()
    } catch (cause) {
      toast.error(cause?.message || 'No se pudo guardar la orden de servicio.')
    } finally { setBusy(false) }
  }

  // ── Catálogo de servicios ───────────────────────────────────────────
  async function guardarServicio(event) {
    event.preventDefault()
    if (catalogoBusy) return
    if (!servicioEdit.name.trim()) { toast.error('El nombre del servicio es obligatorio.'); return }
    setCatalogoBusy(true)
    try {
      const payload = { name: servicioEdit.name.trim(), deviceType: servicioEdit.deviceType, suggestedPricePyg: numeroDe(servicioEdit.precio) }
      if (esDemo) {
        const actuales = getDemoServicio().servicios
        const siguientes = servicioEdit.id
          ? actuales.map((item) => item.id === servicioEdit.id ? { ...item, ...payload } : item)
          : [...actuales, { id: `demo-serv-${Date.now()}`, isActive: true, ...payload }]
        saveDemoServicio({ servicios: siguientes })
        setServicios(siguientes)
        setServicioEdit({ id: '', name: '', deviceType: 'iPhone', precio: '' })
        toast.success(servicioEdit.id ? 'Servicio de prueba actualizado.' : 'Servicio de prueba agregado.')
        return
      }
      if (servicioEdit.id) await api.patch('/api/service-items', { id: servicioEdit.id, ...payload })
      else await api.post('/api/service-items', payload)
      setServicioEdit({ id: '', name: '', deviceType: 'iPhone', precio: '' })
      await cargarServicios()
      toast.success(servicioEdit.id ? 'Servicio actualizado.' : 'Servicio agregado al catálogo.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo guardar el servicio.') } finally { setCatalogoBusy(false) }
  }
  async function quitarServicio(item) {
    if (catalogoBusy) return
    setCatalogoBusy(true)
    try {
      if (esDemo) {
        const siguientes = getDemoServicio().servicios.filter((row) => row.id !== item.id)
        saveDemoServicio({ servicios: siguientes })
        setServicios(siguientes)
        toast.success('Servicio de prueba quitado.')
        return
      }
      await api.patch('/api/service-items', { id: item.id, isActive: false })
      await cargarServicios()
      toast.success('Servicio quitado del catálogo.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo quitar el servicio.') } finally { setCatalogoBusy(false) }
  }
  async function cargarCatalogoSugerido() {
    try {
      if (esDemo) {
        const sugeridos = [
          { id: 'demo-serv-1', name: 'Cambio de batería', deviceType: 'iPhone', suggestedPricePyg: 250000, isActive: true },
          { id: 'demo-serv-2', name: 'Cambio de pantalla', deviceType: 'iPhone', suggestedPricePyg: 450000, isActive: true },
          { id: 'demo-serv-3', name: 'Limpieza interna', deviceType: 'Otros', suggestedPricePyg: 80000, isActive: true },
        ]
        saveDemoServicio({ servicios: sugeridos })
        setServicios(sugeridos)
        toast.success('Catálogo sugerido cargado (demo).')
        return
      }
      const data = await api.post('/api/service-items', { defaults: true })
      setServicios(Array.isArray(data) ? data : [])
      toast.success('Catálogo sugerido cargado.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo cargar el catálogo.') }
  }
  const serviciosDelTipo = useMemo(() => {
    const texto = busquedaServicio.trim().toLowerCase()
    return servicios
      .filter(servicio => servicio.deviceType === (form?.deviceType || 'iPhone'))
      .filter(servicio => !texto || servicio.name.toLowerCase().includes(texto))
  }, [servicios, busquedaServicio, form?.deviceType])

  // ── Checklist configurable ──────────────────────────────────────────
  async function agregarPunto(event) {
    event.preventDefault()
    const label = nuevoPunto.trim()
    if (!label || checklistBusy) return
    setChecklistBusy(true)
    try {
      if (esDemo) {
        const tipo = form?.deviceType || 'iPhone'
        const actuales = getDemoServicio().checklists || {}
        const lista = [...(actuales[tipo] || []), { id: `demo-check-${Date.now()}`, label, isActive: true }]
        const siguientes = { ...actuales, [tipo]: lista }
        saveDemoServicio({ checklists: siguientes })
        setChecklists(siguientes)
        setNuevoPunto('')
        return
      }
      await api.post('/api/service-checklists', { deviceType: form?.deviceType || 'iPhone', label })
      setNuevoPunto('')
      await cargarChecklists()
    } catch (cause) { toast.error(cause?.message || 'No se pudo agregar el punto.') } finally { setChecklistBusy(false) }
  }
  async function quitarPunto(item) {
    if (checklistBusy) return
    setChecklistBusy(true)
    try {
      if (esDemo) {
        const tipo = form?.deviceType || 'iPhone'
        const actuales = getDemoServicio().checklists || {}
        const siguientes = { ...actuales, [tipo]: (actuales[tipo] || []).filter((row) => row.id !== item.id) }
        saveDemoServicio({ checklists: siguientes })
        setChecklists(siguientes)
        return
      }
      await api.patch('/api/service-checklists', { id: item.id, isActive: false })
      await cargarChecklists()
    } catch (cause) { toast.error(cause?.message || 'No se pudo quitar el punto.') } finally { setChecklistBusy(false) }
  }
  async function cargarChecklistSugerido() {
    if (checklistBusy) return
    setChecklistBusy(true)
    try {
      const labels = CHECKLISTS[form?.deviceType] || CHECKLISTS.Otros
      if (esDemo) {
        const tipo = form?.deviceType || 'iPhone'
        const actuales = getDemoServicio().checklists || {}
        const siguientes = { ...actuales, [tipo]: labels.map((label, indice) => ({ id: `demo-check-${tipo}-${indice}`, label, isActive: true })) }
        saveDemoServicio({ checklists: siguientes })
        setChecklists(siguientes)
        toast.success('Checklist sugerido cargado (demo).')
        return
      }
      await api.post('/api/service-checklists', { deviceType: form?.deviceType || 'iPhone', labels })
      await cargarChecklists()
      toast.success('Checklist sugerido cargado.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo cargar el checklist.') } finally { setChecklistBusy(false) }
  }

  // Manda la recepción a la ticketera por el camino local o remoto; solo cae
  // a la impresión del navegador si el fallo fue claro (no salió ni quedó en
  // cola: el respaldo abriría el diálogo y podría duplicar el papel).
  async function imprimirAgente(row) {
    const resultado = await imprimirDocumento(ticketRecepcionServicio(ordenParaImpresion(row), { ancho: 80 }), { tipo: 'recepcion-servicio' })
    if (resultado?.ok) {
      toast.success(
        resultado.encolado ? 'Recepción encolada' : 'Enviado a la impresora.',
        resultado.encolado ? (resultado.remoto ? 'La imprime el puente cuando la reclame.' : 'La impresora no respondió; se reintenta solo.') : '',
      )
      return
    }
    if (!puedeCaerAlDialogo(resultado)) {
      toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
      return
    }
    imprimir(row, 'recepcion', 'thermal')
  }

  // Abre la hoja en una pestaña y lanza la impresión del navegador.
  function imprimir(row, tipo, formato = 'a4') {
    const orden = ordenParaImpresion(row)
    const datos = { empresa: { nombre: empresa?.nombre || '', sucursal: empresa?.sucursal || '', telefono: empresa?.telefono || '' } }
    const html = tipo === 'reporte' ? buildServiceReportHtml(orden, datos) : buildServiceIntakeHtml(orden, { ...datos, format: formato })
    const ventana = window.open('', '_blank')
    if (!ventana) { toast.error('Permití las ventanas emergentes para imprimir.'); return }
    ventana.document.write(html)
    ventana.document.close()
    ventana.focus()
    ventana.print()
  }

  // El buscador de la biblioteca emite el valor completo; guardamos la etiqueta
  // («iPhone 15 · 256 GB · Azul») en `device` —el formato de siempre— y, cuando
  // cambia el modelo (elegido o escrito), sincronizamos el tipo del checklist.
  const cambiarDispositivo = (valor) => {
    const modeloPrevio = dispositivo?.modelo || ''
    setDispositivo(valor)
    const tipo = tipoDeDispositivo(valor?.modelo)
    setForm((current) => {
      if (!current) return current
      const cambioModelo = Boolean(valor?.modelo) && valor.modelo !== modeloPrevio
      const sincronizarTipo = cambioModelo && tipo !== current.deviceType
      return { ...current, device: etiquetaDispositivo(valor), ...(sincronizarTipo ? { deviceType: tipo, serviceName: '' } : {}) }
    })
  }

  const alternar = (id) => setSeleccionados((actuales) => alternarId(actuales, id))
  const seleccionarVisibles = () => setSeleccionados((actuales) => seleccionarTodos(visibles, actuales))
  const avanzarSeleccionadas = async () => {
    const filas = visibles.filter((row) => seleccionados.includes(row.id) && SIGUIENTE[row.status])
    if (!filas.length) { toast.error('Ninguna de las seleccionadas tiene un estado siguiente.'); return }
    for (const row of filas) await avanzar(row)
    setSeleccionados([])
    toast.success(`${filas.length} ${filas.length === 1 ? 'orden avanzada' : 'órdenes avanzadas'}.`)
  }

  async function avanzar(row) {
    const siguiente = SIGUIENTE[row.status]
    if (!siguiente) return
    try {
      if (esDemo) {
        saveDemoServicio({ rows: getDemoServicio().rows.map((actual) => actual.id === row.id ? { ...actual, status: siguiente } : actual) })
        toast.success(`${row.device}: ${ESTADO_LABEL[siguiente]}.`)
        await load()
        return
      }
      await api.patch('/api/service-orders', { id: row.id, status: siguiente })
      toast.success(`${row.device}: ${ESTADO_LABEL[siguiente]}.`)
      await load()
    } catch (cause) { toast.error(cause?.message || 'No se pudo avanzar el estado.') }
  }

  function editar(row) {
    setEditing(row)
    setDispositivo(partesDispositivo(row.device))
    const datos = {
      customerName: row.customerName || '', customerId: row.customerId || '', device: row.device || '', serial: row.serial || '',
      reportedIssue: row.reportedIssue || '', diagnosis: row.diagnosis || '', technicianName: row.technicianName || '',
      status: row.status || 'RECIBIDO', pricePyg: String(row.pricePyg || ''), costPyg: String(row.costPyg || ''),
      partsPyg: row.partsPyg ? String(row.partsPyg) : '', laborPyg: row.laborPyg ? String(row.laborPyg) : '', otherCostPyg: row.otherCostPyg ? String(row.otherCostPyg) : '',
      notes: row.notes || '',
      deviceType: (row.serviceName || '').split(' · ')[0] || 'iPhone', serviceName: row.serviceName || '',
      checklist: row.checklist && typeof row.checklist === 'object' && !Array.isArray(row.checklist) ? row.checklist : {},
      unlockCode: row.desbloqueo?.pin || '',
      unlockPattern: Array.isArray(row.desbloqueo?.patron) ? row.desbloqueo.patron : [],
    }
    setForm(datos)
    setReferenciaForm(JSON.stringify(datos))
  }

  const set = (key) => (event) => setForm(current => ({ ...current, [key]: event.target.value }))

  // Utilidad en vivo del formulario: precio menos el costo (desglosado si hay).
  const costoTrabajoForm = form ? (() => {
    const desglose = numeroDe(form.partsPyg) + numeroDe(form.laborPyg) + numeroDe(form.otherCostPyg)
    return desglose > 0 ? desglose : numeroDe(form.costPyg)
  })() : 0
  const hayDesgloseForm = Boolean(form && (numeroDe(form.partsPyg) + numeroDe(form.laborPyg) + numeroDe(form.otherCostPyg)) > 0)

  return (
    <Card className="space-y-4">
      {/* Composición compacta (#256): identidad y acciones en una sola barra. */}
      <BarraModulo
        icono="wrench"
        titulo="Taller"
        descripcion="Recepción, diagnóstico, reparación, costos y entrega de cada equipo."
        testId="barra-taller"
      >
        <Button variant="outline" onClick={load} disabled={loading}>Actualizar</Button>
        {servicios.length === 0 && <Button variant="outline" onClick={cargarCatalogoSugerido}>Cargar catálogo sugerido</Button>}
        <Button variant="outline" onClick={() => setCatalogoOpen(true)}>Catálogo</Button>
        <Button onClick={() => { setEditing(null); const vacio = { ...FORM_VACIO }; setForm(vacio); setDispositivo({}); setReferenciaForm(JSON.stringify(vacio)) }}>+ Nueva orden</Button>
      </BarraModulo>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1"><SearchField ariaLabel="Buscar órdenes de servicio" placeholder="Cliente, equipo, IMEI, falla o técnico" value={q} onChange={event => setQ(event.target.value)} /></div>
        <div className="w-full sm:w-60">
          <Select aria-label="Filtrar por etapa" value={filtro} onChange={event => setFiltro(event.target.value)}>
            <option value="activos">Activas ({conteos.activos})</option>
            {ESTADOS.map(([id, label]) => <option key={id} value={id}>{label} ({conteos[id] || 0})</option>)}
            <option value="todos">Todas ({rows.length})</option>
          </Select>
        </div>
        <Button variant="outline" className="min-h-11 md:min-h-0" aria-expanded={filtrosOpen} onClick={() => setFiltrosOpen(true)}>Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}</Button>
      </div>

      {error && <Aviso tono="error" className="p-3">{error}</Aviso>}
      {loading && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
      {!loading && !visibles.length && <EmptyState icon="refresh" title={q ? 'Ninguna orden coincide con la búsqueda.' : 'Todavía no hay órdenes de servicio.'} description={q ? undefined : 'Cargá la primera orden para seguir el taller de punta a punta.'} /* El alta vive en el header: duplicarla acá rompía el nombre accesible único. */ />}
      {!loading && visibles.length > 0 && (
        <ResumenMetricas
          testId="resumen-taller"
          columnas={3}
          items={[
            { titulo: 'Facturado', valor: gs(totales.facturado), alcance: 'En pantalla' },
            { titulo: 'Costos', valor: gs(totales.costos), alcance: 'En pantalla', tono: 'text-warn' },
            { titulo: 'Utilidad', valor: gs(totales.facturado - totales.costos), alcance: 'En pantalla', tono: totales.facturado - totales.costos >= 0 ? 'text-ok' : 'text-bad' },
          ]}
        />
      )}
      {v2 && !loading && visibles.length > 0 && (
        <p className="text-xs text-mute" data-testid="taller-resumen-flujo">
          {PASOS_FLUJO.map(([paso, estados]) => `${paso}: ${estados.reduce((suma, estado) => suma + (conteos[estado] || 0), 0)}`).join(' · ')}
        </p>
      )}
      <BarraLote cantidad={seleccionados.length} onLimpiar={() => setSeleccionados([])}>
        <Button variant="outline" className="h-8 px-2 text-xs" onClick={avanzarSeleccionadas}>Avanzar estado</Button>
      </BarraLote>
      {!loading && visibles.length > 0 && (
        <div className="overflow-x-auto" data-testid="servicio-tabla">
          <div className={cn(GRID_SERVICIO, 'px-3.5 pb-2 pt-1')}>
            <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={visibles.length > 0 && seleccionados.length === visibles.length} onChange={seleccionarVisibles} />
            {encabezado('equipo', 'Equipo')}
            {encabezado('cliente', 'Cliente')}
            {encabezado('falla', 'Falla')}
            {encabezado('tecnico', 'Técnico')}
            {encabezado('recibido', 'Recibido')}
            {encabezado('precio', 'Precio', 'justify-end')}
            {encabezado('utilidad', 'Utilidad', 'justify-end')}
            {encabezado('estado', 'Estado')}
            <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
          </div>
          <div className="space-y-1">
            {visibles.map(row => {
              const ganancia = utilidad(row)
              const serial = String(row.serial || '')
              return <div key={row.id} data-testid="servicio-fila" onClick={(event) => { if (event.target.closest('button,a,input,label,select')) return; setDetalleId(row.id) }} className={cn(GRID_SERVICIO, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar la orden de ${row.device || 'servicio'}`} checked={seleccionados.includes(row.id)} onChange={() => alternar(row.id)} />
                <span className="min-w-0">
                  <b className="block truncate text-sm" title={row.device}>{row.device || 'Equipo'}</b>
                  {row.serviceNumber && <span className="mt-0.5 block truncate text-[10px] font-semibold text-fono-light tabular-nums">{row.serviceNumber}</span>}
                  {serial && <SerialTexto serial={serial} className="mt-0.5 truncate text-[10px] text-mute" />}
                </span>
                <span className={CELDA_DATO} title={row.customerName}>{row.customerName || 'Sin cliente'}</span>
                <span className={CELDA_DATO} title={row.reportedIssue || row.diagnosis || undefined}>{row.reportedIssue || row.diagnosis || 'Sin detalle'}</span>
                <span className={CELDA_DATO}>{row.technicianName || 'Sin técnico'}</span>
                <span className={CELDA_DATO}>{fecha(row.receivedAt)}</span>
                <span className={cn('truncate text-right text-xs tabular-nums text-mute', v2 && 'v2-numero')}>{gs(row.pricePyg || 0)}</span>
                <span className={cn('truncate text-right text-xs font-semibold tabular-nums', ganancia >= 0 ? 'text-ok' : 'text-bad', v2 && 'v2-numero')}>{ganancia >= 0 ? '+' : ''}{gs(ganancia)}</span>
                <Badge color={ESTADO_TONE[row.status] || 'slate'} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{ESTADO_LABEL[row.status] || row.status}</Badge>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  {row.customerPhone && (
                    <WhatsAppMenu
                      telefono={row.customerPhone}
                      countryCode={row.customerCountryCode || '+595'}
                      category="SERVICE"
                      storageKey={ULTIMA_PLANTILLA_SERVICIO}
                      title={row.customerName}
                      preferKey={PLANTILLA_POR_ESTADO[row.status] || ''}
                      contexto={contextoWhatsApp(row)}
                    />
                  )}
                  {SIGUIENTE[row.status] && <Button variant="outline" className="h-8 whitespace-nowrap px-2 text-xs" title={`Pasar a ${ESTADO_LABEL[SIGUIENTE[row.status]]}`} onClick={(event) => { event.stopPropagation(); avanzar(row) }}>{SIGUIENTE_CORTO[SIGUIENTE[row.status]]}</Button>}
                  <Button variant="outline" className="h-8 px-2 text-xs" title="Ver la reparación" aria-label={`Ver detalle de ${row.device || 'servicio'}`} onClick={(event) => { event.stopPropagation(); setDetalleId(row.id) }}><Icon name="eye" className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            })}
          </div>
        </div>
      )}

      {/* Filtros avanzados (#315): panel lateral, sin recargar la lista. */}
      <Drawer open={filtrosOpen} onClose={() => setFiltrosOpen(false)} title="Filtros del taller" side="right">
        <div className="space-y-4">
          <p className="text-sm text-mute">Acotan la lista general. La etapa se elige en la barra; acá van técnico, tipo y fechas.</p>
          <div>
            <Label htmlFor="filtro-tecnico">Técnico</Label>
            <Select id="filtro-tecnico" value={filtros.tecnico} onChange={event => setFiltros(actual => ({ ...actual, tecnico: event.target.value }))}>
              <option value="">Todos los técnicos</option>
              {tecnicos.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="filtro-tipo">Tipo de dispositivo</Label>
            <Select id="filtro-tipo" value={filtros.tipo} onChange={event => setFiltros(actual => ({ ...actual, tipo: event.target.value }))}>
              <option value="">Todos los tipos</option>
              {DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
            </Select>
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <div><Label htmlFor="filtro-desde">Recibidas desde</Label><Input id="filtro-desde" type="date" value={filtros.desde} onChange={event => setFiltros(actual => ({ ...actual, desde: event.target.value }))} /></div>
            <div><Label htmlFor="filtro-hasta">Hasta</Label><Input id="filtro-hasta" type="date" value={filtros.hasta} onChange={event => setFiltros(actual => ({ ...actual, hasta: event.target.value }))} /></div>
          </div>
          <FormActions>
            <Button type="button" variant="ghost" disabled={!filtrosActivos} onClick={limpiarFiltros}>Limpiar</Button>
            <Button type="button" onClick={() => setFiltrosOpen(false)}>Aplicar filtros</Button>
          </FormActions>
        </div>
      </Drawer>

      {/* Detalle de la reparación (#315): etapas, inspección y acciones en un
          solo nivel, sin perderse en la tabla. */}
      <Drawer open={Boolean(detalle)} onClose={() => setDetalleId(null)} title={detalle ? `Reparación ${detalle.serviceNumber || ''}`.trim() : 'Reparación'} side="right">
        {detalle && (() => {
          const tipo = tipoDeFila(detalle)
          const ganancia = utilidad(detalle)
          const costoTrabajo = (Number(detalle.partsPyg || 0) + Number(detalle.laborPyg || 0) + Number(detalle.otherCostPyg || 0)) || Number(detalle.costPyg || 0)
          const pasoActivo = PASOS_FLUJO.findIndex(([, estados]) => estados.includes(detalle.status))
          return (
            <div className="space-y-4" data-testid="taller-detalle">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{detalle.serviceNumber || 'Sin número'}</p>
                  <h2 className="truncate text-lg font-semibold text-fore">{detalle.device || 'Equipo'}</h2>
                  <p className="truncate text-sm text-mute">{detalle.customerName || 'Sin cliente'}{detalle.serial ? ` · ${detalle.serial}` : ''}</p>
                </div>
                <Badge color={ESTADO_TONE[detalle.status] || 'slate'} className="whitespace-nowrap">{ESTADO_LABEL[detalle.status] || detalle.status}</Badge>
              </div>

              <section aria-label="Etapas de la reparación">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Etapas de la reparación</p>
                <ol className="mt-2 space-y-1.5" data-testid="taller-pasos">
                  {PASOS_FLUJO.map(([paso], indice) => {
                    const activo = indice === pasoActivo
                    const hecho = pasoActivo >= 0 && indice < pasoActivo
                    return (
                      <li key={paso} data-paso={paso} data-activo={activo ? 'true' : 'false'} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2', activo ? 'border-info/40 bg-info/5' : 'border-ink-600', hecho && 'opacity-70')}>
                        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', activo ? 'bg-info/20 text-info' : hecho ? 'bg-ok/15 text-ok' : 'bg-ink-700 text-mute')} aria-hidden>{hecho ? '✓' : indice + 1}</span>
                        <span className="text-sm">{paso}</span>
                        {activo && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-info">Actual</span>}
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section aria-label="Inspección de recepción">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Inspección de recepción ({tipo})</p>
                <div className="mt-2"><InspeccionEquipo tipo={tipo} puntos={puntosDe(tipo)} marcados={detalle.checklist || {}} disabled /></div>
              </section>

              <section aria-label="Datos de la orden" className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-2">
                <p className="text-sm"><span className="text-mute">Técnico: </span>{detalle.technicianName || 'Sin asignar'}</p>
                <p className="text-sm"><span className="text-mute">Recibido: </span>{fechaHora(detalle.receivedAt || detalle.createdAt) || '—'}</p>
                <p className="text-sm sm:col-span-2"><span className="text-mute">Falla reportada: </span>{detalle.reportedIssue || 'Sin detalle'}</p>
                <p className="text-sm sm:col-span-2"><span className="text-mute">Diagnóstico: </span>{detalle.diagnosis || 'Sin diagnóstico'}</p>
                {detalle.notes && <p className="text-sm sm:col-span-2"><span className="text-mute">Notas: </span>{detalle.notes}</p>}
              </section>

              <section aria-label="Costos de la reparación" className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-2">
                <p className="text-sm"><span className="text-mute">Precio: </span><b className="tabular-nums">{gs(detalle.pricePyg || 0)}</b></p>
                <p className="text-sm"><span className="text-mute">Costo del trabajo: </span><b className="tabular-nums text-warn">{gs(costoTrabajo)}</b></p>
                <p className="text-sm"><span className="text-mute">Repuesto: </span>{gs(detalle.partsPyg || 0)}</p>
                <p className="text-sm"><span className="text-mute">Mano de obra: </span>{gs(detalle.laborPyg || 0)}</p>
                <p className={cn('text-sm font-semibold tabular-nums sm:col-span-2', ganancia >= 0 ? 'text-ok' : 'text-bad')}>Utilidad: {ganancia >= 0 ? '+' : ''}{gs(ganancia)}</p>
              </section>

              <FormActions>
                {detalle.customerPhone && (
                  <WhatsAppMenu
                    telefono={detalle.customerPhone}
                    countryCode={detalle.customerCountryCode || '+595'}
                    category="SERVICE"
                    storageKey={ULTIMA_PLANTILLA_SERVICIO}
                    title={detalle.customerName}
                    preferKey={PLANTILLA_POR_ESTADO[detalle.status] || ''}
                    contexto={contextoWhatsApp(detalle)}
                  />
                )}
                <Button type="button" variant="outline" title="Imprimir recepción (2 copias)" onClick={() => imprimir(detalle, 'recepcion', 'a4')}><Icon name="receipt" className="h-3.5 w-3.5" />Recepción</Button>
                <Button type="button" variant="outline" title="Imprimir recepción 80 mm" onClick={() => imprimir(detalle, 'recepcion', 'thermal')}><Icon name="download" className="h-3.5 w-3.5" />80 mm</Button>
                <Button type="button" variant="outline" title="Reporte técnico" onClick={() => imprimir(detalle, 'reporte')}><Icon name="report" className="h-3.5 w-3.5" />Reporte</Button>
                <Button type="button" variant="outline" title="Enviar a la ticketera" onClick={() => imprimirAgente(detalle)}><Icon name="send" className="h-3.5 w-3.5" />Ticketera</Button>
                <Button type="button" variant="outline" onClick={() => { setDetalleId(null); editar(detalle) }}><Icon name="edit" className="h-3.5 w-3.5" />Editar</Button>
                {SIGUIENTE[detalle.status] && <Button type="button" onClick={() => avanzar(detalle)}>Pasar a {ESTADO_LABEL[SIGUIENTE[detalle.status]]}</Button>}
              </FormActions>
            </div>
          )
        })()}
      </Drawer>

      <Modal open={Boolean(form)} onClose={busy || checklistOpen || catalogoOpen ? undefined : () => { setForm(null); setEditing(null) }} dirty={formSucio} title={editing ? 'Editar orden de servicio' : 'Nueva orden de servicio'} size="amplio">
        {form && (
          <form onSubmit={guardar} className="space-y-3">
            <div className={GRILLA_DOS_COLUMNAS}>
              <FormField label="Cliente *" htmlFor="cliente" error={errorOrden('customerName')}>
                <div className="relative">
                  <Input id="cliente" aria-label="Cliente" value={form.customerName} onChange={(event) => { limpiarOrden('customerName'); set('customerName')(event) }} placeholder="Buscar cliente o escribir el nombre" autoCapitalize="words" />
                  {clientes.length > 0 && (
                    <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-ink-500 bg-paper shadow-xl">
                      {clientes.map(cliente => (
                        <li key={cliente.id}>
                          <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-ink-700" onClick={() => { limpiarOrden('customerName'); setForm(current => ({ ...current, customerName: cliente.name, customerId: cliente.id })) }}>
                            <span className="truncate font-medium text-fore">{cliente.name}</span>
                            <span className="shrink-0 text-xs text-mute">{cliente.phone || cliente.document || ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </FormField>
              <FormField
                label="Dispositivo *"
                hint="El modelo manda: capacidad y color se despliegan después."
                error={errorOrden('device')}
                className="rounded-xl border border-ink-600 bg-ink-800/30 p-3 sm:col-span-2"
              >
                <div className="mt-1" data-testid="recepcion-dispositivo">
                  <BuscadorDispositivo valor={dispositivo} tipo="servicio" onCambio={(siguiente) => { limpiarOrden('device'); cambiarDispositivo(siguiente) }} />
                </div>
              </FormField>
              <div><Label htmlFor="tipo-de-dispositivo">Tipo de dispositivo</Label><Select id="tipo-de-dispositivo" aria-label="Tipo de dispositivo" value={form.deviceType} onChange={event => setForm(current => ({ ...current, deviceType: event.target.value, serviceName: '' }))}>{DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</Select></div>
              <div><Label htmlFor="imei-serial">IMEI / serial</Label><SerialField id="imei-serial" aria-label="IMEI o serial" value={form.serial} onChange={value => setForm(current => ({ ...current, serial: value }))} placeholder="Opcional" /></div>
              <div><Label htmlFor="tecnico">Técnico</Label><Input id="tecnico" aria-label="Técnico" value={form.technicianName} onChange={set('technicianName')} placeholder="Responsable del trabajo" autoCapitalize="words" /></div>
              {editing?.receivedAt && <div><Label>Recibido</Label><p className="mt-2 text-sm text-mute">{fechaHora(editing.receivedAt)}</p></div>}
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Servicios del taller</p>
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCatalogoOpen(true)}>Gestionar catálogo</Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <FormField label="Buscar servicio" htmlFor="buscar-servicio">
                  <SearchField id="buscar-servicio" ariaLabel="Buscar servicio" value={busquedaServicio} onChange={event => setBusquedaServicio(event.target.value)} placeholder="Buscar: display, batería…" />
                </FormField>
                <FormField label="Servicio del catálogo" htmlFor="servicio-catalogo">
                  <Select id="servicio-catalogo" value={form.serviceName} onChange={event => { const servicio = servicios.find(item => item.name === event.target.value); setForm(current => ({ ...current, serviceName: event.target.value, ...(servicio && servicio.suggestedPricePyg > 0 ? { pricePyg: String(servicio.suggestedPricePyg) } : {}) })) }}>
                    <option value="">Sin servicio del catálogo</option>
                    {serviciosDelTipo.map(servicio => <option key={servicio.id} value={servicio.name}>{servicio.name}{servicio.suggestedPricePyg > 0 ? ` · sugerido ${gs(servicio.suggestedPricePyg)}` : ''}</option>)}
                  </Select>
                </FormField>
              </div>
              {serviciosDelTipo.length === 0 && <p className="mt-1 text-xs text-mute">{servicios.length === 0 ? 'El catálogo está vacío: usá "Cargar catálogo sugerido" o agregá servicios desde Gestionar catálogo.' : 'Ningún servicio de este tipo coincide con la búsqueda.'}</p>}
              <p className="mt-1 text-xs text-mute">El precio sugerido es opcional: al elegir el servicio se carga en el precio y lo podés cambiar a mano.</p>
            </div>

            <div><Label htmlFor="falla-reportada">Falla reportada</Label><Textarea id="falla-reportada" rows={2} value={form.reportedIssue} onChange={set('reportedIssue')} placeholder="Qué reporta el cliente" autoCapitalize="sentences" /></div>
            <div><Label htmlFor="diagnostico">Diagnóstico</Label><Textarea id="diagnostico" rows={2} value={form.diagnosis} onChange={set('diagnosis')} placeholder="Diagnóstico técnico y trabajo a realizar" autoCapitalize="sentences" /></div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Inspección de recepción ({form.deviceType})</p>
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setChecklistOpen(true)}>Configurar</Button>
              </div>
              <p className="mt-1 text-xs text-mute">Un solo bloque: tocá el dibujo o la lista. Los 8 primeros puntos son los del dibujo y el resto completa la inspección.</p>
              <div className="mt-3">
                <InspeccionEquipo
                  tipo={form.deviceType}
                  puntos={puntosDe(form.deviceType)}
                  marcados={form.checklist || {}}
                  onChange={(checklist) => setForm(current => ({ ...current, checklist }))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Desbloqueo del equipo</p>
              <p className="mt-1 text-xs text-mute">Se guarda cifrado en la orden y solo lo ven el dueño, el gerente y el técnico.</p>
              <div className={cn('mt-2', GRILLA_DOS_COLUMNAS)}>
                <label className="block space-y-1 text-xs text-mute">PIN o código
                  <Input maxLength={40} value={form.unlockCode || ''} onChange={set('unlockCode')} placeholder="Ej. 1234" inputMode="numeric" />
                </label>
                <div className="text-xs text-mute">
                  <span className="mb-1 block">Patrón (si usa)</span>
                  <PatronDesbloqueo value={form.unlockPattern || []} onChange={(puntos) => setForm(current => ({ ...current, unlockPattern: puntos }))} />
                </div>
              </div>
            </div>

            <div className={GRILLA_DOS_COLUMNAS}>
              <div><Label htmlFor="estado">Estado</Label><Select id="estado" value={form.status} onChange={set('status')}>{ESTADOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></div>
              <div><Label htmlFor="precio-cobrado">Precio cobrado</Label><MoneyInput id="precio-cobrado" value={form.pricePyg} onValueChange={value => setForm(current => ({ ...current, pricePyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Costos del trabajo</p>
              <p className="mt-1 text-xs text-mute">Cargá repuesto, mano de obra y otros; si preferís un número único, usá el costo total directo.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="costo-repuesto">Repuesto (Gs)</Label><MoneyInput id="costo-repuesto" value={form.partsPyg} onValueChange={value => setForm(current => ({ ...current, partsPyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
                <div><Label htmlFor="costo-mano-obra">Mano de obra (Gs)</Label><MoneyInput id="costo-mano-obra" value={form.laborPyg} onValueChange={value => setForm(current => ({ ...current, laborPyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
                <div><Label htmlFor="costo-otros">Otros (Gs)</Label><MoneyInput id="costo-otros" value={form.otherCostPyg} onValueChange={value => setForm(current => ({ ...current, otherCostPyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
              </div>
              <div className={cn('mt-3', GRILLA_DOS_COLUMNAS)}>
                <div><Label htmlFor="costo-total">Costo total directo (Gs)</Label><MoneyInput id="costo-total" value={form.costPyg} onValueChange={value => setForm(current => ({ ...current, costPyg: value === '' ? '' : String(value) }))} placeholder="0" disabled={hayDesgloseForm} />{hayDesgloseForm && <p className="mt-1 text-[11px] text-mute">Con el desglose cargado, el total se calcula solo.</p>}</div>
                <div className="rounded-xl border border-ink-600 p-3 text-sm">
                  <p className="text-xs text-mute">Costo del trabajo</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-warn">{gs(costoTrabajoForm)}</p>
                  <p className="mt-1 text-xs text-mute">Utilidad: <b className={cn('tabular-nums', numeroDe(form.pricePyg) - costoTrabajoForm >= 0 ? 'text-ok' : 'text-bad')}>{gs(numeroDe(form.pricePyg) - costoTrabajoForm)}</b></p>
                </div>
              </div>
            </div>

            <div><Label htmlFor="notas">Notas</Label><Textarea id="notas" rows={2} value={form.notes} onChange={set('notes')} placeholder="Observaciones, repuestos, estado físico" autoCapitalize="sentences" /></div>
            <SaveActions pendiente={busy}>
              <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear orden'}</Button>
            </SaveActions>
          </form>
        )}
      </Modal>

      <Modal open={catalogoOpen} onClose={() => setCatalogoOpen(false)} dirty={catalogoSucio} title="Catálogo de servicios" size="amplio">
        <div className="space-y-3">
          <p className="text-sm text-mute">Servicios por tipo de dispositivo con precio sugerido opcional. El precio de cada orden se puede cambiar a mano.</p>
          <form onSubmit={guardarServicio} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
              <FormField label="Nombre del servicio" htmlFor="catalogo-nombre">
                <Input id="catalogo-nombre" value={servicioEdit.name} onChange={event => setServicioEdit(current => ({ ...current, name: event.target.value }))} placeholder="Ej. Cambio de display" />
              </FormField>
              <FormField label="Tipo" htmlFor="catalogo-tipo">
                <Select id="catalogo-tipo" value={servicioEdit.deviceType} onChange={event => setServicioEdit(current => ({ ...current, deviceType: event.target.value }))}>{DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</Select>
              </FormField>
              <FormField label="Precio sugerido" htmlFor="catalogo-precio">
                <MoneyInput id="catalogo-precio" value={servicioEdit.precio} onValueChange={value => setServicioEdit(current => ({ ...current, precio: value === '' ? '' : String(value) }))} placeholder="Sugerido" />
              </FormField>
            </div>
            <FormActions>
              {servicioEdit.id && <Button type="button" variant="ghost" onClick={() => setServicioEdit({ id: '', name: '', deviceType: 'iPhone', precio: '' })}>Cancelar edición</Button>}
              <Button type="submit" disabled={catalogoBusy}>{servicioEdit.id ? 'Guardar' : 'Agregar'}</Button>
            </FormActions>
          </form>
          <div className="max-h-72 space-y-1 overflow-y-auto" data-testid="catalogo-servicios">
            {servicios.map(servicio => (
              <div key={servicio.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{servicio.name}</span>
                <span className="shrink-0 text-xs text-mute">{servicio.deviceType}</span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-mute">{servicio.suggestedPricePyg > 0 ? gs(servicio.suggestedPricePyg) : 'sin precio'}</span>
                <button type="button" className="shrink-0 text-xs font-semibold text-fono-light hover:underline" onClick={() => setServicioEdit({ id: servicio.id, name: servicio.name, deviceType: servicio.deviceType, precio: servicio.suggestedPricePyg ? String(servicio.suggestedPricePyg) : '' })}>Editar</button>
                <button type="button" className="shrink-0 text-xs font-semibold text-bad hover:underline" onClick={() => quitarServicio(servicio)}>Quitar</button>
              </div>
            ))}
            {!servicios.length && <EmptyState compact icon="store" title="Sin servicios en el catálogo." description="Agregá el primero o cargá el catálogo sugerido." />}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={cargarCatalogoSugerido}>Cargar catálogo sugerido</Button>
          </div>
        </div>
      </Modal>

      <Modal open={checklistOpen} onClose={() => setChecklistOpen(false)} title={`Checklist de recepción · ${form?.deviceType || 'iPhone'}`} size="formulario">
        <div className="space-y-3">
          <p className="text-sm text-mute">Estos puntos se ofrecen al recibir un equipo de este tipo. Los que quites dejan de mostrarse, pero las órdenes viejas conservan lo marcado.</p>
          <div className="max-h-64 space-y-1 overflow-y-auto" data-testid="checklist-puntos">
            {(checklists[form?.deviceType || 'iPhone'] || []).map(item => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-ink-600 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <button type="button" className="shrink-0 text-xs font-semibold text-bad hover:underline" disabled={checklistBusy} onClick={() => quitarPunto(item)}>Quitar</button>
              </div>
            ))}
            {!(checklists[form?.deviceType || 'iPhone'] || []).length && <p className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-sm text-mute">Sin puntos propios: se usa el checklist sugerido del tipo de dispositivo.</p>}
          </div>
          <form onSubmit={agregarPunto} className="flex gap-2">
            <Input aria-label="Nuevo punto del checklist" value={nuevoPunto} onChange={event => setNuevoPunto(event.target.value)} placeholder="Agregar punto (ej. Face ID)" />
            <Button type="submit" disabled={checklistBusy || !nuevoPunto.trim()}>Agregar</Button>
          </form>
          <div className="flex justify-end">
            <Button type="button" variant="outline" disabled={checklistBusy} onClick={cargarChecklistSugerido}>Usar checklist sugerido</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
