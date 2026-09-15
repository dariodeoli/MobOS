import { useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { quoteDemoPromotion } from '@/lib/demoPromotions'
import { Input, MoneyInput } from '@/components/ui'
import { gs } from '@/utils/calculos'

export default function ProductPrice({ product, price, onChange: notify, quantity = 1, esDemo = false }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState('')
  const version = useRef(0)
  const current = useRef(null)
  current.current = `${product.id}:${quantity}:${price}`
  function onChange(value) { version.current++; setApplied(''); notify(value, null) }
  async function applyCoupon() {
    const requestVersion = ++version.current
    const identity = current.current
    setBusy(true); setError('')
    try {
      const quote = esDemo ? quoteDemoPromotion(product, quantity, code) : await api.post('/api/promotions/quote', { productId: product.id, quantity, couponCode: code })
      if (requestVersion !== version.current || identity !== current.current) return
      setApplied(quote.couponCode)
      notify(String(quote.unitPricePyg), quote.couponCode)
    } catch (e) { if (requestVersion === version.current && identity === current.current) setError(e.message || 'No se pudo aplicar el cupón.') } finally { setBusy(false) }
  }
  const [mode, setMode] = useState('price')
  const [discount, setDiscount] = useState('')
  const [error, setError] = useState('')
  const base = Number(product.precioVenta) || 0
  function change(value) {
    setDiscount(value)
    const amount = mode === 'percent' ? Number(value.replace(',', '.')) : Number(value.replace(/\D/g, ''))
    const validInput = mode === 'percent' ? /^\d*(?:[.,]\d{0,2})?$/.test(value) : /^[\d.]*$/.test(value)
    if (!validInput || !Number.isFinite(amount) || amount < 0 || (mode === 'percent' && amount > 100) || (mode === 'amount' && amount > base)) { setError('El descuento no puede superar el precio ni ser negativo.'); onChange(''); return }
    setError('')
    onChange(String(Math.max(0, base - Math.round(mode === 'percent' ? base * amount / 100 : amount))))
  }
  return <div className="space-y-3 rounded-2xl border border-fono/30 bg-fono/5 p-4 md:col-span-2">
    <p className="font-semibold">{product.nombre}</p><p className="text-sm text-mute">Precio base: {gs(base)}</p>
    <div className="flex flex-wrap gap-2">{[['price','Precio manual'],['percent','Descuento %'],['amount','Descuento Gs']].map(([id,label]) => <button type="button" key={id} aria-pressed={mode === id} className={`rounded-lg border px-3 py-2 text-sm ${mode === id ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600'}`} onClick={() => { setMode(id); setDiscount(''); setError(''); onChange(String(base)) }}>{label}</button>)}</div>
    {mode === 'price' ? <label className="block text-xs text-mute">Precio de venta<MoneyInput aria-label="Precio de venta" value={price} onValueChange={v => onChange(v)} /></label> : <label className="block text-xs text-mute">{mode === 'percent' ? 'Porcentaje (0–100)' : 'Monto a descontar'}{mode === 'percent' ? <Input aria-label="Descuento del producto" inputMode="decimal" value={discount} onChange={e => change(e.target.value)} /> : <MoneyInput aria-label="Descuento del producto" value={discount} onValueChange={v => change(String(v ?? ''))} />}</label>}
    <p className="text-lg font-bold text-fono-light">Precio final: {gs(Number(String(price).replace(/\D/g, '')) || 0)}</p>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <div className="flex flex-wrap gap-2"><label className="text-xs text-mute">Cupón<Input aria-label="Código de cupón" maxLength={40} value={code} onChange={e => setCode(e.target.value)} /></label><button type="button" disabled={busy || !code.trim()} onClick={applyCoupon} className="rounded-lg border px-3 py-2 text-sm">{busy ? 'Validando…' : 'Aplicar cupón'}</button>{applied && <button type="button" onClick={() => { setCode(''); onChange(String(base)) }}>Quitar {applied}</button>}</div>
    <p className="text-xs text-mute">{esDemo ? 'Demo ficticia: probá DEMO10.' : 'El cupón se valida nuevamente al guardar. No acumulable con descuento global.'}</p>
  </div>
}
