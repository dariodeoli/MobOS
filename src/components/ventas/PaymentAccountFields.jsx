import { Input, Label, MoneyInput, Select, Textarea } from '@/components/ui'
import { gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import SerialField from '@/components/shared/SerialField'
import { api } from '@/lib/api/client'
import { useEffect, useRef } from 'react'

const decimal = (value) => {
  const text = String(value ?? '').trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
}

const FOREIGN = (currency) => currency === 'USD' || currency === 'BRL'

// Cotización referencial del dólar (misma fuente que Pagos): se pide una sola
// vez y se reutiliza; si el servicio no responde, la cotización queda manual.
let cotizacionEnCurso = null
export function cotizacionReferencial() {
  if (!cotizacionEnCurso) {
    cotizacionEnCurso = api
      .get('/api/fx')
      .then((data) => Number(data?.referencialDiario || data?.venta) || null)
      .catch(() => null)
  }
  return cotizacionEnCurso
}
export function accountPayment(payment, accounts) {
  const account = accounts.find((a) => a.id === payment.accountId && a.isActive)
  if (!account) throw new Error('Elegí una cuenta activa para cada pago.')
  if (!['USD', 'PYG', 'BRL'].includes(account.currency)) throw new Error('La cuenta debe estar en USD, PYG o BRL.')
  const originalAmount = account.currency === 'PYG'
    ? (/^\d+$/.test(String(payment.originalAmount)) ? Number(payment.originalAmount) : NaN)
    : decimal(payment.originalAmount)
  const exchangeRatePyg = FOREIGN(account.currency) ? decimal(payment.exchangeRatePyg) : 1
  if (!Number.isFinite(originalAmount) || originalAmount <= 0 ||
      (account.currency === 'PYG' ? !Number.isSafeInteger(originalAmount) : !/^\d+(\.\d{1,2})?$/.test(String(payment.originalAmount).trim().replace(',', '.')))) {
    throw new Error('Ingresá un monto positivo: USD/BRL admite hasta 2 decimales y PYG solo enteros.')
  }
  if (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0) throw new Error('Ingresá una cotización manual mayor a cero.')
  const amountPyg = Math.round(originalAmount * exchangeRatePyg)
  if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0) throw new Error('El monto convertido en PYG no es válido.')
  const tradeIn = account.kind === 'TRADE_IN' ? {
    serial: (payment.tradeIn?.serial || '').trim(),
    model: (payment.tradeIn?.model || '').trim(),
    conditionNotes: (payment.tradeIn?.conditionNotes || '').trim(),
  } : undefined
  if (tradeIn && (!tradeIn.serial || !tradeIn.model || !tradeIn.conditionNotes)) throw new Error('El canje requiere serial, modelo y condición del equipo recibido.')
  return { accountId: account.id, originalAmount, exchangeRatePyg, amountPyg, method: account.kind, status: 'CONFIRMED', ...(tradeIn ? { tradeIn } : {}) }
}

// El campo legacy monto siempre representa guaraníes, incluso al ingresar USD/BRL.
export function updateAccountPayment(payment, change, accounts) {
  const next = { ...payment, ...change }
  const account = accounts.find((a) => a.id === next.accountId && a.isActive)
  const original = decimal(next.originalAmount)
  const rate = FOREIGN(account?.currency) ? decimal(next.exchangeRatePyg) : 1
  const amount = Math.round(original * rate)
  return { ...next, medioPago: account?.name || '', cuenta: account?.name || '', monto: account && original > 0 && rate > 0 && Number.isSafeInteger(amount) ? String(amount) : '' }
}

export default function PaymentAccountFields({ payment, accounts, onChange }) {
  const account = accounts.find((a) => a.id === payment.accountId)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  // Cotización automática para cuentas en USD: se pide una vez (con caché de la
  // API) y queda editable: es la sugerencia, no una obligación.
  useEffect(() => {
    if (account?.currency !== 'USD' || Number(payment.exchangeRatePyg) > 0) return undefined
    let vivo = true
    cotizacionReferencial().then((rate) => {
      if (vivo && rate > 0) onChangeRef.current({ exchangeRatePyg: String(rate) })
    })
    return () => { vivo = false }
  }, [account?.currency, payment.exchangeRatePyg])
  return <div className="grid gap-3 rounded-2xl border border-ink-600 bg-ink-800/40 p-3 sm:grid-cols-2 sm:col-span-3">
    <div className="sm:col-span-2">
      <Label htmlFor="cuenta-de-cobro">Cuenta de cobro</Label>
      <Select id="cuenta-de-cobro" aria-label="Cuenta de cobro" value={payment.accountId || ''} onChange={(e) => onChange({ accountId: e.target.value, originalAmount: '', exchangeRatePyg: '', tradeIn: undefined })}>
        <option value="">Seleccionar cuenta</option>
        {accounts.filter((a) => a.isActive && ['USD', 'PYG', 'BRL'].includes(a.currency)).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.kind}</option>)}
      </Select>
      {account && <p className="mt-1 flex items-center gap-1.5 text-xs text-mute"><Icon name="wallet" className="h-3.5 w-3.5" />{[account.bank, account.accountNumber, account.holder].filter(Boolean).join(' · ') || 'Sin datos bancarios'}{account.settlementDays > 0 ? ` · acredita en ${account.settlementDays} día${account.settlementDays === 1 ? '' : 's'}` : ''}</p>}
    </div>
    <div><Label htmlFor="monto-original">Monto original ({account?.currency || 'moneda de la cuenta'})</Label><MoneyInput id="monto-original" aria-label="Monto original" disabled={!account} currency={account?.currency || 'PYG'} value={payment.originalAmount} onValueChange={(v) => onChange({ originalAmount: account?.currency === 'PYG' ? (v === '' ? '' : String(v)) : v })} placeholder={FOREIGN(account?.currency) ? '0,00' : '0'} /></div>
    {FOREIGN(account?.currency) && <div><Label htmlFor="cotizacion-manual">Cotización (₲ por {account.currency}){account.currency === 'USD' ? ' · automática, editable' : ''}</Label><MoneyInput id="cotizacion-manual" aria-label={`Cotización manual ${account.currency} a PYG`} currency="USD" symbol="Gs." value={payment.exchangeRatePyg || ''} onValueChange={(v) => onChange({ exchangeRatePyg: v })} placeholder="Ingresar cotización" /></div>}
    <p className="rounded-lg border border-fono/20 bg-fono/5 px-3 py-2 text-sm sm:col-span-2">Equivalente: <b className="tabular-nums text-fore">{gs(Number(payment.monto) || 0)}</b></p>
    {account?.kind === 'TRADE_IN' && <>
      <div><Label htmlFor="serial-imei-del-canje">Serial / IMEI del canje *</Label><SerialField id="serial-imei-del-canje" aria-label="Serial del canje" value={payment.tradeIn?.serial || ''} onChange={(value) => onChange({ tradeIn: { ...payment.tradeIn, serial: value } })} /></div>
      <div><Label htmlFor="modelo-del-canje">Modelo del canje *</Label><Input id="modelo-del-canje" aria-label="Modelo del canje" value={payment.tradeIn?.model || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, model: e.target.value } })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="condicion-del-equipo-recibido">Condición del equipo recibido *</Label><Textarea id="condicion-del-equipo-recibido" aria-label="Condición del equipo recibido (obligatoria)" aria-required="true" rows={2} value={payment.tradeIn?.conditionNotes || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, conditionNotes: e.target.value } })} /></div>
    </>}
  </div>
}
