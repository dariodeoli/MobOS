import { Delete } from 'lucide-react'
import { TECLA_BORRAR } from './pinPadReglas'

// Teclas del PinPad. El valor vive en PinSegmentado: este teclado no guarda ni
// registra el PIN. Tamaño: variable `--pin-tecla` (la define `.pin-pad`, ver
// src/index.css); sin ella conserva 56 px (h-14).
export default function PinTeclado({ onTecla, disabled, completo, vacio }) {
  const tecla = 'pin-tecla grid h-14 w-14 place-items-center rounded-full border border-ink-500 bg-ink text-2xl font-semibold text-fore transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-40 motion-safe:active:scale-95'
  const digito = (d) => <button key={d} type="button" className={tecla} disabled={disabled || completo} onClick={() => onTecla(d)} aria-label={`Dígito ${d}`}>{d}</button>
  return (
    <div role="group" aria-label="Teclado numérico del PIN" className="mx-auto mt-3 grid w-fit grid-cols-3 gap-x-5 gap-y-2" data-testid="pin-teclado">
      {'123456789'.split('').map(digito)}
      <span aria-hidden="true" />
      {digito('0')}
      <button type="button" className={tecla} disabled={disabled || vacio} onClick={() => onTecla(TECLA_BORRAR)} aria-label="Borrar último dígito"><Delete size={24} aria-hidden="true" /></button>
    </div>
  )
}
