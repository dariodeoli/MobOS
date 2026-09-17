import { Select } from '@/components/ui'

// Monedas soportadas por el sistema, con etiqueta corta para el selector.
const MONEDAS = [
  ['PYG', 'PYG · Gs'],
  ['USD', 'USD · Dólares'],
  ['BRL', 'BRL · Reales'],
  ['EUR', 'EUR · Euros'],
  ['USDT', 'USDT · Tether'],
]

export default function CurrencySelect({ value, onChange, className, ...props }) {
  return (
    <Select value={value} onChange={onChange} className={className} {...props}>
      {MONEDAS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </Select>
  )
}
