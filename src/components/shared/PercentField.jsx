import { Input } from '@/components/ui'

// Porcentaje 0–100 con coma decimal y hasta 2 decimales (0,2 / 12,5). El valor
// viaja como string formateado con coma; '' representa el campo vacío. Los
// formularios convierten a número con parsePercent antes de guardar.

export function parsePercent(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.')
  if (texto === '' || texto === '.') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export function formatPercent(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  const numero = Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(numero)) return ''
  return String(Math.round(numero * 100) / 100).replace('.', ',')
}

// Limpieza al escribir: solo dígitos y comas, un único separador decimal (los
// puntos se convierten en comas), hasta 2 decimales y 6 caracteres.
export function limpiarPercent(valor, max = 100) {
  const texto = String(valor ?? '').replace(/\./g, ',').replace(/[^\d,]/g, '')
  const [entera = '', ...resto] = texto.split(',')
  const digitos = entera.slice(0, String(max).length)
  if (!resto.length) return digitos.slice(0, 6)
  return `${digitos},${resto.join('').slice(0, 2)}`.slice(0, 6)
}

export default function PercentField({
  value = '',
  onChange,
  disabled = false,
  placeholder = '0',
  max = 100,
  className,
  id,
  ...props
}) {
  return (
    <Input
      id={id}
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={6}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
      value={limpiarPercent(value, max)}
      onChange={(event) => onChange?.(limpiarPercent(event.target.value, max))}
    />
  )
}
