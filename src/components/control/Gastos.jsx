import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { listGastos, addGasto } from '@/lib/storage'
import { fechaClave, gs } from '@/utils/calculos'
import { parseGsInput } from '@/utils/moneda'
import { Card, Button, Input, Label, Select, Badge, EmptyState, MoneyInput, Modal } from '@/components/ui'
import CurrencySelect from '@/components/shared/CurrencySelect'
import { cn } from '@/lib/utils'
import AttachmentInput from '@/components/shared/AttachmentInput'
import AttachmentList from '@/components/shared/AttachmentList'
import Cronologia from '@/components/shared/Cronologia'

const EMPTY = () => ({ originalAmount: '', description: '', date: fechaClave(), currency: 'PYG', exchangeRatePyg: '1', accountId: '', kind: 'EXPENSE', counterparty: '', reference: '', dueAt: '' })
const KINDS = { EXPENSE: 'Gasto', CHEQUE: 'Cheque emitido/cobrado', SUPPLIER_ADVANCE: 'Adelanto a proveedor', TRANSFER: 'Transferencia', OWNER_WITHDRAWAL: 'Retiro del dueño', ADJUSTMENT: 'Ajuste' }
// Un cheque se cobra; un gasto solo queda registrado.
const estadoDe = (row) => {
  if (row.status === 'VOID') return ['Anulado', 'slate']
  if (row.status === 'PENDING') return ['Pendiente', 'yellow']
  return row.kind === 'CHEQUE' ? ['Cobrado', 'green'] : ['Registrado', 'green']
}

// Tabla compacta del libro financiero: una fila por movimiento y las acciones
// del cheque en la misma línea. La fecha prevista de cobro (dueAt) se cargaba
// y no se veía: ahora tiene su columna.
const GRID_GASTOS = 'grid min-w-[53rem] grid-cols-[minmax(9rem,1.5fr)_6.5rem_minmax(6rem,1fr)_5.5rem_6rem_7rem_8rem] items-center gap-x-2'
const CELDA_GASTOS = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fechaGasto = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

export default function Gastos() {
  const { esDemo, sucursal } = useSesion()
  const [form, setForm] = useState(EMPTY)
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [comprobante, setComprobante] = useState(null)
  const [adjuntosDe, setAdjuntosDe] = useState(null)
  const [historialDe, setHistorialDe] = useState(null)
  const [loading, setLoading] = useState(!esDemo)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''

  const load = useCallback(async () => {
    if (isDemoRuntime) { setRows(listGastos()); setLoading(false); return }
    setLoading(true)
    try {
      const [finance, paymentAccounts] = await Promise.all([api.get(`/api/finance${branch}`), getPaymentAccounts()])
      setRows(finance.movements || []); setAccounts(paymentAccounts || [])
    } catch (error) { setMessage(error.message || 'No se pudieron cargar los movimientos.') } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [esDemo, load])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const activeAccounts = accounts.filter(account => account.isActive && account.currency === form.currency)

  async function save(event) {
    event.preventDefault(); setMessage('')
    const originalAmount = form.currency === 'PYG' ? parseGsInput(form.originalAmount) : form.originalAmount
    if (!Number(originalAmount) || !form.description.trim()) { setMessage('Completá monto y descripción.'); return }
    setBusy(true)
    try {
      if (isDemoRuntime) {
        addGasto({ monto: Number(originalAmount), motivo: form.description, fecha: form.date, categoria: 'Otros' })
        setRows(listGastos()); setForm(EMPTY()); return
      }
      const created = await api.post(`/api/finance${branch}`, { action: 'movement', kind: form.kind, direction: 'OUT', currency: form.currency, originalAmount, exchangeRatePyg: form.currency === 'PYG' ? 1 : form.exchangeRatePyg, accountId: form.accountId || null, description: form.description, counterparty: form.counterparty || null, reference: form.reference || null, dueAt: form.kind === 'CHEQUE' && form.dueAt ? form.dueAt : null })
      let aviso = ''
      if (comprobante && created?.id) {
        try {
          const body = new FormData()
          body.append('entity', 'EXPENSE'); body.append('entityId', created.id); body.append('file', comprobante)
          await api.post('/api/attachments', body)
        } catch { aviso = 'El movimiento se guardó, pero no se pudo subir el comprobante.' }
      }
      setForm(EMPTY()); setComprobante(null); await load(); setMessage(aviso)
    } catch (error) { setMessage(error.message || 'No se pudo guardar el movimiento.') } finally { setBusy(false) }
  }
  async function updateStatus(id, action) {
    setBusy(true); setMessage('')
    try { await api.post(`/api/finance${branch}`, { action, id }); await load() } catch (error) { setMessage(error.message || 'No se pudo actualizar el movimiento.') } finally { setBusy(false) }
  }
  const total = rows.filter(row => row.kind === 'EXPENSE' && row.status !== 'VOID').reduce((sum, row) => sum + Number(row.amountPyg || row.monto || 0), 0)

  return <div className="space-y-4">
    <Card>
      <h2 className="font-bold">Registrar salida, cheque o adelanto</h2>
      <p className="mt-1 text-sm text-mute">La cotización queda congelada al guardar. Los cheques quedan pendientes hasta cobrarse o anularse.</p>
      {message && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{message}</p>}
      <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div><Label>Monto {form.currency === 'PYG' ? '(Gs)' : `(${form.currency})`}</Label><MoneyInput required currency={form.currency} value={form.originalAmount} onValueChange={value => set('originalAmount', value)} placeholder={form.currency === 'PYG' ? '250.000' : '0,00'} /></div>
        <div><Label>Moneda</Label><CurrencySelect value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value, accountId: '', originalAmount: '', exchangeRatePyg: event.target.value === 'PYG' ? '1' : current.exchangeRatePyg }))} /></div>
        {form.currency !== 'PYG' && <div><Label>Cotización congelada en Gs.</Label><MoneyInput required currency="USD" symbol="Gs." value={form.exchangeRatePyg} onValueChange={value => set('exchangeRatePyg', value)} placeholder="7.500" /></div>}
        <div><Label>Tipo</Label><Select value={form.kind} onChange={event => set('kind', event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div><Label>Cuenta (opcional)</Label><Select value={form.accountId} onChange={event => set('accountId', event.target.value)}><option value="">Sin cuenta asignada</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></div>
        {form.kind === 'CHEQUE' && <div><Label>Fecha prevista de cobro</Label><Input type="date" value={form.dueAt} onChange={event => set('dueAt', event.target.value)} /></div>}
        <div className="md:col-span-2"><Label>Descripción</Label><Input required value={form.description} onChange={event => set('description', event.target.value)} placeholder="Ej. Seguro de mercadería" /></div>
        <div><Label>Contraparte</Label><Input value={form.counterparty} onChange={event => set('counterparty', event.target.value)} placeholder="Proveedor o beneficiario" /></div>
        <div><Label>Referencia</Label><Input value={form.reference} onChange={event => set('reference', event.target.value)} placeholder="N.º transferencia o cheque" /></div>
        <div><Label>Comprobante (opcional)</Label><AttachmentInput className="block w-full text-xs text-mute" disabled={busy} onSelect={setComprobante} onError={setMessage} />{comprobante && <p className="mt-1 truncate text-xs text-mute">{comprobante.name}</p>}</div>
        <div className="flex items-end"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar movimiento'}</Button></div>
      </form>
    </Card>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-ink-600 p-4"><h3 className="font-bold">Libro financiero</h3><Badge color="red">Gastos: {gs(total)}</Badge></div>
{loading ? <p className="p-8 text-center text-sm text-mute">Cargando movimientos…</p> : rows.length === 0 ? <EmptyState compact icon="box" title="Sin movimientos registrados." /> : <div className="overflow-x-auto p-4" data-testid="gastos-tabla">
      <div className={cn(GRID_GASTOS, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_GASTOS}>Descripción</span>
        <span className={CELDA_GASTOS}>Tipo</span>
        <span className={CELDA_GASTOS}>Contraparte</span>
        <span className={CELDA_GASTOS}>Vence</span>
        <span className={CELDA_GASTOS}>Estado</span>
        <span className={cn(CELDA_GASTOS, 'text-right')}>Monto</span>
        <span className={cn(CELDA_GASTOS, 'text-right')}>Acciones</span>
      </div>
      <div className="space-y-1">{rows.map(row => {
        const [estadoLabel, estadoTone] = estadoDe(row)
        const monto = row.currency === 'PYG' ? gs(row.originalAmount || row.monto) : `${row.currency} ${row.originalAmount}`
        const detalle = [row.currency || 'PYG', row.counterparty || 'Sin contraparte', row.currency && row.currency !== 'PYG' ? `cotización ${row.exchangeRatePyg} = ${gs(row.amountPyg)}` : ''].filter(Boolean).join(' · ')
        return <div key={row.id} data-testid="gasto-fila" className={cn(GRID_GASTOS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-bad/40')}>
          <span className="truncate text-[13px] font-semibold" title={detalle}>{row.description || row.motivo || 'Movimiento'}</span>
          <span className="truncate text-[11px] text-mute" title={KINDS[row.kind] || row.category || undefined}>{KINDS[row.kind] || row.category || 'Gasto'}</span>
          <span className="truncate text-[11px] text-mute" title={row.counterparty || undefined}>{row.counterparty || '—'}</span>
          <span className={cn('truncate text-[11px]', row.kind === 'CHEQUE' && row.status === 'PENDING' && row.dueAt ? 'text-warn' : 'text-mute')} title={row.dueAt ? `Cobro previsto el ${new Date(row.dueAt).toLocaleDateString('es-PY')}` : undefined}>{row.dueAt ? fechaGasto(row.dueAt) : '—'}</span>
          <Badge color={estadoTone} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{estadoLabel}</Badge>
          <span className="truncate text-right text-sm font-bold tabular-nums text-bad">{monto}</span>
          <span className="flex flex-wrap items-center justify-end gap-1">{!isDemoRuntime && row.id && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => setAdjuntosDe(row)}>Adjuntos</Button><Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => setHistorialDe(row)}>Historial</Button>}{row.kind === 'CHEQUE' && row.status === 'PENDING' && !isDemoRuntime && <><Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => updateStatus(row.id, 'clear')}>Cobrado</Button><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => updateStatus(row.id, 'void')}>Anular</Button></>}</span>
        </div>
      })}</div>
    </div>}    </Card>    <Modal open={adjuntosDe !== null} onClose={() => setAdjuntosDe(null)} title="Comprobante del gasto">
      {adjuntosDe && <AttachmentList entity="EXPENSE" entityId={adjuntosDe.id} puedeSubir titulo="Comprobantes del gasto" />}
    </Modal>
    <Modal open={historialDe !== null} onClose={() => setHistorialDe(null)} title="Historial del gasto">
      {historialDe && <Cronologia endpoint={`/api/expenses/${historialDe.id}/history`} active={historialDe !== null} vacio="Sin actividad" descripcionVacio="El alta, los cambios de estado y los comprobantes de este gasto aparecerán acá." />}
    </Modal>
  </div>
}
