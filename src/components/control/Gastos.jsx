import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { listGastos, addGasto } from '@/lib/storage'
import { fechaClave, gs } from '@/utils/calculos'
import { parseGsInput } from '@/utils/moneda'
import { Card, Button, Input, Label, Select, Badge, EmptyState, MoneyInput } from '@/components/ui'

const EMPTY = () => ({ originalAmount: '', description: '', date: fechaClave(), currency: 'PYG', exchangeRatePyg: '1', accountId: '', kind: 'EXPENSE', counterparty: '', reference: '', dueAt: '' })
const CURRENCIES = ['PYG', 'USD', 'BRL', 'EUR', 'USDT']
const KINDS = { EXPENSE: 'Gasto', CHEQUE: 'Cheque emitido/cobrado', SUPPLIER_ADVANCE: 'Adelanto a proveedor', TRANSFER: 'Transferencia', OWNER_WITHDRAWAL: 'Retiro del dueño', ADJUSTMENT: 'Ajuste' }

export default function Gastos() {
  const { esDemo, sucursal } = useSesion()
  const [form, setForm] = useState(EMPTY)
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
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
      await api.post(`/api/finance${branch}`, { action: 'movement', kind: form.kind, direction: 'OUT', currency: form.currency, originalAmount, exchangeRatePyg: form.currency === 'PYG' ? 1 : form.exchangeRatePyg, accountId: form.accountId || null, description: form.description, counterparty: form.counterparty || null, reference: form.reference || null, dueAt: form.kind === 'CHEQUE' && form.dueAt ? form.dueAt : null })
      setForm(EMPTY()); await load()
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
        <div><Label>Moneda</Label><Select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value, accountId: '', originalAmount: '', exchangeRatePyg: event.target.value === 'PYG' ? '1' : current.exchangeRatePyg }))}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</Select></div>
        {form.currency !== 'PYG' && <div><Label>Cotización congelada en Gs.</Label><MoneyInput required currency="USD" symbol="Gs." value={form.exchangeRatePyg} onValueChange={value => set('exchangeRatePyg', value)} placeholder="7.500" /></div>}
        <div><Label>Tipo</Label><Select value={form.kind} onChange={event => set('kind', event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div><Label>Cuenta (opcional)</Label><Select value={form.accountId} onChange={event => set('accountId', event.target.value)}><option value="">Sin cuenta asignada</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></div>
        {form.kind === 'CHEQUE' && <div><Label>Fecha prevista de cobro</Label><Input type="date" value={form.dueAt} onChange={event => set('dueAt', event.target.value)} /></div>}
        <div className="md:col-span-2"><Label>Descripción</Label><Input required value={form.description} onChange={event => set('description', event.target.value)} placeholder="Ej. Seguro de mercadería" /></div>
        <div><Label>Contraparte</Label><Input value={form.counterparty} onChange={event => set('counterparty', event.target.value)} placeholder="Proveedor o beneficiario" /></div>
        <div><Label>Referencia</Label><Input value={form.reference} onChange={event => set('reference', event.target.value)} placeholder="N.º transferencia o cheque" /></div>
        <div className="flex items-end"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar movimiento'}</Button></div>
      </form>
    </Card>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-ink-600 p-4"><h3 className="font-bold">Libro financiero</h3><Badge color="red">Gastos: {gs(total)}</Badge></div>
      {loading ? <p className="p-8 text-center text-sm text-mute">Cargando movimientos…</p> : rows.length === 0 ? <EmptyState compact icon="box" title="Sin movimientos registrados." /> : <div className="space-y-1.5 p-4">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-2 transition hover:border-bad/40"><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{row.description || row.motivo}</b><span className="mt-0.5 block truncate text-[11px] text-mute">{KINDS[row.kind] || row.category || 'Gasto'} · {row.currency || 'PYG'} · {row.counterparty || 'Sin contraparte'}{row.currency && row.currency !== 'PYG' ? ` · cotización ${row.exchangeRatePyg} = ${gs(row.amountPyg)}` : ''}</span></span><span className="flex shrink-0 items-center gap-2"><Badge color={row.status === 'CLEARED' ? 'green' : row.status === 'VOID' ? 'slate' : 'yellow'}>{row.status || 'REGISTRADO'}</Badge><b className="text-sm font-bold tabular-nums text-bad">{row.currency === 'PYG' ? gs(row.originalAmount || row.monto) : `${row.currency} ${row.originalAmount}`}</b>{row.kind === 'CHEQUE' && row.status === 'PENDING' && !isDemoRuntime && <><Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => updateStatus(row.id, 'clear')}>Cobrado</Button><Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => updateStatus(row.id, 'void')}>Anular</Button></>}</span></div>)}</div>}
    </Card>
  </div>
}
