import { Delete } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0']

export default function NumericKeypad({ value = '', onChange, max }) {
  function append(key) {
    const next = `${value || ''}${key}`.replace(/^0+(?=\d)/, '')
    onChange(max ? next.slice(0, max) : next)
  }
  return <div className="mt-2 grid max-w-[19rem] grid-cols-3 gap-2" aria-label="Teclado numérico de cobro">
    {KEYS.map((key) => <button key={key} type="button" onClick={() => append(key)} className="min-h-11 rounded-xl border border-fore/10 bg-fore/[.04] text-lg font-semibold text-fore transition hover:border-fono/60 hover:bg-fono/10 active:scale-[.97]" aria-label={`Agregar ${key}`}>{key}</button>)}
    <button type="button" onClick={() => onChange((value || '').slice(0, -1))} className="min-h-11 rounded-xl border border-fore/10 bg-fore/[.04] text-mute transition hover:border-fono/60 hover:bg-fono/10 active:scale-[.97]" aria-label="Borrar último dígito"><Delete className="mx-auto h-5 w-5" aria-hidden="true" /></button>
  </div>
}
