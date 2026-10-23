import { Input, Label, Select } from '@/components/ui'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { HALLAZGOS_TOMA } from '@/lib/tradeInValuation'
import { ACCESORIOS_TOMA } from '@/utils/tradeInCheckout'
import { cn } from '@/lib/utils'
import { coloresDeModelo, modeloApple } from '../../../backend/lib/catalogo-apple.mjs'

// Datos del equipo al aceptarlo como parte de pago (POS, cobro de un pedido y
// cotizador): color (de los del modelo), % de batería, fallas (lista + texto) y
// accesorios. El IMEI/serial y la condición los carga cada pantalla en su propio
// campo. `value` = { color, batteryPct, faults[], faultsNote, accessories[] };
// `onChange(patch)` entrega solo lo que cambió.
export const FALLAS_TOMA = HALLAZGOS_TOMA.map(([, etiqueta]) => etiqueta)

const alternar = (lista, item) => (lista.includes(item) ? lista.filter((actual) => actual !== item) : [...lista, item])

export default function CamposEquipoRecibido({ value = {}, onChange, model = '', idPrefix = 'equipo', sinFallas = false, disabled = false, className }) {
  const colores = coloresDeModelo(model)
  const catalogo = modeloApple(model)
  const faults = Array.isArray(value.faults) ? value.faults : []
  const accessories = Array.isArray(value.accessories) ? value.accessories : []
  return <div className={cn('space-y-3', className)} data-testid="campos-equipo-recibido">
    <div className={GRILLA_DOS_COLUMNAS}>
      <div>
        <Label htmlFor={`${idPrefix}-color`}>Color</Label>
        {colores.length
          ? <Select id={`${idPrefix}-color`} disabled={disabled} value={value.color || ''} onChange={(event) => onChange({ color: event.target.value })}>
            <option value="">Elegí el color</option>
            {colores.map((color) => <option key={color} value={color}>{color}</option>)}
          </Select>
          : <Input id={`${idPrefix}-color`} disabled={disabled} maxLength={60} value={value.color || ''} onChange={(event) => onChange({ color: event.target.value })} placeholder={catalogo ? 'Color' : 'Color (modelo fuera del catálogo)'} />}
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-bateria`}>Batería (% de salud)</Label>
        <PercentField id={`${idPrefix}-bateria`} disabled={disabled} value={value.batteryPct == null || value.batteryPct === '' ? '' : formatPercent(value.batteryPct)} onChange={(texto) => { const numero = parsePercent(texto); onChange({ batteryPct: numero == null ? '' : Math.min(100, Math.round(numero)) }) }} placeholder="Ej. 87" />
      </div>
    </div>
    {!sinFallas && <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="text-xs font-semibold text-mute">Fallas</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {FALLAS_TOMA.map((falla) => <label key={falla} className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs text-mute transition hover:text-fore sm:min-h-0 sm:py-0.5">
          <input type="checkbox" className="h-4 w-4 accent-fono" checked={faults.includes(falla)} onChange={() => onChange({ faults: alternar(faults, falla) })} />
          <span className="min-w-0 flex-1">{falla}</span>
        </label>)}
      </div>
    </fieldset>}
    <div>
      <Label htmlFor={`${idPrefix}-fallas-texto`}>Otras fallas (opcional)</Label>
      <Input id={`${idPrefix}-fallas-texto`} disabled={disabled} maxLength={1000} value={value.faultsNote || ''} onChange={(event) => onChange({ faultsNote: event.target.value })} placeholder="Describí cualquier otra falla" />
    </div>
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="text-xs font-semibold text-mute">Accesorios que trae</legend>
      <div className="grid gap-1 sm:grid-cols-3">
        {ACCESORIOS_TOMA.map((accesorio) => <label key={accesorio} className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs text-mute transition hover:text-fore sm:min-h-0 sm:py-0.5">
          <input type="checkbox" className="h-4 w-4 accent-fono" checked={accessories.includes(accesorio)} onChange={() => onChange({ accessories: alternar(accessories, accesorio) })} />
          <span className="min-w-0 flex-1">{accesorio}</span>
        </label>)}
      </div>
    </fieldset>
  </div>
}
