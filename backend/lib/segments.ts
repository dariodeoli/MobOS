// Segmentación de clientes para campañas de recompra. Los predicados son
// puros y se prueban con bordes: sin compras, justo en el límite y fecha
// inválida. El endpoint aporta los agregados (última compra, cantidad,
// categorías) y acá se decide si la ficha entra en el segmento.

import { DIA_MS } from './collections'
import { normalizarCategoria } from './pricing'

export type SegmentoKey = 'INACTIVE' | 'NO_PURCHASES' | 'FREQUENT' | 'CATEGORY'

export const SEGMENTOS: Array<{ key: SegmentoKey; nombre: string; descripcion: string }> = [
  { key: 'INACTIVE', nombre: 'Inactivos', descripcion: 'Clientes con al menos una compra y cuya última compra fue hace N días o más.' },
  { key: 'NO_PURCHASES', nombre: 'Nunca compraron', descripcion: 'Fichas cargadas sin ningún pedido registrado.' },
  { key: 'FREQUENT', nombre: 'Recurrentes', descripcion: 'Clientes con al menos N compras registradas.' },
  { key: 'CATEGORY', nombre: 'Compraron una categoría', descripcion: 'Clientes que alguna vez compraron un producto de la categoría indicada.' },
]

export const DIAS_INACTIVIDAD_DEFAULT = 180
export const COMPRAS_RECURRENTE_DEFAULT = 3
export const MAX_DIAS_INACTIVIDAD = 3650
export const MAX_COMPRAS_FILTRO = 1000
// Ventana de enfriamiento: una ficha contactada antes queda fuera del envío
// hasta que pase este plazo (0 = sin restricción).
export const COOLDOWN_MARKETING_DEFAULT = 30
export const MAX_COOLDOWN_DIAS = 3650

export type ClienteParaSegmento = {
  id: string
  name: string
  phone: string | null
  countryCode: string | null
  email: string | null
  pricingTier: string
  acceptsWhatsappMarketing: boolean
  marketingContactedAt: Date | null
  lastOrderAt: Date | null
  orderCount: number
  totalSpentPyg: number
  outstandingPyg: number
  categories: string[]
}

export type OpcionesSegmento = {
  days: number
  minOrders: number
  category: string | null
  cooldownDays: number
}

export function opcionesSegmento(input: { days?: unknown; minOrders?: unknown; category?: unknown; cooldownDays?: unknown } = {}): OpcionesSegmento {
  const entero = (value: unknown, fallback: number, max: number) => {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback
    return Math.min(parsed, max)
  }
  const category = typeof input.category === 'string' && input.category.trim() ? input.category.trim().slice(0, 120) : null
  return {
    days: entero(input.days, DIAS_INACTIVIDAD_DEFAULT, MAX_DIAS_INACTIVIDAD),
    minOrders: Math.max(1, entero(input.minOrders, COMPRAS_RECURRENTE_DEFAULT, MAX_COMPRAS_FILTRO)),
    category,
    cooldownDays: entero(input.cooldownDays, COOLDOWN_MARKETING_DEFAULT, MAX_COOLDOWN_DIAS),
  }
}

// Días completos desde una fecha. Fecha ausente o inválida => null: la ficha
// no puede probar inactividad y queda fuera (nunca rompe el listado).
export function diasDesde(value: Date | string | null | undefined, now: Date): number | null {
  if (!value) return null
  const fecha = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(fecha.getTime())) return null
  return Math.floor((now.getTime() - fecha.getTime()) / DIA_MS)
}

// ¿La ficha entra en el segmento? El borde es inclusivo: exactamente N días
// de última compra ya cuenta como inactivo; N compras ya cuenta como recurrente.
export function clasificarCliente(row: ClienteParaSegmento, segmento: SegmentoKey, opciones: OpcionesSegmento, now: Date): boolean {
  const orderCount = Math.max(0, Math.floor(Number(row.orderCount) || 0))
  if (segmento === 'NO_PURCHASES') return orderCount === 0
  if (segmento === 'FREQUENT') return orderCount >= opciones.minOrders
  if (segmento === 'INACTIVE') {
    if (orderCount < 1) return false
    const dias = diasDesde(row.lastOrderAt, now)
    return dias !== null && dias >= opciones.days
  }
  if (segmento === 'CATEGORY') {
    if (!opciones.category || orderCount < 1) return false
    const buscada = normalizarCategoria(opciones.category)
    return row.categories.some((category) => normalizarCategoria(category) === buscada)
  }
  return false
}

// Enfriamiento: la ficha fue contactada hace menos de `cooldownDays`.
export function contactoReciente(row: { marketingContactedAt: Date | null }, now: Date, cooldownDays: number): boolean {
  if (cooldownDays <= 0) return false
  const dias = diasDesde(row.marketingContactedAt, now)
  return dias !== null && dias < cooldownDays
}

export type MotivoExclusion = 'sin_telefono' | 'sin_opt_in' | 'contactado_reciente'

// Elegible para una campaña de WhatsApp: teléfono, opt-in explícito y fuera de
// la ventana de enfriamiento. El motivo se devuelve para poder informarlo.
export function motivoNoElegible(row: ClienteParaSegmento, now: Date, cooldownDays: number): MotivoExclusion | null {
  if (!row.phone || !String(row.phone).trim()) return 'sin_telefono'
  if (!row.acceptsWhatsappMarketing) return 'sin_opt_in'
  if (contactoReciente(row, now, cooldownDays)) return 'contactado_reciente'
  return null
}
