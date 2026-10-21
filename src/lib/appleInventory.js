import { isAppleDeviceProduct } from '../../backend/lib/apple-device.mjs'

// Contrato de catálogo para inventario Apple (#583).
//
// Apple se identifica por variante (modelo, capacidad, color y condición) y
// sus unidades serializadas mantienen el IMEI por separado. Los accesorios y
// demás productos siguen el stock genérico por cantidad/SKU. Este módulo es
// deliberadamente puro: no crea stock ni asume disponibilidad cuando la API no
// la envía.

const CAPACITY = /\b(\d+(?:\.\d+)?\s*(?:TB|GB|MB))\b/i

export const INVENTORY_CATALOG_MODE = Object.freeze({ APPLE: 'apple', GENERIC: 'generic' })

export function normalizarTexto(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export const esProductoApple = isAppleDeviceProduct

function extraerCapacidad(texto) {
  return normalizarTexto(texto).match(CAPACITY)?.[1]?.replace(/\s+/g, '').toUpperCase() || ''
}

function separarNombre(product = {}) {
  const name = normalizarTexto(product.name || product.nombre || '')
  const model = normalizarTexto(product.model || product.atributos?.modelo || '')
  const capacity = normalizarTexto(product.capacity || product.atributos?.capacidad || '') || extraerCapacidad(name)
  const color = normalizarTexto(product.color || product.atributos?.color || '')
  return { name, model, capacity, color }
}

/** Devuelve la variante canónica sin inventar campos ausentes. */
export function varianteApple(product = {}) {
  const { name, model, capacity, color } = separarNombre(product)
  const base = model || name
  const key = [base, capacity, color, product.condition || product.atributos?.estado || ''].map(normalizarTexto).filter(Boolean).join(' · ')
  return { model: base, capacity, color, condition: product.condition || product.atributos?.estado || '', key }
}

export function modoCatalogo(product = {}) {
  return esProductoApple(product) ? INVENTORY_CATALOG_MODE.APPLE : INVENTORY_CATALOG_MODE.GENERIC
}

/**
 * Cantidad disponible explícita. Para unidades serializadas se cuenta sólo
 * AVAILABLE; para productos genéricos se usa `stock`. Si no hay dato, null
 * significa «sin disponibilidad informada», nunca cero inventado.
 */
export function disponibilidadCatalogo(product = {}, units = []) {
  if (Array.isArray(units) && units.length) {
    return units.filter((unit) => unit?.productId === product?.id && unit?.status === 'AVAILABLE' && !unit?.removedAt).length
  }
  if (Number.isFinite(Number(product.stock))) return Math.max(0, Number(product.stock))
  return null
}

export function filaCatalogoInventario(product = {}, units = []) {
  const apple = modoCatalogo(product) === INVENTORY_CATALOG_MODE.APPLE
  const variant = apple ? varianteApple(product) : { model: normalizarTexto(product.model || product.name || product.nombre), capacity: normalizarTexto(product.capacity), color: normalizarTexto(product.color), condition: normalizarTexto(product.condition), key: normalizarTexto(product.sku || product.id) }
  return {
    id: product.id || product.sku || variant.key,
    sku: normalizarTexto(product.sku),
    mode: apple ? INVENTORY_CATALOG_MODE.APPLE : INVENTORY_CATALOG_MODE.GENERIC,
    name: normalizarTexto(product.name || product.nombre || variant.model),
    variant,
    imeiRequired: apple || Boolean(product.imei),
    availability: disponibilidadCatalogo(product, units),
  }
}

export function agruparCatalogoInventario(products = [], units = []) {
  const rows = (Array.isArray(products) ? products : []).map((product) => filaCatalogoInventario(product, units))
  return rows.reduce((groups, row) => {
    const key = `${row.mode}:${row.variant.key || row.sku || row.id}`
    const prior = groups.get(key)
    if (prior) prior.availability = (prior.availability ?? 0) + (row.availability ?? 0)
    else groups.set(key, { ...row })
    return groups
  }, new Map())
}

