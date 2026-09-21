import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { isDemoRuntime } from '@/lib/demoMode'
import { getPaymentAccounts, createPaymentAccount, updatePaymentAccount } from '@/lib/paymentAccounts'
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui'
import CurrencySelect from '@/components/shared/CurrencySelect'
import BancoCombobox from '@/components/shared/BancoCombobox'
import BancoLogo from '@/components/shared/BancoLogo'
import { marcaDeMedio } from '@/components/shared/MedioPago'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { cn } from '@/lib/utils'

// Tabla compacta: una fila por cuenta, con comisión, acreditación y descuento.
const GRID_CUENTAS = 'grid min-w-[54rem] grid-cols-[minmax(0,1.3fr)_7rem_5rem_6.5rem_6.5rem_6.5rem_minmax(0,1fr)_9rem] items-center gap-x-2'
const CELDA_CUENTAS = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

const EMPTY = { name: '', bank: '', holder: '', accountNumber: '', document: '', processor: '', pixKey: '', reference: '', currencyLabel: '', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0, discountPct: 0, settlementDays: 0 }

// Cada medio tiene su modelo (#142): qué campos muestra, con qué moneda y qué
// comportamiento aplica. La moneda fija se guarda sola (Pix en reales, Cripto
// en dólares) y el resto elige entre las del sistema o una personalizada.
const MEDIOS = [
  { kind: 'CASH', label: 'Efectivo', banco: false, titular: false, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: false, moneda: true, personalizada: true, comportamiento: ['discount'] },
  { kind: 'TRANSFER', label: 'Transferencia', banco: true, titular: true, documento: true, cuenta: true, procesadora: false, pixKey: false, referencia: false, moneda: true, personalizada: false, comportamiento: ['discount', 'fee', 'settlement'] },
  { kind: 'CARD', label: 'Tarjeta', banco: false, titular: false, documento: false, cuenta: false, procesadora: true, pixKey: false, referencia: false, moneda: true, personalizada: false, comportamiento: ['fee', 'settlement'] },
  { kind: 'PIX', label: 'Pix', banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: true, referencia: false, moneda: false, monedaFija: 'BRL', personalizada: false, comportamiento: [] },
  { kind: 'CRYPTO', label: 'USDT - Cripto', banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: true, moneda: false, monedaFija: 'USD', personalizada: false, comportamiento: [] },
  { kind: 'TRADE_IN', label: 'Canje', banco: false, titular: true, documento: false, cuenta: false, procesadora: false, pixKey: false, referencia: true, moneda: true, personalizada: false, comportamiento: [] },
]
const medioDe = (kind) => MEDIOS.find((medio) => medio.kind === kind) || MEDIOS[0]

// Procesadoras/adquirentes de tarjeta (#142, decisión de Dario): Bancard,
// Dinelco, UPay y Pix. La lista es configurable: se puede escribir otra.
const PROCESADORAS = ['Bancard', 'Dinelco', 'UPay', 'Pix']

const MONEDAS_FIJAS = { BRL: 'BRL · Reales', USD: 'USD · Dólares' }

const TEMPLATES = [
  { name: 'Efectivo Gs', kind: 'CASH', currency: 'PYG' },
  { name: 'Efectivo USD', kind: 'CASH', currency: 'USD' },
  { name: 'Transferencia', kind: 'TRANSFER', currency: 'PYG' },
  { name: 'Tarjeta', kind: 'CARD', currency: 'PYG' },
  { name: 'Pix', kind: 'PIX', currency: 'BRL' },
  { name: 'USDT - Cripto', kind: 'CRYPTO', currency: 'USD' },
  { name: 'Canje', kind: 'TRADE_IN', currency: 'PYG' },
]

// Comportamiento del medio: el campo solo existe mientras está encendido;
// apagado, el valor se guarda en 0 (sin descuento, sin comisión, acreditación
// inmediata). Un solo arreglo dibuja los bloques.
const COMPORTAMIENTO = [
  { field: 'discountPct', control: 'percent', check: 'Aplica descuento', label: 'Descuento por este medio (%)', hint: 'Sugerido al cobrar con este medio (ej. efectivo 5%).' },
  { field: 'settlementDays', control: 'days', check: 'Se acredita en días', label: 'Días en acreditarse', hint: 'Tarjeta suele tardar 1-3 días hábiles.' },
  { field: 'feePercent', control: 'percent', check: 'Tiene comisión', label: 'Comisión (%)', hint: 'Lo que retiene el medio sobre el total cobrado.' },
]

function flagsFrom(values) {
  return Object.fromEntries(COMPORTAMIENTO.map(({ field }) => [field, Number(values[field]) > 0]))
}

// Logo de la cuenta: el banco guardado, la procesadora o, cuando la cuenta
// nace de una marca de medio de pago (#118), su nombre.
function bancoConLogo(account) {
  if (account.bank) return account.bank
  if (account.processor) return account.processor
  return marcaDeMedio(account.name) ? account.name : ''
}

// Datos que se muestran en la tabla según el medio (#142).
function datosDe(account) {
  const partes = {
    TRANSFER: [account.bank, account.holder, account.document, account.accountNumber],
    CARD: [account.processor],
    PIX: [account.holder, account.pixKey],
    CRYPTO: [account.holder, account.reference],
    TRADE_IN: [account.holder, account.reference],
    CASH: [account.holder],
  }[account.kind] || []
  return partes.filter(Boolean).join(' · ')
}

// Porcentaje para la tabla: 0 se lee como "no aplica", no como "0%".
function porcentaje(valor) {
  return Number(valor || 0) > 0 ? `${formatPercent(valor)}%` : '—'
}

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
  const [flags, setFlags] = useState(flagsFrom(EMPTY))
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
    // Los opcionales vacíos llegan null desde la API: el formulario trabaja
    // siempre con texto (evita inputs sin control y el error de validación).
    const values = { ...EMPTY, ...account }
    for (const key of ['bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel']) {
      if (values[key] == null) values[key] = ''
    }
    setEditingId(account?.id ?? null)
    setForm(values)
    setFlags(flagsFrom(values))
    setMessage(null)
  }

  function change(key, value) { setForm(current => ({ ...current, [key]: value })) }

  // Al cambiar de medio, la moneda fija del medio (Pix/USDT) se aplica sola y
  // los campos que no corresponden quedan vacíos.
  function changeMedio(kind) {
    setForm(current => {
      const medio = medioDe(kind)
      return {
        ...current,
        kind,
        currency: medio.monedaFija || current.currency,
        currencyLabel: medio.monedaFija ? '' : current.currencyLabel,
        feePercent: medio.comportamiento.includes('fee') ? current.feePercent : 0,
        settlementDays: medio.comportamiento.includes('settlement') ? current.settlementDays : 0,
        discountPct: medio.comportamiento.includes('discount') ? current.discountPct : 0,
      }
    })
    setFlags(current => ({
      feePercent: medioDe(kind).comportamiento.includes('fee') ? current.feePercent : false,
      settlementDays: medioDe(kind).comportamiento.includes('settlement') ? current.settlementDays : false,
      discountPct: medioDe(kind).comportamiento.includes('discount') ? current.discountPct : false,
    }))
  }

  // Al abrir un campo, un 0 heredado del modelo se limpia para escribir directo.
  function toggleBehavior(field, on) {
    setFlags(current => ({ ...current, [field]: on }))
    setForm(current => (on && !parsePercent(current[field]) ? { ...current, [field]: '' } : current))
  }

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
    const medio = medioDe(form.kind)
    const values = { ...form, currency: medio.monedaFija || form.currency }
    for (const { field, control } of COMPORTAMIENTO) {
      values[field] = medio.comportamiento.includes(field === 'feePercent' ? 'fee' : field === 'settlementDays' ? 'settlement' : 'discount')
        ? (flags[field] ? (control === 'percent' ? parsePercent(values[field]) ?? 0 : Number(values[field]) || 0) : 0)
        : 0
    }
    mutate(() => editingId ? updatePaymentAccount(editingId, values) : createPaymentAccount(values), 'Cuenta guardada.')
  }

  const medio = form ? medioDe(form.kind) : MEDIOS[0]
  const monedaFija = medio.monedaFija || ''
  const transferNuevo = form?.kind === 'TRANSFER' && !editingId
  const camposComportamiento = COMPORTAMIENTO.filter(({ field }) => medio.comportamiento.includes(field === 'feePercent' ? 'fee' : field === 'settlementDays' ? 'settlement' : 'discount'))

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Configurá los medios de pago. Desactivar conserva la cuenta y su historial.</p>
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
      {form && <form onSubmit={save} data-testid="cuenta-form" className="space-y-4 rounded-lg border border-ink-600 p-4">
        <h3 className="text-sm font-semibold">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="pa-kind">Medio de pago</Label><Select id="pa-kind" value={form.kind} onChange={event => changeMedio(event.target.value)}>{MEDIOS.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}</Select></div>
          <div><Label htmlFor="pa-name">Nombre</Label><Input id="pa-name" autoFocus required maxLength={200} value={form.name} onChange={event => change('name', event.target.value)} placeholder="Ej. Caja principal" /></div>
          {monedaFija
            ? <div><Label>Moneda</Label><p className="flex h-11 items-center rounded-lg border border-ink-500 bg-ink-800 px-3.5 text-sm text-mute md:h-9">{MONEDAS_FIJAS[monedaFija] || monedaFija} (fija para este medio)</p></div>
            : <div><Label htmlFor="pa-currency">Moneda</Label><CurrencySelect id="pa-currency" value={form.currency} onChange={event => change('currency', event.target.value)} /></div>}
          {medio.personalizada && <div className="sm:col-span-2"><Label htmlFor="pa-currency-label">Moneda personalizada (opcional)</Label><Input id="pa-currency-label" maxLength={12} value={form.currencyLabel} onChange={event => change('currencyLabel', event.target.value.toUpperCase())} placeholder="Ej. ARS, PEN, CLP" /><p className="mt-1 text-[11px] text-mute">Se usa como etiqueta visible; los cálculos siguen la moneda elegida arriba.</p></div>}
          {medio.banco && <div className="sm:col-span-2"><Label htmlFor="pa-bank">Banco {form.kind !== 'TRANSFER' && '(opcional)'}</Label><BancoCombobox id="pa-bank" value={form.bank} onChange={value => change('bank', value)} required={form.kind === 'TRANSFER'} placeholder="Buscá entre los bancos de Paraguay o escribí otro" /></div>}
          {medio.procesadora && <div><Label htmlFor="pa-processor">Procesadora</Label><Select id="pa-processor" value={PROCESADORAS.includes(form.processor) ? form.processor : form.processor ? '__otra' : ''} onChange={event => change('processor', event.target.value === '__otra' ? '' : event.target.value)}><option value="">Elegí la procesadora</option>{PROCESADORAS.map(procesadora => <option key={procesadora} value={procesadora}>{procesadora}</option>)}<option value="__otra">Otra…</option></Select>{!PROCESADORAS.includes(form.processor) && <Input className="mt-2" maxLength={200} value={form.processor} onChange={event => change('processor', event.target.value)} placeholder="Nombre de la procesadora" />}</div>}
          {medio.titular && <div><Label htmlFor="pa-holder">Titular {!transferNuevo && '(opcional)'}</Label><Input id="pa-holder" required={transferNuevo} maxLength={200} value={form.holder} onChange={event => change('holder', event.target.value)} placeholder="Nombre del titular" /></div>}
          {medio.documento && <div><Label htmlFor="pa-document">Documento (cédula/RUC)</Label><Input id="pa-document" maxLength={200} value={form.document} onChange={event => change('document', event.target.value)} placeholder="Ej. 3.456.789-0" /></div>}
          {medio.cuenta && <div><Label htmlFor="pa-number">Número de cuenta {!transferNuevo && '(opcional)'}</Label><Input id="pa-number" type="text" required={transferNuevo} maxLength={200} value={form.accountNumber} onChange={event => change('accountNumber', event.target.value)} /></div>}
          {medio.pixKey && <div><Label htmlFor="pa-pix-key">Llave Pix</Label><Input id="pa-pix-key" maxLength={200} value={form.pixKey} onChange={event => change('pixKey', event.target.value)} placeholder="CPF/CNPJ, correo, teléfono o aleatoria" /></div>}
          {medio.referencia && <div><Label htmlFor="pa-reference">{form.kind === 'CRYPTO' ? 'Referencia de la billetera' : form.kind === 'TRADE_IN' ? 'Valor de canje' : 'Referencia'}</Label><Input id="pa-reference" maxLength={200} value={form.reference} onChange={event => change('reference', event.target.value)} placeholder={form.kind === 'CRYPTO' ? 'Ej. TRC20 · TQn9…' : form.kind === 'TRADE_IN' ? 'Ej. equipo recibido, valor acordado' : 'Referencia'} /></div>}
        </fieldset>
        {camposComportamiento.length > 0 && <fieldset disabled={busy} className="space-y-3 rounded-lg border border-ink-600/70 bg-ink-800/30 p-3">
          <legend className="px-1 text-[10px] font-bold uppercase tracking-wider text-mute">Comportamiento del medio</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {camposComportamiento.map(({ field, control, check, label, hint }) => <div key={field} className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-fono" checked={Boolean(flags[field])} onChange={event => toggleBehavior(field, event.target.checked)} />{check}</label>
              {flags[field] && <div>
                <Label htmlFor={`pa-${field}`}>{label}</Label>
                {control === 'percent'
                  ? <PercentField id={`pa-${field}`} required value={form[field]} onChange={value => change(field, value)} />
                  : <Input id={`pa-${field}`} inputMode="numeric" maxLength={2} required value={form[field]} onChange={event => change(field, event.target.value.replace(/\D/g, ''))} placeholder="Ej. 2" />}
                <p className="mt-1 text-[11px] text-mute">{hint}</p>
              </div>}
            </div>)}
          </div>
        </fieldset>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-fono" checked={form.isActive} onChange={event => change('isActive', event.target.checked)} />Cuenta activa</label>
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
          const datos = datosDe(account)
          const banco = bancoConLogo(account)
          const medioCuenta = medioDe(account.kind)
          return <div key={account.id} data-testid="cuenta-fila" className={cn(GRID_CUENTAS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
            <span className="min-w-0"><span className="flex min-w-0 items-center gap-1.5">{banco && <BancoLogo banco={banco} alto="h-4" soloCatalogo />}<b className="truncate text-[13px] font-semibold" title={account.name}>{account.name}</b></span><Badge color={account.isActive ? 'green' : 'slate'} className="mt-0.5 w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">{account.isActive ? 'Activa' : 'Inactiva'}</Badge></span>
            <span className="truncate text-xs text-mute">{medioCuenta.label}</span>
            <span className="truncate text-xs text-mute">{account.currencyLabel || (account.currency === 'PYG' ? 'Gs' : account.currency)}</span>
            <span className="truncate text-xs tabular-nums text-mute">{porcentaje(account.feePercent)}</span>
            <span className="truncate text-xs text-mute">{account.settlementDays > 0 ? `${account.settlementDays} día${account.settlementDays === 1 ? '' : 's'}` : 'Inmediata'}</span>
            <span className="truncate text-xs tabular-nums text-mute">{porcentaje(account.discountPct)}</span>
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
