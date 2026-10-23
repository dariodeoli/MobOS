import { ProductCondition } from '@prisma/client'
import { prisma } from './prisma'
import { numero, numeroOpcional } from './montos'
import { capacidadValida, modeloApple, normalizarCapacidad, normalizarClaveModelo } from './catalogo-apple.mjs'

/** Equipo que entrega el cliente en una cotización: el valor es estimado, no un pago. */
export type CotizacionTradeIn = {
  model: string
  storage: string
  condition: ProductCondition
  estimatedValuePyg: number
  maxValuePyg: number | null
}

export class TradeInCotizacionError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}

/**
 * Valida el equipo contra el catálogo y toma su valor de la tabla de valores de
 * toma de la empresa (el servidor no confía en el monto que mande el cliente).
 * Devuelve null si no se pidió equipo.
 */
export async function normalizarTradeInCotizacion(crudo: unknown, tenantId: string): Promise<CotizacionTradeIn | null> {
  if (crudo === undefined || crudo === null) return null
  if (typeof crudo !== 'object' || Array.isArray(crudo)) throw new TradeInCotizacionError('El equipo que entrega el cliente es inválido.')
  const dato = crudo as Record<string, unknown>
  const model = typeof dato.model === 'string' ? dato.model.trim().replace(/\s+/g, ' ') : ''
  if (!model || model.length > 150) throw new TradeInCotizacionError('Indicá el modelo del equipo que entrega el cliente.')
  const catalogo = modeloApple(model)
  const storageCrudo = typeof dato.storage === 'string' ? dato.storage.trim().replace(/\s+/g, ' ') : ''
  const storage = catalogo ? normalizarCapacidad(storageCrudo) : storageCrudo
  if (!capacidadValida(model, storage)) throw new TradeInCotizacionError(`${catalogo?.nombre ?? model} no viene en ${storageCrudo || 'esa capacidad'}.`)
  const condition = typeof dato.condition === 'string' && (Object.values(ProductCondition) as string[]).includes(dato.condition) ? dato.condition as ProductCondition : null
  if (!condition) throw new TradeInCotizacionError('La condición del equipo debe ser NEW, USED o REFURBISHED.')
  const modelKey = normalizarClaveModelo(catalogo?.nombre ?? model)
  const valor = await prisma.deviceValuation.findFirst({ where: { tenantId, modelKey, storage, condition, isActive: true } })
  if (!valor) throw new TradeInCotizacionError('No hay un valor de toma cargado para ese modelo, capacidad y condición.', 409)
  return {
    model: valor.model, storage, condition,
    estimatedValuePyg: numero(valor.baseValuePyg),
    maxValuePyg: numeroOpcional(valor.maxValuePyg),
  }
}

/** Lo que falta pagar: el total de la cotización menos el valor estimado del equipo (nunca negativo). */
export const faltanteCotizacion = (totalPyg: number, tradeIn: Pick<CotizacionTradeIn, 'estimatedValuePyg'> | null) =>
  Math.max(0, numero(totalPyg) - (tradeIn?.estimatedValuePyg ?? 0))

export const AVISO_VALOR_ESTIMADO = 'Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas).'

/** Vista pública (portal del cliente): sin ids ni datos internos, con el aviso fijo. */
export function tradeInPublico(valor: unknown, totalPyg: number) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const dato = valor as Record<string, unknown>
  const model = typeof dato.model === 'string' ? dato.model.trim() : ''
  if (!model) return null
  const estimatedValuePyg = Math.max(0, Math.round(Number(dato.estimatedValuePyg) || 0))
  return {
    model,
    storage: typeof dato.storage === 'string' ? dato.storage : '',
    condition: typeof dato.condition === 'string' ? dato.condition : '',
    estimatedValuePyg,
    faltantePyg: faltanteCotizacion(totalPyg, { estimatedValuePyg }),
    aviso: AVISO_VALOR_ESTIMADO,
  }
}
