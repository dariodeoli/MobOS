import { useEffect, useState } from 'react'
import { gs } from '@/utils/calculos'
import { Button, Input, MoneyInput, Select, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SerialField from '@/components/shared/SerialField'
import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { normalizarModelo, valorSugerido } from '@/utils/tradeInCheckout'
import { SellerSection } from './SellerData'
import SellerPromotions from './SellerPromotions'

const CONDICIONES = [['USED', 'Seminuevo'], ['NEW', 'Nuevo'], ['REFURBISHED', 'Reacondicionado']]

export default function SellerTools({ vista, onCargarVenta }) {
  const [model, setModel] = useState('')
  const [imei, setImei] = useState('')
  const [value, setValue] = useState('')
  const [condition, setCondition] = useState('USED')
  const [conditionNotes, setConditionNotes] = useState('')
  const [sugerencia, setSugerencia] = useState(null)
  const [sugerenciaEstado, setSugerenciaEstado] = useState('idle')
  const valid = Boolean(model.trim() && imei.trim() && conditionNotes.trim() && String(value ?? '').trim() && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647)

  // El valor sugerido se consulta con retraso mientras se escribe: es una
  // referencia para el vendedor, nunca un dato que bloquee la carga.
  useEffect(() => {
    if (isDemoRuntime || normalizarModelo(model).length < 2) {
      setSugerencia(null)
      setSugerenciaEstado('idle')
      return
    }
    const controller = new AbortController()
    setSugerenciaEstado('buscando')
    const timer = setTimeout(() => {
      api.get(`/api/device-valuations?${new URLSearchParams({ model: model.trim(), condition })}`, { signal: controller.signal })
        .then(rows => {
          const encontrada = valorSugerido(rows, model, condition)
          setSugerencia(encontrada)
          setSugerenciaEstado(encontrada ? 'listo' : 'sin')
        })
        .catch(error => {
          if (error?.code === 'REQUEST_ABORTED') return
          setSugerencia(null)
          setSugerenciaEstado('error')
        })
    }, 350)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [model, condition])

  if (vista === 'promociones') return <SellerPromotions />
  return <SellerSection description="Prepará los datos del equipo y el valor de toma ya acordado para cargarlo como parte de pago.">
    <form className="space-y-4 rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.06] to-transparent p-5" onSubmit={(event) => { event.preventDefault(); if (valid) { onCargarVenta?.({ model: model.trim(), imei: imei.trim(), condition, conditionNotes: conditionNotes.trim(), value: Number(value) }); setModel(''); setImei(''); setValue(''); setCondition('USED'); setConditionNotes('') } }}>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/15 text-fono-light"><Icon name="refresh" className="h-4 w-4" /></span>
        <div><p className="text-sm font-bold">Canje como parte de pago</p><p className="text-[11px] text-mute">El valor sugerido es una referencia editable; vale el valor acordado con el cliente.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-mute">Modelo y capacidad<Input required maxLength={150} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Ej. iPhone 13 128GB" /></label>
        <label className="block space-y-1.5 text-xs text-mute">IMEI / serial<SerialField required value={imei} onChange={setImei} placeholder="35…" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-mute">Condición<Select value={condition} onChange={(event) => setCondition(event.target.value)}>{CONDICIONES.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}</Select></label>
        <div className="self-end text-xs text-mute">
          {sugerenciaEstado === 'buscando' && <p role="status">Buscando valor sugerido…</p>}
          {sugerenciaEstado === 'listo' && sugerencia && <p className="rounded-xl border border-fono/25 bg-fono/10 px-3 py-2 text-sm text-fore">
            Valor sugerido: <b className="tabular-nums text-fono-light">{gs(sugerencia.baseValuePyg)}</b>
            {sugerencia.maxValuePyg ? <span className="text-mute"> · hasta {gs(sugerencia.maxValuePyg)}</span> : null}
            <button type="button" className="ml-2 underline" onClick={() => setValue(String(sugerencia.baseValuePyg))}>Usar</button>
          </p>}
          {sugerenciaEstado === 'sin' && <p>Sin valor cargado para ese modelo y condición.</p>}
          {sugerenciaEstado === 'error' && <p>No se pudo consultar el valor sugerido; cargá el valor acordado.</p>}
        </div>
      </div>
      <label className="block space-y-1.5 text-xs text-mute">Detalle de la condición<Textarea required maxLength={2000} value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} placeholder="Estado, accesorios y reparaciones pendientes" /></label>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <label className="block space-y-1.5 text-xs text-mute">Valor de toma acordado (Gs)<MoneyInput required value={value} onValueChange={setValue} placeholder="0" /></label>
        <p className="rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm">Valor acordado: <b className="tabular-nums text-fono-light">{valid ? gs(Number(value)) : '—'}</b></p>
      </div>
      <p className="text-xs text-mute">Al continuar, el canje se agrega a los pagos de la venta con estos datos (revisalo en Cobrar). El equipo entra a la pipeline recién al confirmar la venta.</p>
      <Button disabled={!valid}>Continuar en Cargar venta</Button>
    </form>
  </SellerSection>
}
