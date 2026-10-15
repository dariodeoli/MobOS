import { InputError, objectInput, textInput } from './payment-input'
import { LIMITE_MONTO_VENTAS, numero } from './montos'

export type TariffTier = { upToKm: number; feePyg: number }
export function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new InputError('Campos no admitidos.')
}
export function dayInput(value: unknown, label = 'Fecha') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError(`${label} inválida.`)
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2020 || date.getUTCFullYear() > 2100) throw new InputError(`${label} inválida.`)
  return date
}
export const dayKey = (date: Date) => date.toISOString().slice(0, 10)
export function plusDays(date: Date, count: number) { return new Date(+date + count * 86400000) }
export function localDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(row => row.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function weekInput(value: unknown) {
  const start = dayInput(value, 'Inicio de semana')
  if (start.getUTCDay() !== 1) throw new InputError('La semana debe comenzar un lunes.')
  return start
}
export function weekOf(day: Date) { return plusDays(day, -((day.getUTCDay() + 6) % 7)) }
export function integerPyg(value: unknown, label = 'Monto', signed = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (!signed && value < 0) || Math.abs(value) > LIMITE_MONTO_VENTAS) throw new InputError(`${label}: ingresá guaraníes enteros dentro del rango permitido.`)
  return value
}
export function sumPyg(values: Array<bigint | number>) {
  const sum = values.reduce<number>((total, value) => total + numero(value), 0)
  if (!Number.isSafeInteger(sum)) throw new InputError('El total supera el rango seguro de guaraníes.')
  return sum
}
export function reasonInput(value: unknown) {
  const reason = textInput(value, 'Motivo', 500)
  if (reason.length < 3) throw new InputError('El motivo debe tener al menos 3 caracteres.')
  return reason
}
export function keyInput(value: unknown) { return textInput(value, 'Clave de operación', 100) }
export function parseTariff(input: unknown) {
  const body = objectInput(input); fields(body, ['name', 'validFrom', 'validUntil', 'tiers'])
  const name = textInput(body.name, 'Nombre de la tarifa', 100)
  const validFrom = dayInput(body.validFrom), validUntil = dayInput(body.validUntil)
  if (validUntil < validFrom) throw new InputError('La vigencia final debe ser igual o posterior al inicio.')
  if (!Array.isArray(body.tiers) || !body.tiers.length || body.tiers.length > 28) throw new InputError('Definí entre 1 y 28 tramos hasta 28 km.')
  let previous = 0
  const tiers: TariffTier[] = body.tiers.map(value => {
    const tier = objectInput(value); fields(tier, ['upToKm', 'feePyg'])
    if (typeof tier.upToKm !== 'number' || !Number.isInteger(tier.upToKm) || tier.upToKm <= previous || tier.upToKm > 28) throw new InputError('Los tramos deben estar ordenados, sin repetidos, entre 1 y 28 km.')
    previous = tier.upToKm
    return { upToKm: tier.upToKm, feePyg: integerPyg(tier.feePyg, 'Honorario') }
  })
  if (previous !== 28) throw new InputError('El último tramo debe cubrir hasta 28 km.')
  return { name, validFrom, validUntil, tiers }
}
export function quoteTrip(tiers: TariffTier[], distanceKm: unknown, count: unknown) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 28 || Math.abs(distanceKm * 1000 - Math.round(distanceKm * 1000)) > 0.000001) throw new InputError('La distancia debe ser mayor a 0 y hasta 28 km, con hasta 3 decimales.')
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 100) throw new InputError('La cantidad debe ser de 1 a 100 viajes.')
  const tier = tiers.find(tier => distanceKm <= tier.upToKm)
  if (!tier) throw new InputError('La tarifa no cubre la distancia indicada.', 409)
  const feePerTripPyg = integerPyg(tier.feePyg, 'Honorario')
  const totalFeePyg = sumPyg(Array.from({ length: count }, () => feePerTripPyg))
  return { distanceMeters: Math.round(distanceKm * 1000), tripsCount: count, feePerTripPyg, totalFeePyg }
}
export type CollectionRow = { id: string; amountPyg: bigint | number; status: string; deliverySettlementId?: string | null; method?: string; orderId?: string; collectedAt?: Date | null }
export function weeklyAmounts(feesPyg: bigint | number, payments: CollectionRow[], deltas: Array<bigint | number> = []) {
  // Un Payment se cuenta una vez, aunque el pedido tenga varios viajes.
  const unique = [...new Map(payments.map(row => [row.id, row])).values()]
  const valid = unique.filter(row => row.status === 'PENDING' || row.status === 'CONFIRMED')
  const collectedPyg = sumPyg(valid.map(row => row.amountPyg))
  const renderedPyg = sumPyg(valid.filter(row => row.status === 'CONFIRMED').map(row => row.amountPyg))
  const pendingPyg = sumPyg(valid.filter(row => row.status === 'PENDING').map(row => row.amountPyg))
  const adjustmentPyg = sumPyg(deltas)
  const balancePyg = sumPyg([feesPyg, -pendingPyg, adjustmentPyg])
  return { feesPyg: numero(feesPyg), collectedPyg, renderedPyg, pendingPyg, adjustmentPyg, balancePyg, payablePyg: Math.max(0, balancePyg), receivablePyg: Math.max(0, -balancePyg) }
}
