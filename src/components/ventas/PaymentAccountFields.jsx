import { Input, Label, MoneyInput, Select, Textarea } from '@/components/ui'
import { gs } from '@/utils/calculos'

const decimal = (value) => {
  const text = String(value ?? '').trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
}

export function accountPayment(payment, accounts) {
  const account = accounts.find((a) => a.id === payment.accountId && a.isActive)
  if (!account) throw new Error('Elegí una cuenta activa para cada pago.')
  if (!['USD', 'PYG'].includes(account.currency)) throw new Error('La cuenta debe estar en USD o PYG.')
  const originalAmount = account.currency === 'PYG'
    ? (/^\d+$/.test(String(payment.originalAmount)) ? Number(payment.originalAmount) : NaN)
    : decimal(payment.originalAmount)
  const exchangeRatePyg = account.currency === 'USD' ? decimal(payment.exchangeRatePyg) : 1
  if (!Number.isFinite(originalAmount) || originalAmount <= 0 ||
      (account.currency === 'PYG' ? !Number.isSafeInteger(originalAmount) : !/^\d+(\.\d{1,2})?$/.test(String(payment.originalAmount).trim().replace(',', '.')))) {
    throw new Error('Ingresá un monto positivo: USD admite hasta 2 decimales y PYG solo enteros.')
  }
  if (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0) throw new Error('Ingresá una cotización manual USD → PYG mayor a cero.')
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

// El campo legacy monto siempre representa guaraníes, incluso al ingresar USD.
export function updateAccountPayment(payment, change, accounts) {
  const next = { ...payment, ...change }
  const account = accounts.find((a) => a.id === next.accountId && a.isActive)
  const original = decimal(next.originalAmount)
  const rate = account?.currency === 'USD' ? decimal(next.exchangeRatePyg) : 1
  const amount = Math.round(original * rate)
  return { ...next, medioPago: account?.name || '', cuenta: account?.name || '', monto: account && original > 0 && rate > 0 && Number.isSafeInteger(amount) ? String(amount) : '' }
}

export default function PaymentAccountFields({ payment, accounts, onChange }) {
  const account = accounts.find((a) => a.id === payment.accountId)
  return <div className="grid gap-2 sm:grid-cols-2 sm:col-span-3">
    <div className="sm:col-span-2">
      <Label>Cuenta de cobro</Label>
      <Select aria-label="Cuenta de cobro" value={payment.accountId || ''} onChange={(e) => onChange({ accountId: e.target.value, originalAmount: '', exchangeRatePyg: '', tradeIn: undefined })}>
        <option value="">Seleccionar cuenta</option>
        {accounts.filter((a) => a.isActive && ['USD', 'PYG'].includes(a.currency)).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.kind}</option>)}
      </Select>
      {account && <p className="mt-1 text-xs text-mute">{[account.bank, account.accountNumber, account.holder].filter(Boolean).join(' · ')}</p>}
    </div>
    <div><Label>Monto original ({account?.currency || 'moneda de la cuenta'})</Label><MoneyInput aria-label="Monto original" disabled={!account} currency={account?.currency || 'PYG'} value={payment.originalAmount} onValueChange={(v) => onChange({ originalAmount: account?.currency === 'PYG' ? (v === '' ? '' : String(v)) : v })} placeholder={account?.currency === 'USD' ? '0,00' : '0'} /></div>
    {account?.currency === 'USD' && <div><Label>Cotización manual (₲ por USD)</Label><MoneyInput aria-label="Cotización manual USD a PYG" currency="USD" symbol="Gs." value={payment.exchangeRatePyg || ''} onValueChange={(v) => onChange({ exchangeRatePyg: v })} placeholder="Ingresar cotización" /></div>}
    <p className="text-sm sm:col-span-2">Equivalente: {gs(Number(payment.monto) || 0)}</p>
    {account?.kind === 'TRADE_IN' && <>
      <div><Label>Serial / IMEI del canje *</Label><Input aria-label="Serial del canje" value={payment.tradeIn?.serial || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, serial: e.target.value } })} /></div>
      <div><Label>Modelo del canje *</Label><Input aria-label="Modelo del canje" value={payment.tradeIn?.model || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, model: e.target.value } })} /></div>
      <div className="sm:col-span-2"><Label>Condición del equipo recibido *</Label><Textarea aria-label="Condición del equipo recibido (obligatoria)" aria-required="true" rows={2} value={payment.tradeIn?.conditionNotes || ''} onChange={(e) => onChange({ tradeIn: { ...payment.tradeIn, conditionNotes: e.target.value } })} /></div>
    </>}
  </div>
}
