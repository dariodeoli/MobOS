import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { formatGs } from '@/utils/moneda'
import { codigoPedido } from '@/utils/pedido'
import { whatsappUrl } from './customerMessaging'
import Icon from '@/components/shared/Icon'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui'

const ORDER_STATUS = {
  PENDING: { label: 'Pendiente', color: 'orange' },
  REGISTERED: { label: 'Registrado', color: 'blue' },
  COMPLETED: { label: 'Completado', color: 'green' },
  CANCELLED: { label: 'Cancelado', color: 'red' },
}
const FULFILLMENT_STATUS = {
  PROCESSING: { label: 'Preparando', color: 'blue' },
  IN_TRANSIT: { label: 'En camino', color: 'orange' },
  READY_FOR_PICKUP: { label: 'Listo para retirar', color: 'green' },
  DELIVERED: { label: 'Entregado', color: 'slate' },
}
const WARRANTY_STATUS = {
  RECEIVED: { label: 'Recibida', color: 'orange' },
  DIAGNOSIS: { label: 'En diagnóstico', color: 'blue' },
  READY: { label: 'Lista', color: 'green' },
  DELIVERED: { label: 'Entregada', color: 'slate' },
}
const FOLLOW_UP_KINDS = {
  CALL: { label: 'Llamada', color: 'blue' },
  WHATSAPP: { label: 'WhatsApp', color: 'green' },
  VISIT: { label: 'Visita', color: 'orange' },
  OTHER: { label: 'Otro', color: 'slate' },
}
const STATUS_BADGE = (map, value) => {
  const item = map[value]
  return item ? <Badge color={item.color}>{item.label}</Badge> : <Badge>{value || 'Sin estado'}</Badge>
}
const fecha = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString('es-PY') : '—')
const fechaHora = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

const TABS = [
  { key: 'compras', label: 'Compras' },
  { key: 'dispositivos', label: 'Dispositivos' },
  { key: 'garantias', label: 'Garantías' },
  { key: 'notas', label: 'Notas' },
  { key: 'seguimientos', label: 'Seguimientos' },
  { key: 'cronologia', label: 'Cronología' },
]

// Un icono y un tono por tipo de evento de la cronología del cliente.
const EVENTOS = {
  customer: { icon: 'user', tono: 'bg-fono/10 text-fono-light' },
  order: { icon: 'receipt', tono: 'bg-ink-700 text-fore' },
  payment: { icon: 'money', tono: 'bg-ok/10 text-ok' },
  note: { icon: 'report', tono: 'bg-warn/10 text-warn' },
  followUp: { icon: 'clock', tono: 'bg-ink-700 text-mute' },
  warranty: { icon: 'package', tono: 'bg-fono/10 text-fono-light' },
  audit: { icon: 'edit', tono: 'bg-ink-700 text-mute' },
}
const conCodigos = (texto) => String(texto || '').replace(/MOB-(\d+)/g, 'MOB #$1')

export default function CustomerProfile({ customer, open, onClose }) {
  const toast = useToast()
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('compras')
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [noteBusy, setNoteBusy] = useState(false)
  const [followForm, setFollowForm] = useState({ kind: 'CALL', dueAt: '', note: '' })
  const [followBusy, setFollowBusy] = useState(false)
  const [followDoneId, setFollowDoneId] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [timeline, setTimeline] = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')
  const [timelineRevision, setTimelineRevision] = useState(0)

  useEffect(() => {
    if (!open || !customer?.id) return undefined
    let active = true
    setLoading(true)
    setError('')
    setTab('compras')
    setTimeline([])
    setTimelineError('')
    setProfile(null)
    setNewNote('')
    setEditingNote(null)
    setFollowForm({ kind: 'CALL', dueAt: '', note: '' })
    api
      .get(`/api/customers/${customer.id}`)
      .then((data) => { if (active) { setProfile(data); setLoading(false) } })
      .catch((cause) => {
        if (active) setError(cause?.message || 'No se pudo cargar el perfil del cliente.')
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, revision])

  // Cronología del cliente: se pide al abrir su pestaña y al reintentar.
  useEffect(() => {
    if (!open || !customer?.id || tab !== 'cronologia') return undefined
    let active = true
    setTimelineLoading(true)
    setTimelineError('')
    api
      .get(`/api/customers/${customer.id}/timeline`)
      .then((data) => { if (active) { setTimeline(Array.isArray(data?.events) ? data.events : []); setTimelineLoading(false) } })
      .catch((cause) => {
        if (active) setTimelineError(cause?.message || 'No se pudo cargar la cronología.')
        if (active) setTimelineLoading(false)
      })
    return () => { active = false }
  }, [open, customer?.id, tab, timelineRevision])

  const refresh = () => setRevision((value) => value + 1)
  const phone = profile?.customer?.phone || customer?.phone || ''
  const documentValue = profile?.customer?.document || customer?.document || ''
  const orders = profile?.orders || []
  const warranties = profile?.warranties || []
  const notes = profile?.notes || []
  const followUps = profile?.followUps || []
  const totalComprado = orders.reduce((sum, order) => sum + Number(order.totalPyg || 0), 0)
  const deuda = Number(profile?.debtPyg ?? 0)
  const garantiasActivas = warranties.filter((item) => item.status !== 'DELIVERED').length

  const dispositivos = orders.flatMap(order => (order.items || []).flatMap(item => (item.serials || []).map(serial => ({ serial, model: item.description, date: order.createdAt, orderNumber: order.orderNumber, warranty: warranties.find(warranty => warranty.serial === serial) || null }))))
  const tabCounts = { compras: orders.length, dispositivos: dispositivos.length, garantias: warranties.length, notas: notes.length, seguimientos: followUps.length }

  async function saveNote(event) {
    event.preventDefault()
    const content = newNote.trim()
    if (!content || noteBusy) return
    setNoteBusy(true)
    try {
      if (editingNote) {
        await api.patch(`/api/customers/${customer.id}/notes`, { id: editingNote.id, content })
        toast.success('Nota actualizada')
      } else {
        await api.post(`/api/customers/${customer.id}/notes`, { content })
        toast.success('Nota guardada')
      }
      setNewNote('')
      setEditingNote(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo guardar la nota', cause?.message)
    } finally {
      setNoteBusy(false)
    }
  }

  async function removeNote() {
    if (!pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.delete(`/api/customers/${customer.id}/notes`, { id: pendingDelete.id })
      toast.success('Nota eliminada')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar la nota', cause?.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function saveFollowUp(event) {
    event.preventDefault()
    const note = followForm.note.trim()
    if (!note || followBusy) return
    setFollowBusy(true)
    try {
      await api.post(`/api/customers/${customer.id}/follow-ups`, { kind: followForm.kind, note, dueAt: followForm.dueAt || undefined })
      toast.success('Seguimiento agendado')
      setFollowForm({ kind: 'CALL', dueAt: '', note: '' })
      refresh()
    } catch (cause) {
      toast.error('No se pudo agendar el seguimiento', cause?.message)
    } finally {
      setFollowBusy(false)
    }
  }

  async function markDone(item) {
    if (item.doneAt || followDoneId) return
    setFollowDoneId(item.id)
    try {
      await api.patch(`/api/customers/${customer.id}/follow-ups`, { id: item.id, doneAt: new Date().toISOString() })
      toast.success('Seguimiento marcado como hecho')
      refresh()
    } catch (cause) {
      toast.error('No se pudo actualizar el seguimiento', cause?.message)
    } finally {
      setFollowDoneId('')
    }
  }

  async function removeFollowUp() {
    if (!pendingDelete || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api.delete(`/api/customers/${customer.id}/follow-ups`, { id: pendingDelete.id })
      toast.success('Seguimiento eliminado')
      setPendingDelete(null)
      refresh()
    } catch (cause) {
      toast.error('No se pudo eliminar el seguimiento', cause?.message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Cliente: ${customer?.name || ''}`} className="max-w-2xl">
      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {!loading && error && (
        <EmptyState
          icon="alert"
          title="No se pudo abrir el perfil"
          description={error}
          action={<Button onClick={refresh}>Reintentar</Button>}
        />
      )}
      {!loading && !error && profile && (
        <div className="space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold">{profile.customer?.name || customer?.name}</h3>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
                {documentValue && <span>{documentValue}</span>}
                {phone && <span>{phone}</span>}
                {profile.customer?.email && <span className="truncate">{profile.customer.email}</span>}
              </p>
              <p className="mt-1 text-xs text-mute">
                Cliente desde {fecha(profile.customer?.createdAt)} · Creado por {profile.customer?.createdBy?.name || 'Sistema'}
              </p>
              {(profile.customer?.billingName || profile.customer?.billingDocument) && (
                <p className="mt-1 text-xs text-mute">
                  Factura a: <b className="text-fore">{profile.customer.billingName || 'Sin razón social'}</b>
                  {profile.customer.billingDocument ? ` · RUC ${profile.customer.billingDocument}` : ''}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {profile.customer?.taxExempt && <Badge color="blue">Exento de impuestos</Badge>}
                {profile.customer?.acceptsWhatsappMarketing && <Badge color="green">WhatsApp marketing</Badge>}
                {profile.customer?.acceptsSmsMarketing && <Badge color="green">SMS marketing</Badge>}
                {profile.customer?.acceptsEmailMarketing && <Badge color="green">Email marketing</Badge>}
                {(profile.customer?.tags || []).map((tag) => <Badge key={tag} color="slate">{tag}</Badge>)}
              </div>
            </div>
            {phone && (
              <a
                className="inline-flex items-center gap-2 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                href={whatsappUrl(phone, `Hola ${profile.customer?.name || customer?.name || ''}, te escribimos de MobOS.`, customer?.countryCode)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="send" className="h-4 w-4" />
                Enviar WhatsApp
              </a>
            )}
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Total comprado</p>
              <p className="mt-1 text-lg font-semibold text-fore">{formatGs(totalComprado)}</p>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Saldo pendiente</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-lg font-semibold text-fore">{formatGs(deuda)}</p>
                <Badge color={deuda > 0 ? 'red' : 'green'}>{deuda > 0 ? 'Deuda' : 'Al día'}</Badge>
              </div>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Órdenes</p>
              <p className="mt-1 text-lg font-semibold text-fore">{orders.length}</p>
            </div>
            <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Garantías activas</p>
              <p className="mt-1 text-lg font-semibold text-fore">{garantiasActivas}</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:bg-ink-700 hover:text-fore'}`}
              >
                {item.label}
                {tabCounts[item.key] !== undefined && ` (${tabCounts[item.key]})`}
              </button>
            ))}
          </div>

          {tab === 'compras' && (
            <>
              {!orders.length ? (
                <EmptyState compact icon="receipt" title="Sin compras registradas" description="Las órdenes de esta sucursal aparecerán acá." />
              ) : (
                <DataTable
                  columns={[
                    { key: 'createdAt', label: 'Fecha', render: (row) => <span className="text-mute">{fecha(row.createdAt)}</span> },
                    { key: 'orderNumber', label: 'N.º', render: (row) => <span className="font-medium">{codigoPedido(row.orderNumber) || '—'}</span> },
                    { key: 'status', label: 'Estado', render: (row) => <div className="flex flex-col gap-1">{STATUS_BADGE(ORDER_STATUS, row.status)}{FULFILLMENT_STATUS[row.fulfillmentStatus] && <span className="text-[11px] text-mute">{FULFILLMENT_STATUS[row.fulfillmentStatus].label}</span>}</div> },
                    { key: 'totalPyg', label: 'Total', align: 'right', render: (row) => formatGs(row.totalPyg) },
                    { key: 'paidPyg', label: 'Pagado', align: 'right', render: (row) => <span className="text-ok">{formatGs(row.paidPyg)}</span> },
                    { key: 'balancePyg', label: 'Saldo', align: 'right', render: (row) => <span className={Number(row.balancePyg) > 0 ? 'text-warn' : ''}>{formatGs(row.balancePyg)}</span> },
                  ]}
                  rows={orders}
                  mobileCard={(row) => (
                    <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <b>{codigoPedido(row.orderNumber) || '—'}</b>
                        {STATUS_BADGE(ORDER_STATUS, row.status)}
                      </div>
                      <p className="mt-1 text-xs text-mute">{fecha(row.createdAt)}{row.branchName ? ` · ${row.branchName}` : ''}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-mute">Total <b className="text-fore">{formatGs(row.totalPyg)}</b></span>
                        <span className="text-mute">Pagado <b className="text-ok">{formatGs(row.paidPyg)}</b></span>
                        <span className="text-mute">Saldo <b className={Number(row.balancePyg) > 0 ? 'text-warn' : 'text-fore'}>{formatGs(row.balancePyg)}</b></span>
                      </div>
                    </div>
                  )}
                />
              )}
            </>
          )}

          {tab === 'dispositivos' && (
            <>
              {!dispositivos.length ? (
                <EmptyState compact icon="phone" title="Sin dispositivos registrados" description="Los equipos con IMEI/serial comprados por este cliente aparecen acá." />
              ) : (
                <ul className="space-y-2">
                  {dispositivos.map((device) => {
                    const vence = device.warranty?.expiresAt ? new Date(device.warranty.expiresAt) : null
                    const dias = vence ? Math.max(0, Math.ceil((vence.getTime() - Date.now()) / 86400000)) : null
                    return (
                      <li key={`${device.serial}-${device.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{device.model || 'Equipo'}</p>
                          <p className="mt-0.5 font-mono text-xs text-mute">IMEI {device.serial}</p>
                          <p className="mt-0.5 text-xs text-mute">Comprado {fecha(device.date)}{device.orderNumber ? ` · ${codigoPedido(device.orderNumber)}` : ''}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {vence ? <Badge color={dias === 0 ? 'red' : dias <= 15 ? 'orange' : 'green'}>{dias === 0 ? 'Garantía vencida' : `${dias} días de garantía`}</Badge> : <Badge color="slate">Sin garantía cargada</Badge>}
                          {device.warranty?.publicToken && <a className="rounded-lg border border-fono/40 px-2.5 py-1.5 text-xs font-semibold text-fono-light" href={`${window.location.origin}/garantia/${device.warranty.publicToken}`} target="_blank" rel="noreferrer">Ver garantía</a>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {tab === 'garantias' && (
            <>
              {!warranties.length ? (
                <EmptyState compact icon="package" title="Sin garantías" description="No hay casos de garantía asociados a este cliente." />
              ) : (
                <ul className="space-y-2">
                  {warranties.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{item.description || 'Garantía'}</p>
                        <p className="mt-0.5 text-xs text-mute">Serial {item.serial || '—'} · {fecha(item.createdAt)}</p>
                      </div>
                      {STATUS_BADGE(WARRANTY_STATUS, item.status)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'notas' && (
            <div className="space-y-4">
              <form onSubmit={saveNote} className="space-y-3">
                <FormField label={editingNote ? 'Editar nota' : 'Nueva nota'} htmlFor="profile-note">
                  <Textarea id="profile-note" rows={3} maxLength={2000} placeholder="Nota interna del equipo sobre este cliente…" value={newNote} onChange={(event) => setNewNote(event.target.value)} />
                </FormField>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={noteBusy || !newNote.trim()}>{noteBusy ? 'Guardando…' : editingNote ? 'Guardar cambios' : 'Agregar nota'}</Button>
                  {editingNote && <Button type="button" variant="ghost" onClick={() => { setEditingNote(null); setNewNote('') }}>Cancelar</Button>}
                </div>
              </form>
              {!notes.length ? (
                <EmptyState compact icon="edit" title="Sin notas" description="Guardá observaciones internas sobre este cliente." />
              ) : (
                <ul className="space-y-2">
                  {notes.map((item) => (
                    <li key={item.id} className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                      <p className="whitespace-pre-wrap break-words">{item.content}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-mute">{item.user?.name || 'Equipo'} · {fechaHora(item.createdAt)}</p>
                        <div className="flex gap-2">
                          <button type="button" className="text-xs font-semibold text-fono-light" onClick={() => { setEditingNote(item); setNewNote(item.content) }}>Editar</button>
                          <button type="button" className="text-xs font-semibold text-bad" onClick={() => setPendingDelete({ type: 'note', id: item.id })}>Eliminar</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'seguimientos' && (
            <div className="space-y-4">
              <form onSubmit={saveFollowUp} className="grid gap-3 sm:grid-cols-[10rem_12rem_1fr]">
                <FormField label="Tipo" htmlFor="profile-follow-kind">
                  <Select id="profile-follow-kind" value={followForm.kind} onChange={(event) => setFollowForm({ ...followForm, kind: event.target.value })}>
                    {Object.entries(FOLLOW_UP_KINDS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Para cuándo (opcional)" htmlFor="profile-follow-due">
                  <Input id="profile-follow-due" type="datetime-local" value={followForm.dueAt} onChange={(event) => setFollowForm({ ...followForm, dueAt: event.target.value })} />
                </FormField>
                <FormField label="Detalle" htmlFor="profile-follow-note">
                  <Input id="profile-follow-note" maxLength={2000} placeholder="Motivo y qué acordaste…" value={followForm.note} onChange={(event) => setFollowForm({ ...followForm, note: event.target.value })} />
                </FormField>
                <div className="sm:col-span-3"><Button type="submit" disabled={followBusy || !followForm.note.trim()}>{followBusy ? 'Guardando…' : 'Agendar seguimiento'}</Button></div>
              </form>
              {!followUps.length ? (
                <EmptyState compact icon="calendar" title="Sin seguimientos" description="Agendá llamadas, WhatsApp o visitas para no perderle el rastro." />
              ) : (
                <ul className="space-y-2">
                  {followUps.map((item) => {
                    const kind = FOLLOW_UP_KINDS[item.kind] || FOLLOW_UP_KINDS.OTHER
                    return (
                      <li key={item.id} className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={kind.color}>{kind.label}</Badge>
                          {item.dueAt && !item.doneAt && <Badge color="orange">Para {fechaHora(item.dueAt)}</Badge>}
                          {item.doneAt && <Badge color="green">Hecho {fechaHora(item.doneAt)}</Badge>}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words">{item.note}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-mute">{item.user?.name || 'Equipo'} · {fechaHora(item.createdAt)}</p>
                          <div className="flex gap-2">
                            {!item.doneAt && <button type="button" disabled={followDoneId === item.id} className="text-xs font-semibold text-ok disabled:opacity-40" onClick={() => markDone(item)}>{followDoneId === item.id ? 'Guardando…' : 'Marcar hecho'}</button>}
                            <button type="button" className="text-xs font-semibold text-bad" onClick={() => setPendingDelete({ type: 'followUp', id: item.id })}>Eliminar</button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === 'cronologia' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-mute">Alta, pedidos, pagos confirmados, notas, seguimientos, garantías y auditoría.</p>
                <button type="button" disabled={timelineLoading} onClick={() => setTimelineRevision((value) => value + 1)} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-40">Actualizar</button>
              </div>
              {timelineLoading && (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              )}
              {!timelineLoading && timelineError && (
                <EmptyState
                  compact
                  icon="alert"
                  title="No se pudo cargar la cronología"
                  description={timelineError}
                  action={<Button onClick={() => setTimelineRevision((value) => value + 1)}>Reintentar</Button>}
                />
              )}
              {!timelineLoading && !timelineError && !timeline.length && (
                <EmptyState compact icon="clock" title="Sin actividad" description="Los movimientos de este cliente aparecerán acá." />
              )}
              {!timelineLoading && !timelineError && timeline.length > 0 && (
                <ol className="space-y-2">
                  {timeline.map((event) => {
                    const estilo = EVENTOS[event.type] || { icon: 'clock', tono: 'bg-ink-700 text-mute' }
                    return (
                      <li key={event.id} className="flex gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${estilo.tono}`}>
                          <Icon name={estilo.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-semibold">{event.action}</p>
                            <p className="text-[11px] text-mute">{fechaHora(event.createdAt)}</p>
                          </div>
                          {event.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-mute">{conCodigos(event.detail)}</p>}
                          <p className="mt-1 text-[11px] text-mute">{event.user?.name || 'Sistema'}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete?.type === 'note'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeNote}
        title="Eliminar nota"
        description="Esta nota se eliminará de forma permanente. No se puede deshacer."
        confirmLabel="Eliminar nota"
        variant="danger"
        busy={deleteBusy}
      />
      <ConfirmDialog
        open={pendingDelete?.type === 'followUp'}
        onCancel={() => setPendingDelete(null)}
        onConfirm={removeFollowUp}
        title="Eliminar seguimiento"
        description="Este seguimiento se eliminará de forma permanente. No se puede deshacer."
        confirmLabel="Eliminar seguimiento"
        variant="danger"
        busy={deleteBusy}
      />
    </Modal>
  )
}
