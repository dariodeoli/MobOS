import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts, createPaymentAccount, updatePaymentAccount } from '@/lib/paymentAccounts'
import { BANCOS_PARAGUAY } from '@/lib/bancos-paraguay'
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui'
import CurrencySelect from '@/components/shared/CurrencySelect'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { cn } from '@/lib/utils'

// Tabla compacta: una fila por cuenta, con comisión, acreditación y descuento.
const GRID_CUENTAS = 'grid min-w-[54rem] grid-cols-[minmax(9rem,1.3fr)_7rem_5rem_6.5rem_6.5rem_6.5rem_minmax(8rem,1fr)_9rem] items-center gap-x-2'
const CELDA_CUENTAS = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

const KINDS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', TRADE_IN: 'Canje', PIX: 'Pix' }
const EMPTY = { name: '', bank: '', holder: '', accountNumber: '', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0, settlementDays: 0, discountPct: 0 }
const TEMPLATES = [
  { name: 'Caja Gs', kind: 'CASH', currency: 'PYG' },
  { name: 'Caja USD', kind: 'CASH', currency: 'USD' },
  { name: 'Transferencia Gs', kind: 'TRANSFER', currency: 'PYG' },
  { name: 'Transferencia USD', kind: 'TRANSFER', currency: 'USD' },
  { name: 'Tarjeta', kind: 'CARD', currency: 'PYG' },
  { name: 'Canje', kind: 'TRADE_IN', currency: 'PYG' },
]

export default function PaymentAccounts() {
  const { sesion, empresa } = useSesion()
  // Remount al cambiar de empresa para no mostrar cuentas del contexto anterior.
  if (!sesion?.esPropietario) return null
  return <AccountManager key={empresa?.id || 'default'} />
}

function AccountManager() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getPaymentAccounts().then(items => {
      if (!cancelled) setAccounts(items)
    }).catch(error => {
      if (!cancelled) setLoadError(error.message || 'No se pudieron cargar las cuentas.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  function openForm(account = null) {
    setEditingId(account?.id ?? null)
    setForm({ ...EMPTY, ...account })
    setMessage(null)
  }

  function change(key, value) { setForm(current => ({ ...current, [key]: value })) }

  async function mutate(action, success) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage(null)
    try {
      const account = await action()
      setAccounts(current => current.some(item => item.id === account.id)
        ? current.map(item => item.id === account.id ? account : item)
        : [...current, account])
      setForm(null)
      setEditingId(null)
      setMessage({ ok: true, text: success })
    } catch (error) {
      setMessage({ ok: false, text: error.message || 'No se pudo guardar la cuenta.' })
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function save(event) {
    event.preventDefault()
    const values = { ...form, feePercent: parsePercent(form.feePercent) ?? 0, discountPct: parsePercent(form.discountPct) ?? 0 }
    mutate(() => editingId ? updatePaymentAccount(editingId, values) : createPaymentAccount(values), 'Cuenta guardada.')
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bancos y cuentas de cobro</h2>
          <p className="mt-1 text-sm text-mute">Configurá los medios de pago. Desactivar conserva la cuenta y su historial.</p>
        </div>
        <Button type="button" disabled={busy || loading || !!loadError || !!form} onClick={() => openForm()}>Añadir cuenta</Button>
      </div>
      {isDemoRuntime && <p className="text-sm text-mute">Demo: cuentas ficticias guardadas en este navegador. No ingreses datos bancarios reales.</p>}
      {loading && <p role="status" className="text-sm text-mute">Cargando cuentas…</p>}
      {loadError && <div role="alert" className="space-y-2 text-sm text-bad"><p>{loadError}</p><Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Reintentar</Button></div>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg border px-3 py-2 text-sm ${message.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad'}`}>{message.text}</p>}
      {!loading && !loadError && accounts.length === 0 && <p className="text-sm text-mute">Todavía no hay cuentas. Añadí una o elegí una plantilla.</p>}
      {!loading && !loadError && !form && <div className="flex flex-wrap gap-2" aria-label="Plantillas rápidas">
        {TEMPLATES.map(template => <Button key={template.name} type="button" variant="outline" disabled={busy} onClick={() => openForm(template)}>+ {template.name}</Button>)}
      </div>}
      {form && <form onSubmit={save} className="space-y-4 rounded-lg border border-ink-600 p-4">
        <h3 className="text-sm font-semibold">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="pa-name">Nombre</Label><Input id="pa-name" autoFocus required maxLength={200} value={form.name} onChange={event => change('name', event.target.value)} placeholder="Ej. Caja principal" /></div>
          <div><Label htmlFor="pa-kind">Medio de pago</Label><Select id="pa-kind" value={form.kind} onChange={event => change('kind', event.target.value)}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
          <div><Label htmlFor="pa-currency">Moneda</Label><CurrencySelect id="pa-currency" value={form.currency} onChange={event => change('currency', event.target.value)} /></div>
          <div><Label htmlFor="pa-bank">Banco {form.kind !== 'TRANSFER' && '(opcional)'}</Label><Input id="pa-bank" list="pa-bank-options" required={form.kind === 'TRANSFER'} maxLength={200} value={form.bank} onChange={event => change('bank', event.target.value)} placeholder="Buscá entre los bancos de Paraguay o escribí otro" /><datalist id="pa-bank-options">{BANCOS_PARAGUAY.map(bank => <option key={bank} value={bank} />)}</datalist></div>
          <div><Label htmlFor="pa-holder">Titular {form.kind !== 'TRANSFER' && '(opcional)'}</Label><Input id="pa-holder" required={form.kind === 'TRANSFER'} maxLength={200} value={form.holder} onChange={event => change('holder', event.target.value)} /></div>
          <div><Label htmlFor="pa-number">Número de cuenta {form.kind !== 'TRANSFER' && '(opcional)'}</Label><Input id="pa-number" type="text" required={form.kind === 'TRANSFER'} maxLength={200} value={form.accountNumber} onChange={event => change('accountNumber', event.target.value)} /></div>
          <div><Label htmlFor="pa-fee">Comisión (%)</Label><PercentField id="pa-fee" required value={form.feePercent} onChange={value => change('feePercent', value)} /></div>
          <div><Label htmlFor="pa-discount">Descuento por este medio (%)</Label><PercentField id="pa-discount" required value={form.discountPct} onChange={value => change('discountPct', value)} /><p className="mt-1 text-[11px] text-mute">Sugerido al cobrar con este medio (ej. efectivo 5%).</p></div>
          <div><Label htmlFor="pa-settlement">Días en acreditarse</Label><Input id="pa-settlement" inputMode="numeric" maxLength={2} required value={form.settlementDays} onChange={event => change('settlementDays', event.target.value.replace(/\D/g, ''))} /><p className="mt-1 text-[11px] text-mute">Tarjeta suele tardar 1-3 días hábiles; efectivo 0.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => change('isActive', event.target.checked)} />Cuenta activa</label>
        </fieldset>
        <p className="text-xs text-mute">La plantilla solo completa el formulario; guardá para crear la cuenta.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuenta'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setForm(null); setMessage(null) }}>Cancelar</Button></div>
      </form>}
      {!loading && !loadError && <div className="overflow-x-auto" data-testid="cuentas-tabla">
        <div className={cn(GRID_CUENTAS, 'px-3.5 pb-2 pt-1')}>
          <span className={CELDA_CUENTAS}>Cuenta</span>
          <span className={CELDA_CUENTAS}>Tipo</span>
          <span className={CELDA_CUENTAS}>Moneda</span>
          <span className={CELDA_CUENTAS}>Comisión</span>
          <span className={CELDA_CUENTAS}>Acredita</span>
          <span className={CELDA_CUENTAS}>Descuento</span>
          <span className={CELDA_CUENTAS}>Datos</span>
          <span className={cn(CELDA_CUENTAS, 'text-right')}>Acciones</span>
        </div>
        <div className="space-y-1">
        {accounts.map(account => {
          const datos = [account.bank, account.holder, account.accountNumber].filter(Boolean).join(' · ')
          return <div key={account.id} data-testid="cuenta-fila" className={cn(GRID_CUENTAS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
            <span className="min-w-0"><b className="block truncate text-[13px] font-semibold" title={account.name}>{account.name}</b><Badge color={account.isActive ? 'green' : 'slate'} className="mt-0.5 w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">{account.isActive ? 'Activa' : 'Inactiva'}</Badge></span>
            <span className="truncate text-xs text-mute">{KINDS[account.kind] || account.kind}</span>
            <span className="truncate text-xs text-mute">{account.currency === 'PYG' ? 'Gs' : account.currency}</span>
            <span className="truncate text-xs tabular-nums text-mute">{formatPercent(account.feePercent ?? 0)}%</span>
            <span className="truncate text-xs text-mute">{account.settlementDays > 0 ? `${account.settlementDays} día${account.settlementDays === 1 ? '' : 's'}` : 'Inmediata'}</span>
            <span className="truncate text-xs tabular-nums text-mute">{Number(account.discountPct || 0) > 0 ? `${formatPercent(account.discountPct)}%` : '—'}</span>
            <span className="truncate text-xs text-mute" title={datos || undefined}>{datos || '—'}</span>
            <span className="flex items-center justify-end gap-1.5">
              <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`Editar ${account.name}`} onClick={() => openForm(account)}>Editar</Button>
              <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`${account.isActive ? 'Desactivar' : 'Activar'} ${account.name}`} onClick={() => mutate(() => updatePaymentAccount(account.id, { isActive: !account.isActive }), account.isActive ? 'Cuenta desactivada. El historial se conserva.' : 'Cuenta activada.')}>{account.isActive ? 'Desactivar' : 'Activar'}</Button>
            </span>
          </div>
        })}
        </div>
      </div>}
    </Card>
  )
}
