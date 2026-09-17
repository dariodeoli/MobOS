import { Input } from '@/components/ui'

// IMEI/serial de UNA unidad: alfanumérico en mayúsculas, sin prefijo MOBOS:,
// sin espacios ni guiones. Para pegar VARIOS seriales no usar este campo: los
// flujos que aceptan listas normalizan con normalizeScan al enviar (Inventario
// recibe/traslada, ListaVentasDia).
export function normalizarSerial(value = '') {
  return String(value)
    .trim()
    .replace(/^MOBOS:/i, '')
    .replace(/[\s-]+/g, '')
    .toUpperCase()
}

export default function SerialField({
  value = '',
  onChange,
  disabled = false,
  placeholder = 'IMEI o serial',
  ...props
}) {
  return (
    <Input
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      maxLength={32}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
      value={normalizarSerial(value)}
      onChange={(event) => onChange?.(normalizarSerial(event.target.value))}
    />
  )
}
