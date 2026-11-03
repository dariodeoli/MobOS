import { Input, Select } from '@/components/ui'
import { capacidadesDeModelo, coloresDeModelo } from '../../../backend/lib/catalogo-apple.mjs'

// Capacidad o color que dependen del modelo elegido en `ModeloCatalogoField`:
// con un modelo del catálogo Apple es un `Select` con sus opciones reales (más
// las que ya tenga la tienda cargadas, `extras`, y el valor actual si quedó
// fuera); con un modelo escrito a mano vuelve a texto libre. Un solo lugar
// para la regla «la capacidad y el color salen del modelo».
export default function CampoVarianteCatalogo({
  id,
  campo = 'capacidad',
  modelo = '',
  value = '',
  onChange,
  extras = [],
  vacio,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
  list,
  maxLength,
}) {
  const catalogo = campo === 'color' ? coloresDeModelo(modelo) : capacidadesDeModelo(modelo)
  const porClave = new Map()
  for (const opcion of [...catalogo, ...extras, value].map((valor) => String(valor || '').trim()).filter(Boolean)) {
    if (!porClave.has(opcion.toLowerCase())) porClave.set(opcion.toLowerCase(), opcion)
  }
  if (catalogo.length) {
    return (
      <Select id={id} aria-label={ariaLabel} className={className} disabled={disabled} value={value} onChange={(event) => onChange?.(event.target.value)}>
        <option value="">{vacio || (campo === 'color' ? 'Elegí el color' : 'Elegí la capacidad')}</option>
        {[...porClave.values()].map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
      </Select>
    )
  }
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      className={className}
      list={list}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength || (campo === 'color' ? 60 : 20)}
      autoCapitalize={campo === 'color' ? 'words' : 'characters'}
    />
  )
}
