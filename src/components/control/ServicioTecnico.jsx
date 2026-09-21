import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import BarraLote from '@/components/shared/BarraLote'
import EsquemaEquipo from '@/components/shared/EsquemaEquipo'
import PatronDesbloqueo from '@/components/shared/PatronDesbloqueo'
import Icon from '@/components/shared/Icon'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import SerialField from '@/components/shared/SerialField'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { ticketRecepcionServicio } from '@/lib/printing/tickets'
import { imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { useSesion } from '@/lib/sesion'
import { buildServiceIntakeHtml, buildServiceReportHtml, ordenParaImpresion } from '@/lib/servicioImpresion'
import { CHECKLISTS } from '@/lib/servicioChecklist'
import { api } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { coincideCliente } from '@/utils/cliente'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'

// Pipeline del taller: recepción → diagnóstico → reparación → entrega.
const ESTADOS = [
  ['RECIBIDO', 'Recibido', 'slate'],
  ['DIAGNOSTICO', 'Diagnóstico', 'blue'],
  ['CON_TECNICO', 'Con técnico', 'blue'],
  ['ESPERANDO_REPUESTO', 'Esperando repuesto', 'orange'],
  ['REPARADO', 'Reparado', 'green'],
  ['LISTO', 'Listo para retirar', 'green'],
  ['ENTREGADO', 'Entregado', 'slate'],
  ['CANCELADO', 'Cancelado', 'red'],
]
const ESTADO_LABEL = Object.fromEntries(ESTADOS.map(([id, label]) => [id, label]))
const ESTADO_TONE = Object.fromEntries(ESTADOS.map(([id, , tone]) => [id, tone]))
const SIGUIENTE = { RECIBIDO: 'DIAGNOSTICO', DIAGNOSTICO: 'CON_TECNICO', CON_TECNICO: 'ESPERANDO_REPUESTO', ESPERANDO_REPUESTO: 'REPARADO', REPARADO: 'LISTO', LISTO: 'ENTREGADO' }
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

// Tabla compacta: una fila por orden de servicio, encabezados ordenables y el
// avance de estado en la misma línea.
const GRID_SERVICIO = 'grid min-w-[65rem] grid-cols-[1.75rem_minmax(8rem,1.3fr)_minmax(6rem,1fr)_minmax(7rem,1.5fr)_5.5rem_5rem_5.5rem_5.5rem_6.5rem_8.5rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
// Última plantilla elegida para el taller: se recuerda entre órdenes.
const ULTIMA_PLANTILLA_SERVICIO = 'mobos:plantilla:servicio'

export default function ServicioTecnico() {
  const toast = useToast()
  const { empresa } = useSesion()
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

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.get('/api/service-orders')
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las órdenes de servicio.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const cargarServicios = useCallback(async () => {
    try {
      const data = await api.get('/api/service-items')
      setServicios(Array.isArray(data) ? data : [])
    } catch { setServicios([]) }
  }, [])
  useEffect(() => { cargarServicios() }, [cargarServicios])

  // Checklist configurable por tipo de dispositivo: si la tienda no definió
  // puntos, se usa la lista sugerida del módulo.
  const cargarChecklists = useCallback(async () => {
    try {
      const data = await api.get('/api/service-checklists')
      const mapa = {}
      for (const item of Array.isArray(data) ? data : []) (mapa[item.deviceType] ||= []).push(item)
      setChecklists(mapa)
    } catch { setChecklists({}) }
  }, [])
  useEffect(() => { cargarChecklists() }, [cargarChecklists])
  const puntosDe = (deviceType) => checklists[deviceType]?.length ? checklists[deviceType].map(item => item.label) : (CHECKLISTS[deviceType] || CHECKLISTS.Otros)

  useEffect(() => {
    const query = (form?.customerName || '').trim()
    if (query.length < 2) { setClientes([]); return undefined }
    let active = true
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/api/customers?q=${encodeURIComponent(query)}`)
        if (active) setClientes((Array.isArray(data) ? data : []).filter(cliente => coincideCliente(cliente, query)).slice(0, 5))
      } catch { if (active) setClientes([]) }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [form?.customerName])

  const conteos = useMemo(() => {
    const base = { activos: 0, ...Object.fromEntries(ESTADOS.map(([id]) => [id, 0])) }
    for (const row of rows) {
      base[row.status] = (base[row.status] || 0) + 1
      if (!['ENTREGADO', 'CANCELADO'].includes(row.status)) base.activos++
    }
    return base
  }, [rows])

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
    if (orden.key === 'recientes') return lista
    const factor = orden.dir === 'asc' ? 1 : -1
    return [...lista].sort((a, b) => {
      const va = valorOrden(a, orden.key); const vb = valorOrden(b, orden.key)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [rows, filtro, q, orden])

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
    if (!form.customerName.trim() || !form.device.trim()) { toast.error('Cliente y dispositivo son obligatorios.'); return }
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
      await api.patch('/api/service-items', { id: item.id, isActive: false })
      await cargarServicios()
      toast.success('Servicio quitado del catálogo.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo quitar el servicio.') } finally { setCatalogoBusy(false) }
  }
  async function cargarCatalogoSugerido() {
    try {
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
      await api.post('/api/service-checklists', { deviceType: form?.deviceType || 'iPhone', label })
      setNuevoPunto('')
      await cargarChecklists()
    } catch (cause) { toast.error(cause?.message || 'No se pudo agregar el punto.') } finally { setChecklistBusy(false) }
  }
  async function quitarPunto(item) {
    if (checklistBusy) return
    setChecklistBusy(true)
    try {
      await api.patch('/api/service-checklists', { id: item.id, isActive: false })
      await cargarChecklists()
    } catch (cause) { toast.error(cause?.message || 'No se pudo quitar el punto.') } finally { setChecklistBusy(false) }
  }
  async function cargarChecklistSugerido() {
    if (checklistBusy) return
    setChecklistBusy(true)
    try {
      const labels = CHECKLISTS[form?.deviceType] || CHECKLISTS.Otros
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

  const alternar = (id) => setSeleccionados((actuales) => alternarId(actuales, id))
  const seleccionarVisibles = () => setSeleccionados((actuales) => seleccionarTodos(visibles, actuales))
  const avanzarSeleccionadas = async () => {
    const filas = visibles.filter((row) => seleccionados.includes(row.id) && SIGUIENTE[row.status])
    if (!filas.length) { toast.error('Ninguna de las seleccionadas tiene un estado siguiente.'); return }
    for (const row of filas) await avanzar(row)
    setSeleccionados([])
    toast.success(`${filas.length} orden(es) avanzadas.`)
  }

  async function avanzar(row) {
    const siguiente = SIGUIENTE[row.status]
    if (!siguiente) return
    try {
      await api.patch('/api/service-orders', { id: row.id, status: siguiente })
      toast.success(`${row.device}: ${ESTADO_LABEL[siguiente]}.`)
      await load()
    } catch (cause) { toast.error(cause?.message || 'No se pudo avanzar el estado.') }
  }

  function editar(row) {
    setEditing(row)
    setForm({
      customerName: row.customerName || '', customerId: row.customerId || '', device: row.device || '', serial: row.serial || '',
      reportedIssue: row.reportedIssue || '', diagnosis: row.diagnosis || '', technicianName: row.technicianName || '',
      status: row.status || 'RECIBIDO', pricePyg: String(row.pricePyg || ''), costPyg: String(row.costPyg || ''),
      partsPyg: row.partsPyg ? String(row.partsPyg) : '', laborPyg: row.laborPyg ? String(row.laborPyg) : '', otherCostPyg: row.otherCostPyg ? String(row.otherCostPyg) : '',
      notes: row.notes || '',
      deviceType: (row.serviceName || '').split(' · ')[0] || 'iPhone', serviceName: row.serviceName || '',
      checklist: row.checklist && typeof row.checklist === 'object' && !Array.isArray(row.checklist) ? row.checklist : {},
      unlockCode: row.desbloqueo?.pin || '',
      unlockPattern: Array.isArray(row.desbloqueo?.patron) ? row.desbloqueo.patron : [],
    })
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Recepción, diagnóstico, reparación, costos y entrega de cada equipo.</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {servicios.length === 0 && <Button variant="outline" onClick={cargarCatalogoSugerido}>Cargar catálogo sugerido</Button>}
          <Button variant="outline" onClick={() => setCatalogoOpen(true)}>Catálogo</Button>
          <Button onClick={() => { setEditing(null); setForm({ ...FORM_VACIO }) }}>+ Nueva orden</Button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">
          {[['activos', `Activos (${conteos.activos})`], ...ESTADOS.map(([id, label]) => [id, `${label} (${conteos[id] || 0})`]), ['todos', 'Todos']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setFiltro(key)} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>
          ))}
        </div>
        <div className="min-w-[200px] flex-1"><Input aria-label="Buscar órdenes de servicio" placeholder="Cliente, equipo, IMEI, falla o técnico" value={q} onChange={event => setQ(event.target.value)} /></div>
        <Button variant="outline" onClick={load} disabled={loading}>Actualizar</Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {loading && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
      {!loading && !visibles.length && <EmptyState icon="refresh" title={q ? 'Ninguna orden coincide con la búsqueda.' : 'Todavía no hay órdenes de servicio.'} />}
      {!loading && visibles.length > 0 && (
        <div className="grid grid-cols-3 divide-ink-600 rounded-xl border border-ink-600 bg-ink-800/60 text-center sm:divide-x">
          <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Facturado</p><p className="mt-1 text-lg font-semibold tabular-nums">{gs(totales.facturado)}</p></div>
          <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Costos</p><p className="mt-1 text-lg font-semibold tabular-nums text-warn">{gs(totales.costos)}</p></div>
          <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-mute">Utilidad</p><p className={cn('mt-1 text-lg font-semibold tabular-nums', totales.facturado - totales.costos >= 0 ? 'text-ok' : 'text-bad')}>{gs(totales.facturado - totales.costos)}</p></div>
        </div>
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
            <span className={cn(CELDA, 'text-right')}>Acciones</span>
          </div>
          <div className="space-y-1">
            {visibles.map(row => {
              const ganancia = utilidad(row)
              const serial = String(row.serial || '')
              return <div key={row.id} data-testid="servicio-fila" className={cn(GRID_SERVICIO, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
                <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar la orden de ${row.device || 'servicio'}`} checked={seleccionados.includes(row.id)} onChange={() => alternar(row.id)} />
                <span className="min-w-0">
                  <b className="block truncate text-sm" title={row.device}>{row.device || 'Equipo'}</b>
                  {row.serviceNumber && <span className="mt-0.5 block truncate text-[10px] font-semibold text-fono-light tabular-nums">{row.serviceNumber}</span>}
                  {serial && <SerialTexto serial={serial} className="mt-0.5 truncate text-[10px] text-mute" />}
                </span>
                <span className="truncate text-xs text-mute" title={row.customerName}>{row.customerName || 'Sin cliente'}</span>
                <span className="truncate text-xs text-mute" title={row.reportedIssue || row.diagnosis || undefined}>{row.reportedIssue || row.diagnosis || 'Sin detalle'}</span>
                <span className="truncate text-xs text-mute">{row.technicianName || 'Sin técnico'}</span>
                <span className="truncate text-xs text-mute">{fecha(row.receivedAt)}</span>
                <span className="truncate text-right text-xs tabular-nums text-mute">{gs(row.pricePyg || 0)}</span>
                <span className={cn('truncate text-right text-xs font-semibold tabular-nums', ganancia >= 0 ? 'text-ok' : 'text-bad')}>{ganancia >= 0 ? '+' : ''}{gs(ganancia)}</span>
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
                      contexto={{
                        cliente: row.customerName || '',
                        nombre: (row.customerName || '').split(' ')[0] || '',
                        equipo: row.device || '',
                        producto: row.deviceType || row.device || '',
                        servicio: row.serviceName || row.reportedIssue || row.diagnosis || '',
                        estado: ESTADO_LABEL[row.status] || row.status || '',
                        total: Number(row.pricePyg || 0) > 0 ? gs(row.pricePyg) : '',
                        fecha: row.receivedAt ? new Date(row.receivedAt).toLocaleDateString('es-PY') : '',
                      }}
                    />
                  )}
                  {SIGUIENTE[row.status] && <Button variant="outline" className="h-8 whitespace-nowrap px-2 text-xs" title={`Pasar a ${ESTADO_LABEL[SIGUIENTE[row.status]]}`} onClick={() => avanzar(row)}>{SIGUIENTE_CORTO[SIGUIENTE[row.status]]}</Button>}
                  <Button variant="ghost" className="h-8 px-2 text-xs" title="Imprimir recepción (2 copias)" aria-label={`Imprimir recepción de ${row.device || 'servicio'}`} onClick={() => imprimir(row, 'recepcion', 'a4')}><Icon name="receipt" className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" className="h-8 px-2 text-xs" title="Imprimir recepción 80 mm" aria-label={`Imprimir recepción 80 mm de ${row.device || 'servicio'}`} onClick={() => imprimir(row, 'recepcion', 'thermal')}><Icon name="download" className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" className="h-8 px-2 text-xs" title="Reporte técnico" aria-label={`Imprimir reporte técnico de ${row.device || 'servicio'}`} onClick={() => imprimir(row, 'reporte')}><Icon name="report" className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" className="h-8 px-2 text-xs" title="Enviar a la ticketera" aria-label={`Enviar a la ticketera la recepción de ${row.device || 'servicio'}`} onClick={() => imprimirAgente(row)}><Icon name="send" className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" className="h-8 px-2 text-xs" aria-label={`Editar orden de ${row.device || 'servicio'}`} onClick={() => editar(row)}><Icon name="edit" className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            })}
          </div>
        </div>
      )}

      <Modal open={Boolean(form)} onClose={busy || checklistOpen || catalogoOpen ? undefined : () => { setForm(null); setEditing(null) }} title={editing ? 'Editar orden de servicio' : 'Nueva orden de servicio'} className="max-w-2xl">
        {form && (
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <Label htmlFor="cliente">Cliente *</Label>
                <Input id="cliente" aria-label="Cliente" value={form.customerName} onChange={set('customerName')} placeholder="Buscar cliente o escribir el nombre" autoCapitalize="words" />
                {clientes.length > 0 && (
                  <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-ink-500 bg-paper shadow-xl">
                    {clientes.map(cliente => (
                      <li key={cliente.id}>
                        <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-ink-700" onClick={() => setForm(current => ({ ...current, customerName: cliente.name, customerId: cliente.id }))}>
                          <span className="truncate font-medium text-fore">{cliente.name}</span>
                          <span className="shrink-0 text-xs text-mute">{cliente.phone || cliente.document || ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div><Label htmlFor="dispositivo">Dispositivo *</Label><Input id="dispositivo" aria-label="Dispositivo" value={form.device} onChange={set('device')} placeholder="iPhone 15 Pro · 256 GB" autoCapitalize="words" /></div>
              <div><Label htmlFor="tipo-de-dispositivo">Tipo de dispositivo</Label><Select id="tipo-de-dispositivo" aria-label="Tipo de dispositivo" value={form.deviceType} onChange={event => setForm(current => ({ ...current, deviceType: event.target.value, serviceName: '' }))}>{DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</Select></div>
              <div><Label htmlFor="imei-serial">IMEI / serial</Label><SerialField id="imei-serial" aria-label="IMEI o serial" value={form.serial} onChange={value => setForm(current => ({ ...current, serial: value }))} placeholder="Opcional" /></div>
              <div><Label htmlFor="tecnico">Técnico</Label><Input id="tecnico" aria-label="Técnico" value={form.technicianName} onChange={set('technicianName')} placeholder="Responsable del trabajo" autoCapitalize="words" /></div>
              {editing?.receivedAt && <div><Label>Recibido</Label><p className="mt-2 text-sm text-mute">{new Date(editing.receivedAt).toLocaleString('es-PY')}</p></div>}
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="buscar-servicio">Servicio del catálogo</Label>
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCatalogoOpen(true)}>Gestionar catálogo</Button>
              </div>
              <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <Input id="buscar-servicio" aria-label="Buscar servicio" value={busquedaServicio} onChange={event => setBusquedaServicio(event.target.value)} placeholder="Buscar: display, batería…" />
                <Select aria-label="Servicio del catálogo" value={form.serviceName} onChange={event => { const servicio = servicios.find(item => item.name === event.target.value); setForm(current => ({ ...current, serviceName: event.target.value, ...(servicio && servicio.suggestedPricePyg > 0 ? { pricePyg: String(servicio.suggestedPricePyg) } : {}) })) }}>
                  <option value="">Sin servicio del catálogo</option>
                  {serviciosDelTipo.map(servicio => <option key={servicio.id} value={servicio.name}>{servicio.name}{servicio.suggestedPricePyg > 0 ? ` · sugerido ${gs(servicio.suggestedPricePyg)}` : ''}</option>)}
                </Select>
              </div>
              {serviciosDelTipo.length === 0 && <p className="mt-1 text-xs text-mute">{servicios.length === 0 ? 'El catálogo está vacío: usá "Cargar catálogo sugerido" o agregá servicios desde Gestionar catálogo.' : 'Ningún servicio de este tipo coincide con la búsqueda.'}</p>}
              <p className="mt-1 text-xs text-mute">El precio sugerido es opcional: al elegir el servicio se carga en el precio y lo podés cambiar a mano.</p>
            </div>

            <div><Label htmlFor="falla-reportada">Falla reportada</Label><Textarea id="falla-reportada" rows={2} value={form.reportedIssue} onChange={set('reportedIssue')} placeholder="Qué reporta el cliente" autoCapitalize="sentences" /></div>
            <div><Label htmlFor="diagnostico">Diagnóstico</Label><Textarea id="diagnostico" rows={2} value={form.diagnosis} onChange={set('diagnosis')} placeholder="Diagnóstico técnico y trabajo a realizar" autoCapitalize="sentences" /></div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-mute">Checklist de recepción ({form.deviceType})</p>
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setChecklistOpen(true)}>Configurar</Button>
              </div>
              <p className="mt-1 text-xs text-mute">Estado físico y pruebas al recibir el equipo. Los puntos se configuran por tipo de dispositivo.</p>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <EsquemaEquipo tipo={form.deviceType} marcados={form.checklist || {}} onToggle={(punto) => setForm(current => ({ ...current, checklist: { ...(current.checklist || {}), [punto]: !(current.checklist || {})[punto] } }))} />
                <div className="min-w-[16rem] flex-1"><div className="grid gap-1.5 sm:grid-cols-3">{puntosDe(form.deviceType).map(punto => <label key={punto} className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" className="h-4 w-4 accent-fono" checked={Boolean((form.checklist || {})[punto])} onChange={event => setForm(current => ({ ...current, checklist: { ...(current.checklist || {}), [punto]: event.target.checked } }))} />{punto}</label>)}</div></div>
              </div>
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-800/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-mute">Desbloqueo del equipo</p>
              <p className="mt-1 text-xs text-mute">Se guarda cifrado en la orden y solo lo ven el dueño, el gerente y el técnico.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs text-mute">PIN o código
                  <Input maxLength={40} value={form.unlockCode || ''} onChange={set('unlockCode')} placeholder="Ej. 1234" inputMode="numeric" />
                </label>
                <div className="text-xs text-mute">
                  <span className="mb-1 block">Patrón (si usa)</span>
                  <PatronDesbloqueo value={form.unlockPattern || []} onChange={(puntos) => setForm(current => ({ ...current, unlockPattern: puntos }))} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="costo-total">Costo total directo (Gs)</Label><MoneyInput id="costo-total" value={form.costPyg} onValueChange={value => setForm(current => ({ ...current, costPyg: value === '' ? '' : String(value) }))} placeholder="0" disabled={hayDesgloseForm} />{hayDesgloseForm && <p className="mt-1 text-[11px] text-mute">Con el desglose cargado, el total se calcula solo.</p>}</div>
                <div className="rounded-xl border border-ink-600 p-3 text-sm">
                  <p className="text-xs text-mute">Costo del trabajo</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-warn">{gs(costoTrabajoForm)}</p>
                  <p className="mt-1 text-xs text-mute">Utilidad: <b className={cn('tabular-nums', numeroDe(form.pricePyg) - costoTrabajoForm >= 0 ? 'text-ok' : 'text-bad')}>{gs(numeroDe(form.pricePyg) - costoTrabajoForm)}</b></p>
                </div>
              </div>
            </div>

            <div><Label htmlFor="notas">Notas</Label><Textarea id="notas" rows={2} value={form.notes} onChange={set('notes')} placeholder="Observaciones, repuestos, estado físico" autoCapitalize="sentences" /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setForm(null); setEditing(null) }}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear orden'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={catalogoOpen} onClose={() => setCatalogoOpen(false)} title="Catálogo de servicios" className="max-w-2xl">
        <div className="space-y-3">
          <p className="text-sm text-mute">Servicios por tipo de dispositivo con precio sugerido opcional. El precio de cada orden se puede cambiar a mano.</p>
          <form onSubmit={guardarServicio} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]">
            <Input aria-label="Nombre del servicio" value={servicioEdit.name} onChange={event => setServicioEdit(current => ({ ...current, name: event.target.value }))} placeholder="Ej. Cambio de display" />
            <Select aria-label="Tipo del servicio" value={servicioEdit.deviceType} onChange={event => setServicioEdit(current => ({ ...current, deviceType: event.target.value }))}>{DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</Select>
            <MoneyInput aria-label="Precio sugerido" value={servicioEdit.precio} onValueChange={value => setServicioEdit(current => ({ ...current, precio: value === '' ? '' : String(value) }))} placeholder="Sugerido" />
            <Button type="submit" disabled={catalogoBusy}>{servicioEdit.id ? 'Guardar' : 'Agregar'}</Button>
          </form>
          {servicioEdit.id && <button type="button" className="text-xs text-mute underline" onClick={() => setServicioEdit({ id: '', name: '', deviceType: 'iPhone', precio: '' })}>Cancelar edición</button>}
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

      <Modal open={checklistOpen} onClose={() => setChecklistOpen(false)} title={`Checklist de recepción · ${form?.deviceType || 'iPhone'}`} className="max-w-xl">
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
