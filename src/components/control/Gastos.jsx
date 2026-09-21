import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { listGastos, addGasto } from '@/lib/storage'
import { fechaClave, gs } from '@/utils/calculos'
import { parseGsInput } from '@/utils/moneda'
import { Card, Button, Input, Label, Select, Badge, EmptyState, MoneyInput, IconAction } from '@/components/ui'
import CurrencySelect from '@/components/shared/CurrencySelect'
import ComboBuscador from '@/components/shared/ComboBuscador'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import { KIND_LABELS } from '@/lib/paymentAccounts'

const EMPTY = () => ({ originalAmount: '', description: '', date: fechaClave(), currency: 'PYG', exchangeRatePyg: '1', accountId: '', kind: 'EXPENSE', counterparty: '', reference: '', dueAt: '' })
const KINDS = { EXPENSE: 'Gasto', CHEQUE: 'Cheque emitido/cobrado', SUPPLIER_ADVANCE: 'Adelanto a proveedor', TRANSFER: 'Transferencia', OWNER_WITHDRAWAL: 'Retiro del dueño', ADJUSTMENT: 'Ajuste' }
const DEFAULT_EXPENSE_LIMIT_PYG = 1000000

export default function Gastos() {
  const { esDemo, sucursal, empresa, sesion } = useSesion()
  const [form, setForm] = useState(EMPTY)
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(!esDemo)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [authGasto, setAuthGasto] = useState(null)
  const branch = sucursal?.id ? `?branchId=${encodeURIComponent(sucursal.id)}` : ''
  const puedeSinAutorizacion = sesion?.rol === 'dueno' || sesion?.rol === 'GERENTE'
  const limiteGastos = Number(empresa?.expenseLimitPyg ?? DEFAULT_EXPENSE_LIMIT_PYG)
  // El límite se compara en guaraníes: en otra moneda se congela la cotización.
  const montoPyg = form.currency === 'PYG'
    ? Number(parseGsInput(form.originalAmount)) || 0
    : Math.round((Number(form.originalAmount) || 0) * (Number(form.exchangeRatePyg) || 0))
  const requiereAutorizacion = form.kind === 'EXPENSE' && !puedeSinAutorizacion && montoPyg > limiteGastos
  useEffect(() => { if (!requiereAutorizacion) setAuthGasto(null) }, [requiereAutorizacion])

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
  // Buscador de cuentas (#141): por nombre, banco, procesadora, titular,
  // empresa o número; el detalle muestra con qué se identifica cada una.
  const opcionesCuentas = activeAccounts.map(account => ({
    value: account.id,
    label: account.name,
    detail: [account.bank || account.processor, account.holder, account.accountNumber].filter(Boolean).join(' · '),
    badge: KIND_LABELS[account.kind] || account.kind,
  }))

  async function save(event) {
    event.preventDefault(); setMessage('')
    const originalAmount = form.currency === 'PYG' ? parseGsInput(form.originalAmount) : form.originalAmount
    if (!Number(originalAmount) || !form.description.trim()) { setMessage('Completá monto y descripción.'); return }
    if (requiereAutorizacion && !authGasto) { setMessage('El gasto supera el límite sin autorización. Solicitá autorización a gerencia y esperá la aprobación.'); return }
    setBusy(true)
    try {
      if (isDemoRuntime) {
        addGasto({ monto: Number(originalAmount), motivo: form.description, fecha: form.date, categoria: 'Otros' })
        setRows(listGastos()); setForm(EMPTY()); return
      }
      await api.post(`/api/finance${branch}`, { action: 'movement', kind: form.kind, direction: 'OUT', currency: form.currency, originalAmount, exchangeRatePyg: form.currency === 'PYG' ? 1 : form.exchangeRatePyg, accountId: form.accountId || null, description: form.description, counterparty: form.counterparty || null, reference: form.reference || null, dueAt: form.kind === 'CHEQUE' && form.dueAt ? form.dueAt : null, ...(requiereAutorizacion && authGasto ? { expenseAuthorizationId: authGasto.id } : {}) })
      setForm(EMPTY()); setAuthGasto(null); await load()
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
      <form onSubmit={save} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <div><Label htmlFor="monto-gasto">Monto {form.currency === 'PYG' ? '(Gs)' : `(${form.currency})`}</Label><MoneyInput id="monto-gasto" required currency={form.currency} value={form.originalAmount} onValueChange={value => set('originalAmount', value)} placeholder={form.currency === 'PYG' ? '250.000' : '0,00'} /></div>
        <div><Label htmlFor="moneda-gasto">Moneda</Label><CurrencySelect id="moneda-gasto" value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value, accountId: '', originalAmount: '', exchangeRatePyg: event.target.value === 'PYG' ? '1' : current.exchangeRatePyg }))} /></div>
        {form.currency !== 'PYG' && <div><Label htmlFor="cotizacion-congelada-en-gs">Cotización en Gs.</Label><MoneyInput id="cotizacion-congelada-en-gs" required currency="USD" symbol="Gs." value={form.exchangeRatePyg} onValueChange={value => set('exchangeRatePyg', value)} placeholder="7.500" /></div>}
        <div><Label htmlFor="tipo">Tipo</Label><Select id="tipo" value={form.kind} onChange={event => set('kind', event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div className="col-span-2"><Label htmlFor="cuenta-opcional">Cuenta (opcional)</Label><ComboBuscador id="cuenta-opcional" value={activeAccounts.find(account => account.id === form.accountId)?.name || ''} options={opcionesCuentas} onChange={() => set('accountId', '')} onSelect={opcion => set('accountId', opcion.value)} placeholder="Buscá por nombre, banco, titular o empresa" emptyLabel="Sin cuentas para esta moneda." /></div>
        {form.kind === 'CHEQUE' && <div><Label htmlFor="fecha-prevista-de-cobro">Fecha de cobro</Label><Input id="fecha-prevista-de-cobro" type="date" value={form.dueAt} onChange={event => set('dueAt', event.target.value)} /></div>}
        <div className="col-span-2"><Label htmlFor="descripcion">Descripción</Label><Input id="descripcion" required value={form.description} onChange={event => set('description', event.target.value)} placeholder="Ej. Seguro de mercadería" /></div>
        <div><Label htmlFor="contraparte">Contraparte</Label><Input id="contraparte" value={form.counterparty} onChange={event => set('counterparty', event.target.value)} placeholder="Proveedor o beneficiario" /></div>
        <div><Label htmlFor="referencia">Referencia</Label><Input id="referencia" value={form.reference} onChange={event => set('reference', event.target.value)} placeholder="N.º transferencia o cheque" /></div>
        {requiereAutorizacion && !esDemo && (
          <AutorizacionBloque
            kind="EXPENSE_OVER_LIMIT"
            entity="EXPENSE"
            entityId={null}
            titulo="Gasto por encima del límite"
            descripcion={`El monto supera el límite sin autorización (${gs(limiteGastos)}). Pedí autorización a gerencia y ejecutá el gasto con la aprobación.`}
            requestedValue={{ amountPyg: montoPyg, description: form.description.trim() }}
            monto={montoPyg}
            campoMax="maxAmountPyg"
            onSelect={setAuthGasto}
            bloqueado={busy}
          />
        )}
        <div className="flex items-end"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar movimiento'}</Button></div>
      </form>
    </Card>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-ink-600 p-4"><h3 className="font-bold">Libro financiero</h3><Badge color="red">Gastos: {gs(total)}</Badge></div>
      {loading ? <p className="p-8 text-center text-sm text-mute">Cargando movimientos…</p> : rows.length === 0 ? <EmptyState compact icon="box" title="Sin movimientos registrados." /> : <div className="space-y-1.5 p-4">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-2.5 py-1.5 transition hover:border-bad/40"><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{row.description || row.motivo}</b><span className="mt-0.5 block truncate text-[11px] text-mute">{KINDS[row.kind] || row.category || 'Gasto'} · {row.currency || 'PYG'} · {row.counterparty || 'Sin contraparte'}{row.currency && row.currency !== 'PYG' ? ` · cotización ${row.exchangeRatePyg} = ${gs(row.amountPyg)}` : ''}</span></span><span className="flex shrink-0 items-center gap-2"><Badge color={row.status === 'CLEARED' ? 'green' : row.status === 'VOID' ? 'slate' : 'yellow'}>{row.status || 'REGISTRADO'}</Badge><b className="text-[13px] font-bold tabular-nums text-bad">{row.currency === 'PYG' ? gs(row.originalAmount || row.monto) : `${row.currency} ${row.originalAmount}`}</b>{row.kind === 'CHEQUE' && row.status === 'PENDING' && !isDemoRuntime && <><IconAction icon="check" tone="ok" label="Marcar cobrado" disabled={busy} onClick={() => updateStatus(row.id, 'clear')} /><IconAction icon="trash" tone="bad" label="Anular" disabled={busy} onClick={() => updateStatus(row.id, 'void')} /></>}</span></div>)}</div>}
    </Card>
  </div>
}
