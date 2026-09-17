import { useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { quoteDemoPromotion } from '@/lib/demoPromotions'
import { Badge, Input, MoneyInput } from '@/components/ui'
import PercentField from '@/components/shared/PercentField'
import { gs } from '@/utils/calculos'

const MODOS = [['price', 'Precio manual'], ['percent', 'Descuento %'], ['amount', 'Descuento Gs']]

export default function ProductPrice({ product, price, onChange: notify, quantity = 1, esDemo = false }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState('')
  const [mode, setMode] = useState('price')
  const [discount, setDiscount] = useState('')
  const [error, setError] = useState('')
  const [fxBusy, setFxBusy] = useState(false)
  const version = useRef(0)
  const current = useRef(null)
  current.current = `${product.id}:${quantity}:${price}`
  const base = Number(product.precioVenta) || 0
  const final = Number(String(price).replace(/\D/g, '')) || 0
  const descuentoAplicado = Math.max(0, base - final)

  function onChange(value) { version.current++; setApplied(''); notify(value, null) }
  function change(value) {
    setDiscount(value)
    const amount = mode === 'percent' ? Number(value.replace(',', '.')) : Number(value.replace(/\D/g, ''))
    const validInput = mode === 'percent' ? /^\d*(?:[.,]\d{0,2})?$/.test(value) : /^[\d.]*$/.test(value)
    if (!validInput || !Number.isFinite(amount) || amount < 0 || (mode === 'percent' && amount > 100) || (mode === 'amount' && amount > base)) { setError('El descuento no puede superar el precio ni ser negativo.'); onChange(''); return }
    setError('')
    onChange(String(Math.max(0, base - Math.round(mode === 'percent' ? base * amount / 100 : amount))))
  }
  async function usarPrecioUsd() {
    if (fxBusy) return
    const usd = Number(product.priceUsd || 0)
    if (!(usd > 0)) return
    setFxBusy(true); setError('')
    try {
      const fx = await api.get('/api/fx')
      const rate = Number(fx?.referencialDiario || 0)
      if (!(rate > 0)) throw new Error('No hay cotización disponible; cargá el precio a mano.')
      const converted = Math.round(usd * rate)
      setMode('price'); setDiscount(''); notify(String(converted), null)
    } catch (cause) { setError(cause?.message || 'No se pudo convertir el precio en USD.') } finally { setFxBusy(false) }
  }

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

  return <div className="space-y-3 rounded-2xl border border-fono/30 bg-gradient-to-br from-fono/[.07] to-transparent p-4 md:col-span-2">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0"><p className="truncate font-semibold">{product.nombre}</p><p className="text-xs text-mute">Precio base {gs(base)}{quantity > 1 ? ` · ${quantity} unidades` : ''}</p></div>
      <div className="text-right">
        {!esDemo && Number(product.priceUsd || 0) > 0 && <button type="button" disabled={fxBusy} onClick={usarPrecioUsd} className="mb-1 rounded-lg border border-fono/40 px-2 py-1 text-[11px] font-semibold text-fono-light transition hover:bg-fono/10 disabled:opacity-40">{fxBusy ? 'Convirtiendo…' : `Usar US$ ${Number(product.priceUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })} (BCP)`}</button>}
        <p className="text-[11px] uppercase tracking-wider text-mute">Precio final</p>
        <p className="text-xl font-bold tabular-nums text-fono-light">{gs(final)}</p>
        {descuentoAplicado > 0 && <p className="text-[11px] font-semibold text-warn">− {gs(descuentoAplicado)} de descuento</p>}
      </div>
    </div>

    <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{MODOS.map(([id, label]) => <button type="button" key={id} aria-pressed={mode === id} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`} onClick={() => { setMode(id); setDiscount(''); setError(''); onChange(String(base)) }}>{label}</button>)}</div>

    {mode === 'price'
      ? <label className="block text-xs text-mute">Precio de venta<MoneyInput className="mt-1" aria-label="Precio de venta" value={price} onValueChange={v => onChange(v)} /></label>
      : <label className="block text-xs text-mute">{mode === 'percent' ? 'Porcentaje (0–100)' : 'Monto a descontar'}{mode === 'percent'
        ? <PercentField className="mt-1" aria-label="Descuento del producto" value={discount} onChange={change} placeholder="Ej. 10" />
        : <MoneyInput className="mt-1" aria-label="Descuento del producto" value={discount} onValueChange={v => change(String(v ?? ''))} placeholder="0" />}</label>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}

    <div className="rounded-xl border border-ink-600 bg-ink-800/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-mute">Cupón</p>
        {applied && <Badge color="green">Cupón {applied} aplicado <button type="button" className="ml-1 text-mute hover:text-bad" onClick={() => { setCode(''); setApplied(''); onChange(String(base)) }} aria-label="Quitar cupón">×</button></Badge>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input aria-label="Código de cupón" className="min-w-[8rem] flex-1" maxLength={40} value={code} onChange={e => setCode(e.target.value)} placeholder="Código del cupón" />
        <button type="button" disabled={busy || !code.trim()} onClick={applyCoupon} className="rounded-lg border border-fono/40 px-3 py-2 text-sm font-semibold text-fono-light transition hover:bg-fono/10 disabled:opacity-40">{busy ? 'Validando…' : 'Aplicar cupón'}</button>
      </div>
      <p className="mt-2 text-[11px] text-mute">{esDemo ? 'Demo ficticia: probá DEMO10.' : 'El cupón se valida nuevamente al guardar. No acumulable con descuento global.'}</p>
    </div>
  </div>
}
