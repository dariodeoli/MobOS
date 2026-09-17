import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
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
const FORM_VACIO = { customerName: '', customerId: '', deviceType: 'iPhone', serviceName: '', device: '', serial: '', reportedIssue: '', diagnosis: '', technicianName: '', status: 'RECIBIDO', pricePyg: '', costPyg: '', notes: '', checklist: {} }
const DEVICE_TYPES = ['iPhone', 'MacBook', 'AirPods', 'iPad', 'Apple Watch', 'Otros']
const CHECKLISTS = {
  iPhone: ['Enciende', 'Pantalla', 'Touch', 'Cámaras', 'Micrófono', 'Parlantes', 'Carga', 'Botones', 'Face ID / biometría', 'Wi-Fi / Bluetooth', 'Batería', 'Estado físico'],
  MacBook: ['Enciende', 'Pantalla', 'Teclado', 'Trackpad', 'Puertos', 'Carga', 'Wi-Fi / Bluetooth', 'Batería', 'Estado físico'],
  AirPods: ['Carga', 'Audio', 'Micrófono', 'Cancelación de ruido', 'Estado físico'],
  iPad: ['Enciende', 'Pantalla', 'Touch', 'Cámaras', 'Carga', 'Botones', 'Wi-Fi / Bluetooth', 'Batería', 'Estado físico'],
  'Apple Watch': ['Enciende', 'Pantalla', 'Touch', 'Corona', 'Carga', 'Batería', 'Estado físico'],
  Otros: ['Enciende', 'Funciona', 'Estado físico'],
}
const fecha = (value) => value ? new Date(value).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '') : '—'
const utilidad = (row) => Number(row.pricePyg || 0) - Number(row.costPyg || 0)
// Etiqueta corta para el botón de avance: la completa queda en el title.
const SIGUIENTE_CORTO = { RECIBIDO: 'Recibido', DIAGNOSTICO: 'Diagnóstico', CON_TECNICO: 'Con técnico', ESPERANDO_REPUESTO: 'Repuesto', REPARADO: 'Reparado', LISTO: 'Listo', ENTREGADO: 'Entregado' }

// Tabla compacta: una fila por orden de servicio, encabezados ordenables y el
// avance de estado en la misma línea.
const GRID_SERVICIO = 'grid min-w-[63rem] grid-cols-[minmax(8rem,1.3fr)_minmax(6rem,1fr)_minmax(7rem,1.5fr)_5.5rem_5rem_5.5rem_5.5rem_6.5rem_8.5rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

export default function ServicioTecnico() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('activos')
  const [orden, setOrden] = useState({ key: 'recibido', dir: 'desc' })
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [clientes, setClientes] = useState([])
  const [servicios, setServicios] = useState([])

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

  async function cargarCatalogoSugerido() {
    try {
      const data = await api.post('/api/service-items', { defaults: true })
      setServicios(Array.isArray(data) ? data : [])
      toast.success('Catálogo sugerido cargado.')
    } catch (cause) { toast.error(cause?.message || 'No se pudo cargar el catálogo.') }
  }

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

  async function guardar(event) {
    event.preventDefault()
    if (busy) return
    if (!form.customerName.trim() || !form.device.trim()) { toast.error('Cliente y dispositivo son obligatorios.'); return }
    setBusy(true)
    try {
      const payload = {
        customerName: form.customerName.trim(),
        customerId: form.customerId || undefined,
        device: form.device.trim(),
        serviceName: form.serviceName || undefined,
        checklist: form.checklist || {},
        serial: form.serial.trim(),
        reportedIssue: form.reportedIssue.trim(),
        diagnosis: form.diagnosis.trim(),
        technicianName: form.technicianName.trim(),
        status: form.status,
        pricePyg: Number(String(form.pricePyg || '').replace(/\D/g, '')) || 0,
        costPyg: Number(String(form.costPyg || '').replace(/\D/g, '')) || 0,
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
      status: row.status || 'RECIBIDO', pricePyg: String(row.pricePyg || ''), costPyg: String(row.costPyg || ''), notes: row.notes || '',
      deviceType: (row.serviceName || '').split(' · ')[0] || 'iPhone', serviceName: row.serviceName || '',
      checklist: row.checklist && typeof row.checklist === 'object' && !Array.isArray(row.checklist) ? row.checklist : {},
    })
  }

  const set = (key) => (event) => setForm(current => ({ ...current, [key]: event.target.value }))

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Taller</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Servicio Técnico</h2>
          <p className="mt-1 text-sm text-mute">Recepción, diagnóstico, reparación, costos y entrega de cada equipo.</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">{servicios.length === 0 && <Button variant="outline" onClick={cargarCatalogoSugerido}>Cargar catálogo sugerido</Button>}<Button onClick={() => { setEditing(null); setForm({ ...FORM_VACIO }) }}>+ Nueva orden</Button></span>
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
        <div className="overflow-x-auto" data-testid="servicio-tabla">
          <div className={cn(GRID_SERVICIO, 'px-3.5 pb-2 pt-1')}>
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
                <span className="min-w-0">
                  <b className="block truncate text-sm" title={row.device}>{row.device || 'Equipo'}</b>
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
                  {SIGUIENTE[row.status] && <Button variant="outline" className="h-8 whitespace-nowrap px-2 text-xs" title={`Pasar a ${ESTADO_LABEL[SIGUIENTE[row.status]]}`} onClick={() => avanzar(row)}>{SIGUIENTE_CORTO[SIGUIENTE[row.status]]}</Button>}
                  <Button variant="ghost" className="h-8 px-2 text-xs" aria-label={`Editar orden de ${row.device || 'servicio'}`} onClick={() => editar(row)}><Icon name="edit" className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            })}
          </div>
        </div>
      )}

      <Modal open={Boolean(form)} onClose={() => { if (!busy) { setForm(null); setEditing(null) } }} title={editing ? 'Editar orden de servicio' : 'Nueva orden de servicio'} className="max-w-2xl">
        {form && (
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <Label>Cliente *</Label>
                <Input aria-label="Cliente" value={form.customerName} onChange={set('customerName')} placeholder="Buscar cliente o escribir el nombre" autoCapitalize="words" />
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
              <div><Label>Dispositivo *</Label><Input aria-label="Dispositivo" value={form.device} onChange={set('device')} placeholder="iPhone 15 Pro · 256 GB" autoCapitalize="words" /></div>
              <div><Label>Tipo de dispositivo</Label><Select aria-label="Tipo de dispositivo" value={form.deviceType} onChange={event => setForm(current => ({ ...current, deviceType: event.target.value, serviceName: '' }))}>{DEVICE_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}</Select></div>
              <div><Label>Servicio del catálogo</Label><Select aria-label="Servicio del catálogo" value={form.serviceName} onChange={event => { const servicio = servicios.find(item => item.name === event.target.value); setForm(current => ({ ...current, serviceName: event.target.value, ...(servicio && servicio.suggestedPricePyg > 0 ? { pricePyg: String(servicio.suggestedPricePyg) } : {}) })) }}><option value="">Sin servicio del catálogo</option>{servicios.filter(servicio => servicio.deviceType === form.deviceType).map(servicio => <option key={servicio.id} value={servicio.name}>{servicio.name}{servicio.suggestedPricePyg > 0 ? ` · ${gs(servicio.suggestedPricePyg)}` : ''}</option>)}</Select></div>
              <div><Label>IMEI / serial</Label><Input aria-label="IMEI o serial" value={form.serial} onChange={set('serial')} placeholder="Opcional" autoCapitalize="characters" /></div>
              <div><Label>Técnico</Label><Input aria-label="Técnico" value={form.technicianName} onChange={set('technicianName')} placeholder="Responsable del trabajo" autoCapitalize="words" /></div>
            </div>
            <div><Label>Falla reportada</Label><Textarea rows={2} value={form.reportedIssue} onChange={set('reportedIssue')} placeholder="Qué reporta el cliente" autoCapitalize="sentences" /></div>
            <div><Label>Diagnóstico</Label><Textarea rows={2} value={form.diagnosis} onChange={set('diagnosis')} placeholder="Diagnóstico técnico y trabajo a realizar" autoCapitalize="sentences" /></div>
            <div>
              <Label>Checklist de recepción ({form.deviceType})</Label>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-3">{(CHECKLISTS[form.deviceType] || CHECKLISTS.Otros).map(punto => <label key={punto} className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" className="h-4 w-4 accent-fono" checked={Boolean((form.checklist || {})[punto])} onChange={event => setForm(current => ({ ...current, checklist: { ...(current.checklist || {}), [punto]: event.target.checked } }))} />{punto}</label>)}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Estado</Label><Select value={form.status} onChange={set('status')}>{ESTADOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></div>
              <div><Label>Precio cobrado</Label><MoneyInput value={form.pricePyg} onValueChange={value => setForm(current => ({ ...current, pricePyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
              <div><Label>Costo total</Label><MoneyInput value={form.costPyg} onValueChange={value => setForm(current => ({ ...current, costPyg: value === '' ? '' : String(value) }))} placeholder="0" /></div>
            </div>
            <p className="text-xs text-mute">Utilidad del servicio: <b className="text-fore">{gs((Number(form.pricePyg) || 0) - (Number(form.costPyg) || 0))}</b></p>
            <div><Label>Notas</Label><Textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Observaciones, repuestos, estado físico" autoCapitalize="sentences" /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setForm(null); setEditing(null) }}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear orden'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}
