import { InputError } from '../../../lib/payment-input'

// Seguro del cliente (#160): porcentaje 0–100 con hasta 2 decimales. Devuelve
// undefined si no vino, null si vino vacío y 'invalido' si no es válido (para
// que la ruta responda el error).
export function leerPorcentajeSeguro(value: unknown): number | null | undefined | 'invalido' {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const rate = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.round(rate * 100) !== rate * 100) return 'invalido'
  return rate
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Direcciones del cliente: hasta 10, con etiqueta, ciudad, departamento y país.
// La primera (o la marcada) queda como predeterminada. Compartido por el alta
// (POST /api/customers) y la edición de la ficha (PATCH /api/customers/[id]).
export function addressesInput(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 10) throw new InputError('Podés guardar hasta 10 direcciones.')
  const addresses = value.map((row, index) => {
    const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    const address = clean(item.address, 400)
    if (!address) throw new InputError('Cada dirección debe incluir su detalle.')
    return {
      label: clean(item.label, 80) || `Dirección ${index + 1}`,
      address,
      city: clean(item.city, 100) || null,
      department: clean(item.department, 100) || null,
      country: clean(item.country, 100) || 'Paraguay',
      notes: clean(item.notes, 400) || null,
      isDefault: item.isDefault === true,
    }
  })
  return addresses.map((address, index) => ({ ...address, isDefault: address.isDefault || (index === 0 && !addresses.some((item) => item.isDefault)) }))
}
