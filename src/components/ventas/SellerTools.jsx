import { useEffect, useState } from 'react'
import { gs } from '@/utils/calculos'
import { Button, Input, MoneyInput, Select, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SerialField from '@/components/shared/SerialField'
import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { normalizarModelo, valorSugerido } from '@/utils/tradeInCheckout'
import { GRADOS_TOMA, HALLAZGOS_TOMA, gradoSugerido, valuarToma } from '@/lib/tradeInValuation'
import { SellerSection } from './SellerData'
import SellerPromotions from './SellerPromotions'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

const CONDICIONES = [['USED', 'Seminuevo'], ['NEW', 'Nuevo'], ['REFURBISHED', 'Reacondicionado']]

export default function SellerTools({ vista, onCargarVenta }) {
  const [model, setModel] = useState('')
  const [imei, setImei] = useState('')
  const [value, setValue] = useState('')
  const [condition, setCondition] = useState('USED')
  const [conditionNotes, setConditionNotes] = useState('')
  const [sugerencia, setSugerencia] = useState(null)
  const [sugerenciaEstado, setSugerenciaEstado] = useState('idle')
  // Inspección de la toma (#240 ítem 7): hallazgos + grado alimentan el valor.
  const [hallazgos, setHallazgos] = useState([])
  const [grado, setGrado] = useState('')
  const gradoAuto = gradoSugerido(hallazgos)
  const gradoElegido = grado || gradoAuto
  const valuacion = sugerencia?.baseValuePyg
    ? valuarToma({ baseValuePyg: sugerencia.baseValuePyg, grado: gradoElegido, hallazgos })
    : null
  const alternarHallazgo = (clave) => setHallazgos((actuales) => actuales.includes(clave) ? actuales.filter((item) => item !== clave) : [...actuales, clave])
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
    <form className="space-y-4 rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/[.06] to-transparent p-5" onSubmit={(event) => { event.preventDefault(); if (valid) { const notas = [conditionNotes.trim(), valuacion?.resumen].filter(Boolean).join(' · '); onCargarVenta?.({ model: model.trim(), imei: imei.trim(), condition, conditionNotes: notas, value: Number(value) }); setModel(''); setImei(''); setValue(''); setCondition('USED'); setConditionNotes(''); setHallazgos([]); setGrado('') } }}>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/15 text-fono-light"><Icon name="refresh" className="h-4 w-4" /></span>
        <div><p className="text-sm font-bold">Canje como parte de pago</p><p className="text-[11px] text-mute">El valor sugerido es una referencia editable; vale el valor acordado con el cliente.</p></div>
      </div>
      <div className={GRILLA_DOS_COLUMNAS}>
        <label className="block space-y-1.5 text-xs text-mute">Modelo y capacidad<Input required maxLength={150} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Ej. iPhone 13 128GB" /></label>
        <label className="block space-y-1.5 text-xs text-mute">IMEI / serial<SerialField required value={imei} onChange={setImei} placeholder="35…" /></label>
      </div>
      <div className={GRILLA_DOS_COLUMNAS}>
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
      <fieldset className="space-y-3 rounded-xl border border-ink-600 p-3">
        <legend className="px-1 text-xs font-semibold text-mute">Inspección del equipo (grado y hallazgos)</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {HALLAZGOS_TOMA.map(([clave, etiqueta, porcentaje]) => (
            <label key={clave} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-mute transition hover:text-fore">
              <input type="checkbox" className="h-4 w-4 accent-fono" checked={hallazgos.includes(clave)} onChange={() => alternarHallazgo(clave)} />
              <span className="min-w-0 flex-1 truncate" title={etiqueta}>{etiqueta}</span>
              <span className="shrink-0 tabular-nums">−{porcentaje}%</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-mute">Grado
            <Select aria-label="Grado de la unidad" className="ml-2 h-8 w-auto" value={grado} onChange={(event) => setGrado(event.target.value)}>
              <option value="">Automático (sugerido: {gradoAuto})</option>
              {GRADOS_TOMA.map(([clave, etiqueta, porcentaje]) => <option key={clave} value={clave}>{clave} · {etiqueta}{porcentaje ? ` (−${porcentaje}%)` : ''}</option>)}
            </Select>
          </label>
          {valuacion && (
            <p role="status" className="min-w-0 flex-1 text-xs text-mute">
              Base {gs(valuacion.baseValuePyg)}{valuacion.totalDescuentoPct > 0 ? ` · −${valuacion.totalDescuentoPct}% por grado y hallazgos` : ' · sin descuentos'}:
              {' '}<b className="text-sm tabular-nums text-fono-light">{gs(valuacion.valorFinalPyg)}</b>
              <button type="button" className="ml-2 underline" onClick={() => setValue(String(valuacion.valorFinalPyg))}>Usar</button>
            </p>
          )}
        </div>
        {valuacion && valuacion.descuentos.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-mute">
            {valuacion.descuentos.map((item) => (
              <li key={item.clave} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate" title={item.etiqueta}>{item.etiqueta}{item.recortado ? ' (recortado al tope)' : ''}</span>
                <span className="shrink-0 tabular-nums">−{item.porcentaje}% · −{gs(item.montoPyg)}</span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <label className="block space-y-1.5 text-xs text-mute">Detalle de la condición<Textarea required maxLength={2000} value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} placeholder="Estado, accesorios y reparaciones pendientes" /></label>
      <div className={cn('sm:items-end', GRILLA_DOS_COLUMNAS)}>
        <label className="block space-y-1.5 text-xs text-mute">Valor de toma acordado (Gs)<MoneyInput required value={value} onValueChange={setValue} placeholder="0" /></label>
        <p className="rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm">Valor acordado: <b className="tabular-nums text-fono-light">{valid ? gs(Number(value)) : '—'}</b></p>
      </div>
      <p className="text-xs text-mute">Al continuar, el canje se agrega a los pagos de la venta con estos datos (revisalo en Cobrar). El equipo entra a la pipeline recién al confirmar la venta.</p>
      <Button disabled={!valid}>Continuar en POS</Button>
    </form>
  </SellerSection>
}
