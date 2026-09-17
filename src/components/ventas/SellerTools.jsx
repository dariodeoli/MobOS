import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { Button, Input, MoneyInput, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SerialField from '@/components/shared/SerialField'
import { SellerSection } from './SellerData'
import SellerPromotions from './SellerPromotions'

export default function SellerTools({ vista, onCargarVenta }) {
  const [model, setModel] = useState('')
  const [imei, setImei] = useState('')
  const [value, setValue] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const valid = Boolean(model.trim() && imei.trim() && conditionNotes.trim() && String(value ?? '').trim() && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647)
  if (vista === 'promociones') return <SellerPromotions />
  return <SellerSection title="Trade-In" description="Prepará los datos del equipo y el valor de toma ya acordado para cargarlo como parte de pago.">
    <form className="space-y-4 rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.06] to-transparent p-5" onSubmit={(event) => { event.preventDefault(); if (valid) { onCargarVenta?.({ model: model.trim(), imei: imei.trim(), conditionNotes: conditionNotes.trim(), value: Number(value) }); setModel(''); setImei(''); setValue(''); setConditionNotes('') } }}>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/15 text-fono-light"><Icon name="refresh" className="h-4 w-4" /></span>
        <div><p className="text-sm font-bold">Canje como parte de pago</p><p className="text-[11px] text-mute">La ficha no calcula cotización automática: cargá el valor ya acordado.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-mute">Modelo y capacidad<Input required maxLength={150} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Ej. iPhone 13 128GB" /></label>
        <label className="block space-y-1.5 text-xs text-mute">IMEI / serial<SerialField required value={imei} onChange={setImei} placeholder="35…" /></label>
      </div>
      <label className="block space-y-1.5 text-xs text-mute">Condición del equipo recibido<Textarea required maxLength={2000} value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} placeholder="Estado, accesorios y reparaciones pendientes" /></label>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <label className="block space-y-1.5 text-xs text-mute">Valor de toma acordado (Gs)<MoneyInput required value={value} onValueChange={setValue} placeholder="0" /></label>
        <p className="rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm">Valor acordado: <b className="tabular-nums text-fono-light">{valid ? gs(Number(value)) : '—'}</b></p>
      </div>
      <p className="text-xs text-mute">Al continuar, el canje se agrega a los pagos de la venta con estos datos (revisalo en Cobrar). El equipo entra a la pipeline recién al confirmar la venta.</p>
      <Button disabled={!valid}>Continuar en Cargar venta</Button>
    </form>
  </SellerSection>
}
