import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { buttonClass, fieldClass, SellerSection } from './SellerData'
import SellerPromotions from './SellerPromotions'

export default function SellerTools({ vista, onCargarVenta }) {
  const [model, setModel] = useState('')
  const [imei, setImei] = useState('')
  const [value, setValue] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const valid = Boolean(model.trim() && imei.trim() && conditionNotes.trim() && value.trim() && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647)
  if (vista === 'promociones') return <SellerPromotions />
  return <SellerSection title="Trade-In" description="Prepará los datos del equipo y el valor de toma ya acordado para cargarlo como parte de pago.">
    <form className="space-y-4 rounded-2xl border border-white/10 p-6" onSubmit={(event) => { event.preventDefault(); if (valid) { onCargarVenta?.({ model: model.trim(), imei: imei.trim(), conditionNotes: conditionNotes.trim(), value: Number(value) }); setModel(''); setImei(''); setValue(''); setConditionNotes('') } }}>
      <p className="text-slate-400">Esta ficha no calcula una cotización automática. Confirmá el valor con el responsable de la tienda.</p>
      <label className="block space-y-2"><span>Modelo del equipo</span><input required maxLength={150} className={fieldClass} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Modelo y capacidad" /></label>
      <label className="block space-y-2"><span>IMEI / serial</span><input required maxLength={100} className={fieldClass} value={imei} onChange={(event) => setImei(event.target.value)} /></label>
      <label className="block space-y-2"><span>Condición del equipo recibido</span><textarea required maxLength={2000} className={fieldClass} value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} placeholder="Estado, accesorios y reparaciones pendientes" /></label>
      <label className="block space-y-2"><span>Valor de toma acordado (Gs)</span><input required inputMode="numeric" className={fieldClass} value={formatGsInput(value)} onChange={(event) => setValue(event.target.value.trim() ? String(parseGsInput(event.target.value)) : '')} /></label>
      {valid && <p className="font-semibold text-fono-light">Valor acordado: {gs(Number(value))}</p>}
      <p className="text-sm text-slate-400">Al continuar se añade el canje a los pagos de la venta con estos datos. Revisalo en Cobrar. El equipo se registra en la pipeline únicamente al confirmar la venta.</p>
      <button className={buttonClass} disabled={!valid}>Continuar en Cargar venta</button>
    </form>
  </SellerSection>
}
