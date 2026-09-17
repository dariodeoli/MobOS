import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGs } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'
import { Badge, Button, Card, EmptyState, Eyebrow, FormField, Input, MoneyInput, Skeleton, Textarea, Modal, useToast } from '@/components/ui'

const KINDS = {
  WHOLESALE: 'Mayorista',
  CREDIT: 'Crédito',
  CREDIT_DAYS: 'Días de crédito',
}

const STATUS = {
  PENDING: { label: 'Pendiente', color: 'orange' },
  APPROVED: { label: 'Aprobada', color: 'green' },
  REJECTED: { label: 'Rechazada', color: 'red' },
}

const FILTERS = [
  ['', 'Todas'],
  ['PENDING', 'Pendientes'],
  ['APPROVED', 'Aprobadas'],
  ['REJECTED', 'Rechazadas'],
]

const RESOLVERS = ['ADMIN', 'GERENTE']
const fechaHora = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function resumenValor(kind, value) {
  const data = value && typeof value === 'object' ? value : {}
  if (kind === 'WHOLESALE') return 'Pasar a precio mayorista'
  const parts = []
  if (data.creditLimitPyg !== undefined && data.creditLimitPyg !== null) parts.push(`Límite ${formatGs(data.creditLimitPyg)}`)
  if (data.creditDays !== undefined && data.creditDays !== null) parts.push(`${data.creditDays} día${Number(data.creditDays) === 1 ? '' : 's'}`)
  return parts.join(' · ') || '—'
}

// Autorizaciones comerciales: el vendedor pide cambios de condición para un
// cliente y gerencia/dueño aprueba (ajustando lo autorizado) o rechaza con
// motivo. Todo queda auditado en la cronología del cliente.
export default function Autorizaciones() {
  const { usuario, esDemo } = useSesion()
  const toast = useToast()
  const [filtro, setFiltro] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [approveForm, setApproveForm] = useState({ creditLimitPyg: '', creditDays: '', resolvedNote: '' })
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [busy, setBusy] = useState(false)

  const puedeResolver = RESOLVERS.includes(usuario?.role)

  async function load() {
    if (esDemo) return
    setLoading(true)
    setError('')
    try {
      const query = filtro ? `?status=${filtro}` : ''
      setRows(await api.get(`/api/authorizations${query}`))
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las solicitudes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [esDemo, filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = useMemo(() => rows.filter(row => row.status === 'PENDING').length, [rows])

  function abrirAprobar(row) {
    const value = row.requestedValue && typeof row.requestedValue === 'object' ? row.requestedValue : {}
    setApproveForm({
      creditLimitPyg: value.creditLimitPyg ?? '',
      creditDays: value.creditDays ?? '',
      resolvedNote: '',
    })
    setApproveTarget(row)
  }

  async function confirmarAprobar() {
    if (!approveTarget || busy) return
    const kind = approveTarget.kind
    const resolvedValue = {}
    if (kind === 'CREDIT') {
      const limit = Number(approveForm.creditLimitPyg)
      if (!Number.isSafeInteger(limit) || limit < 0) {
        toast.error('Límite inválido', 'Ingresá un límite de crédito en guaraníes.')
        return
      }
      resolvedValue.creditLimitPyg = limit
    }
    if (kind === 'CREDIT' || kind === 'CREDIT_DAYS') {
      if (approveForm.creditDays === '' && kind === 'CREDIT_DAYS') {
        toast.error('Días obligatorios', 'Ingresá los días de crédito autorizados.')
        return
      }
      if (approveForm.creditDays !== '') {
        const days = Number(approveForm.creditDays)
        if (!Number.isSafeInteger(days) || days < 0 || days > 365) {
          toast.error('Días inválidos', 'Los días de crédito deben estar entre 0 y 365.')
          return
        }
        resolvedValue.creditDays = days
      }
    }
    setBusy(true)
    try {
      await api.patch('/api/authorizations', {
        id: approveTarget.id,
        action: 'approve',
        ...(kind === 'WHOLESALE' ? {} : { resolvedValue }),
        ...(approveForm.resolvedNote.trim() ? { resolvedNote: approveForm.resolvedNote.trim() } : {}),
      })
      toast.success('Solicitud aprobada', 'La condición del cliente quedó actualizada.')
      setApproveTarget(null)
      load()
    } catch (cause) {
      toast.error('No se pudo aprobar', cause?.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmarRechazar() {
    if (!rejectTarget || busy) return
    if (!rejectNote.trim()) {
      toast.error('Motivo obligatorio', 'Contale al vendedor por qué se rechaza.')
      return
    }
    setBusy(true)
    try {
      await api.patch('/api/authorizations', { id: rejectTarget.id, action: 'reject', resolvedNote: rejectNote.trim() })
      toast.success('Solicitud rechazada')
      setRejectTarget(null)
      load()
    } catch (cause) {
      toast.error('No se pudo rechazar', cause?.message)
    } finally {
      setBusy(false)
    }
  }

  if (esDemo) {
    return (
      <Card>
        <h2 className="font-bold">Autorizaciones comerciales</h2>
        <p className="mt-2 text-sm text-mute">La demo no tiene solicitudes reales. Ingresá con una cuenta real para autorizar condiciones de clientes.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Control</Eyebrow>
            <h2 className="mt-1 font-bold">Autorizaciones comerciales</h2>
            <p className="mt-1 text-sm text-mute">
              Pedidos de mayorista, crédito y plazo. Aprobá ajustando lo autorizado o rechazá con un motivo; queda en la cronología del cliente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendientes > 0 && <Badge color="orange">{pendientes} pendiente{pendientes === 1 ? '' : 's'}</Badge>}
            <button type="button" className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light" onClick={load} disabled={loading}>
              {loading ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFiltro(value)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${filtro === value ? 'bg-fono/15 text-fono-light' : 'text-mute hover:bg-ink-700 hover:text-fore'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      </Card>

      <Card>
        {loading && !rows.length && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {!loading && !error && !rows.length && (
          <EmptyState compact icon="check" title="Sin solicitudes" description="Cuando un vendedor pida mayorista, crédito o plazo para un cliente, aparecerá acá." />
        )}
        <div className="space-y-2">
          {rows.map((row) => {
            const estado = STATUS[row.status] || { label: row.status, color: 'slate' }
            const propia = row.requestedById === usuario?.id
            return (
              <article key={row.id} className={`rounded-xl border p-3 ${row.status === 'PENDING' ? 'border-warn/30 bg-warn/5' : 'border-ink-600'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{row.customer?.name || 'Cliente'}</p>
                      <Badge color="blue">{KINDS[row.kind] || row.kind}</Badge>
                      <Badge color={estado.color}>{estado.label}</Badge>
                      {propia && row.status === 'PENDING' && <Badge color="slate">Tu solicitud</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-mute">
                      Pedido: {resumenValor(row.kind, row.requestedValue)}
                      {row.status !== 'PENDING' && <> · Autorizado: {row.status === 'APPROVED' ? resumenValor(row.kind, row.resolvedValue || row.requestedValue) : '— rechazado'}</>}
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      Pidió {row.requestedBy?.name || 'Sistema'} · {fechaHora(row.createdAt)}
                      {row.resolvedBy?.name ? ` · Resolvió ${row.resolvedBy.name} · ${fechaHora(row.resolvedAt)}` : ''}
                    </p>
                    {row.note && <p className="mt-1 text-xs text-mute">Nota del vendedor: {row.note}</p>}
                    {row.resolvedNote && <p className="mt-1 text-xs text-mute">Respuesta: {row.resolvedNote}</p>}
                  </div>
                  {puedeResolver && row.status === 'PENDING' && !propia && (
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" onClick={() => abrirAprobar(row)}>Aprobar</Button>
                      <Button type="button" variant="ghost" onClick={() => { setRejectNote(''); setRejectTarget(row) }}>Rechazar</Button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </Card>

      <Modal
        open={Boolean(approveTarget)}
        onClose={() => { if (!busy) setApproveTarget(null) }}
        title={`Aprobar ${KINDS[approveTarget?.kind] || 'solicitud'}`}
        className="max-w-lg"
      >
        {approveTarget && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {approveTarget.customer?.name || 'Cliente'} · pedido por {approveTarget.requestedBy?.name || 'Sistema'}: <b className="text-fore">{resumenValor(approveTarget.kind, approveTarget.requestedValue)}</b>
            </p>
            {approveTarget.kind === 'CREDIT' && (
              <FormField label="Límite de crédito autorizado (Gs.)" htmlFor="auth-limit">
                <MoneyInput id="auth-limit" value={approveForm.creditLimitPyg} onValueChange={(value) => setApproveForm((form) => ({ ...form, creditLimitPyg: value }))} placeholder="1.000.000" />
              </FormField>
            )}
            {(approveTarget.kind === 'CREDIT' || approveTarget.kind === 'CREDIT_DAYS') && (
              <FormField
                label={approveTarget.kind === 'CREDIT_DAYS' ? 'Días autorizados (máximo)' : 'Días de crédito'}
                hint={approveTarget.kind === 'CREDIT_DAYS' ? 'Podés autorizar menos días de los pedidos: es el máximo habilitado.' : undefined}
                htmlFor="auth-days"
              >
                <Input
                  id="auth-days"
                  type="number"
                  min={0}
                  max={365}
                  value={approveForm.creditDays}
                  onChange={(event) => setApproveForm((form) => ({ ...form, creditDays: event.target.value }))}
                  placeholder="30"
                />
              </FormField>
            )}
            <FormField label="Nota de la respuesta (opcional)" htmlFor="auth-note">
              <Textarea id="auth-note" rows={2} maxLength={500} value={approveForm.resolvedNote} onChange={(event) => setApproveForm((form) => ({ ...form, resolvedNote: event.target.value }))} placeholder="Condición acordada…" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setApproveTarget(null)} disabled={busy}>Cancelar</Button>
              <Button type="button" onClick={confirmarAprobar} disabled={busy}>
                <Icon name="check" className="h-4 w-4" />
                {busy ? 'Guardando…' : 'Aprobar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => { if (!busy) setRejectTarget(null) }}
        title={`Rechazar ${KINDS[rejectTarget?.kind] || 'solicitud'}`}
        className="max-w-lg"
      >
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-mute">
              {rejectTarget.customer?.name || 'Cliente'} · pedido por {rejectTarget.requestedBy?.name || 'Sistema'}: <b className="text-fore">{resumenValor(rejectTarget.kind, rejectTarget.requestedValue)}</b>
            </p>
            <FormField label="Motivo del rechazo" htmlFor="auth-reject-note">
              <Textarea id="auth-reject-note" rows={3} maxLength={500} value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Explicá al vendedor por qué no se autoriza…" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRejectTarget(null)} disabled={busy}>Cancelar</Button>
              <Button type="button" variant="danger" onClick={confirmarRechazar} disabled={busy || !rejectNote.trim()}>{busy ? 'Guardando…' : 'Rechazar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
