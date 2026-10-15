import { Delete } from 'lucide-react'

// El valor vive en PinSegmentado: este teclado no guarda ni registra el PIN.
export default function PinTeclado({ onDigito, onBorrar, disabled, completo, vacio }) {
  const tecla = 'pin-tecla grid h-14 w-14 place-items-center rounded-full border border-ink-500 bg-ink text-2xl font-semibold text-fore transition-colors hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fono-dark disabled:opacity-40 motion-safe:active:scale-95'
  return (
    <div role="group" aria-label="Teclado numérico del PIN" className="mx-auto mt-3 grid w-fit grid-cols-3 gap-x-5 gap-y-2" data-testid="pin-teclado">
      {'123456789'.split('').map(digito => <button key={digito} type="button" className={tecla} disabled={disabled || completo} onClick={() => onDigito(digito)} aria-label={`Dígito ${digito}`}>{digito}</button>)}
      <span aria-hidden="true" />
      <button type="button" className={tecla} disabled={disabled || completo} onClick={() => onDigito('0')} aria-label="Dígito 0">0</button>
      <button type="button" className={tecla} disabled={disabled || vacio} onClick={onBorrar} aria-label="Borrar último dígito"><Delete size={24} aria-hidden="true" /></button>
    </div>
  )
}
