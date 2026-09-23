import { useEffect, useRef, useState } from 'react'
import { fechaClave, fechaClaveParaguay, presetParaguay } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import Icon from './Icon'

// Selector de período: atajos rápidos (día, semana, mes, trimestre, año) más
// un rango personalizado "desde / hasta". Devuelve { desde, hasta } en
// formato YYYY-MM-DD, ambos inclusive.
//
// Los atajos se calculan sobre el día de Paraguay (UTC-3 fijo, `presetParaguay`
// en utils/calculos), no sobre el reloj del navegador: la API interpreta
// desde/hasta como fechas paraguayas (reportes y el resto de Finanzas) y un
// equipo en otra zona horaria (p. ej. un runner de CI en UTC) pedía «Hoy» con
// un día distinto, dejando afuera los cobros recién hechos.

export const PRESETS = [
  { id: 'hoy', label: 'Hoy', calc: () => presetParaguay('hoy') },
  { id: 'ayer', label: 'Ayer', calc: () => presetParaguay('ayer') },
  { id: '7d', label: '7 días', calc: () => presetParaguay('7d') },
  { id: '30d', label: '30 días', calc: () => presetParaguay('30d') },
  { id: 'mes', label: 'Este mes', calc: () => presetParaguay('mes') },
  { id: 'mesAnt', label: 'Mes pasado', calc: () => presetParaguay('mesAnt') },
  { id: 'trim', label: 'Trimestre', calc: () => presetParaguay('trim') },
  { id: 'anio', label: 'Este año', calc: () => presetParaguay('anio') },
]

export const rangoPorDefecto = () => ({ ...PRESETS[0].calc(), preset: 'hoy' })

// El rango vive en la URL: ?rango=hoy (atajo) o ?desde&hasta (rango a mano).
export function rangoDeParams(params, porDefecto = rangoPorDefecto) {
  const elegido = PRESETS.find((p) => p.id === params?.get?.('rango'))
  if (elegido) return { ...elegido.calc(), preset: elegido.id }
  const desde = params?.get?.('desde')
  const hasta = params?.get?.('hasta')
  if (desde && hasta) return { desde, hasta, preset: null }
  return porDefecto()
}

export function paramsDeRango(rango, actuales) {
  const next = new URLSearchParams(actuales)
  next.delete('rango')
  next.delete('desde')
  next.delete('hasta')
  if (rango?.preset) next.set('rango', rango.preset)
  else if (rango?.desde && rango?.hasta) {
    next.set('desde', rango.desde)
    next.set('hasta', rango.hasta)
  }
  return next
}

export function fmtCorto(f) {
  const [, m, d] = (f || '').split('-')
  return d ? `${d}/${m}` : f
}
export function fmtLargo(f) {
  const [y, m, d] = (f || '').split('-')
  return d ? `${d}/${m}/${y}` : f
}
// Etiqueta legible del rango seleccionado.
export function etiquetaRango(r) {
  if (!r) return ''
  const p = PRESETS.find((x) => x.id === r.preset)
  if (p) return p.label
  if (r.desde === r.hasta) return fmtLargo(r.desde)
  return `${fmtCorto(r.desde)} – ${fmtLargo(r.hasta)}`
}
// Días que abarca el rango (para calcular el período anterior comparable).
export function diasDelRango(r) {
  const a = new Date(r.desde + 'T12:00:00')
  const b = new Date(r.hasta + 'T12:00:00')
  return Math.round((b - a) / 86400000) + 1
}
// Rango inmediatamente anterior, del mismo largo (para comparar).
export function rangoAnterior(r) {
  const n = diasDelRango(r)
  const a = new Date(r.desde + 'T12:00:00')
  const hasta = new Date(a)
  hasta.setDate(hasta.getDate() - 1)
  const desde = new Date(hasta)
  desde.setDate(desde.getDate() - (n - 1))
  return { desde: fechaClave(desde), hasta: fechaClave(hasta) }
}

export default function RangoFechas({ valor, onChange, className }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  function elegirPreset(p) {
    onChange({ ...p.calc(), preset: p.id })
    setAbierto(false)
  }
  function setManual(campo, v) {
    if (!v) return
    const next = { ...valor, [campo]: v, preset: null }
    // Mantiene el orden desde ≤ hasta.
    if (next.desde > next.hasta) {
      if (campo === 'desde') next.hasta = v
      else next.desde = v
    }
    onChange(next)
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-3 text-sm text-fore transition hover:border-fono"
      >
        <Icon name="calendar" className="h-4 w-4 text-mute" />
        {etiquetaRango(valor)}
        <Icon
          name="chevron"
          className={cn('h-4 w-4 text-mute transition', abierto && 'rotate-180')}
        />
      </button>

      {abierto && (
        <div className="absolute right-0 z-40 mt-2 w-[19rem] rounded-xl border border-ink-500 bg-ink-800 p-3 shadow-xl">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-mute">
            Período
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => elegirPreset(p)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-sm transition',
                  valor.preset === p.id
                    ? 'bg-fono/20 font-medium text-fore ring-1 ring-fono/40'
                    : 'text-mute hover:bg-ink-700 hover:text-fore',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="border-t border-ink-600 pt-3">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-mute">
              Personalizado
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={valor.desde}
                max={fechaClaveParaguay()}
                onChange={(e) => setManual('desde', e.target.value)}
                className="h-9 w-full rounded-lg border border-ink-500 bg-paper px-2 text-sm text-fore outline-none focus:border-fono"
              />
              <span className="text-mute">–</span>
              <input
                type="date"
                value={valor.hasta}
                max={fechaClaveParaguay()}
                onChange={(e) => setManual('hasta', e.target.value)}
                className="h-9 w-full rounded-lg border border-ink-500 bg-paper px-2 text-sm text-fore outline-none focus:border-fono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
