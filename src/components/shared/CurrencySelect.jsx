import { Select } from '@/components/ui'

// Monedas soportadas por el sistema, con etiqueta corta para el selector.
const MONEDAS = [
  ['PYG', 'PYG · Gs'],
  ['USD', 'USD · Dólares'],
  ['BRL', 'BRL · Reales'],
  ['EUR', 'EUR · Euros'],
  ['USDT', 'USDT · Tether'],
]

// `excluir` deja afuera monedas que no corresponden al medio (ej. la
// transferencia no mezcla USDT: tiene su propio medio, #142/#204).
export default function CurrencySelect({ value, onChange, className, excluir = [], ...props }) {
  const monedas = MONEDAS.filter(([code]) => !excluir.includes(code))
  return (
    <Select value={value} onChange={onChange} className={className} {...props}>
      {monedas.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </Select>
  )
}
