import { createHash } from 'node:crypto'

export type ChangeAction = 'products.write' | 'prices.write' | 'customers.write' | 'company.write' | 'product_images.write'
const ACTIONS = new Set<ChangeAction>(['products.write', 'prices.write', 'customers.write', 'company.write', 'product_images.write'])

function bounded(value: unknown, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max }
function integer(value: unknown, min = 0) { return typeof value === 'number' && Number.isInteger(value) && value >= min }

export function validateChange(action: unknown, payload: unknown): { ok: true; action: ChangeAction; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof action !== 'string' || !ACTIONS.has(action as ChangeAction)) return { ok: false, error: 'accion_no_disponible' }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'payload_invalido' }
  const value = payload as Record<string, unknown>
  if (action === 'products.write') {
    if (!bounded(value.name, 160) || !bounded(value.sku, 80)) return { ok: false, error: 'producto_nombre_sku_requeridos' }
    if (value.pricePyg !== undefined && !integer(value.pricePyg)) return { ok: false, error: 'precio_invalido' }
    const stock = value.stock
    if (stock !== undefined && (!integer(stock) || (typeof stock === 'number' && stock > 100000000))) return { ok: false, error: 'stock_invalido' }
    if (value.branchId !== undefined && (!bounded(value.branchId, 100))) return { ok: false, error: 'sucursal_invalida' }
  } else if (action === 'prices.write') {
    if (!bounded(value.productId, 100) || !integer(value.pricePyg) || !integer(value.expectedPricePyg)) return { ok: false, error: 'producto_precio_esperado_requeridos' }
  } else if (action === 'customers.write') {
    if (!bounded(value.name, 180)) return { ok: false, error: 'cliente_nombre_requerido' }
    for (const key of ['phone', 'email', 'document']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 180)) return { ok: false, error: 'dato_cliente_invalido' }
  } else if (action === 'product_images.write') {
    if (!bounded(value.productId, 100) || !bounded(value.contentType, 40) || !['image/jpeg', 'image/png', 'image/webp'].includes(String(value.contentType))) return { ok: false, error: 'imagen_invalida' }
    if (typeof value.dataBase64 !== 'string' || value.dataBase64.length < 16 || value.dataBase64.length > 7_000_000) return { ok: false, error: 'imagen_datos_invalidos' }
    const width = value.width; const height = value.height
    if (!integer(width, 1) || !integer(height, 1) || (typeof width === 'number' && width > 12000) || (typeof height === 'number' && height > 12000)) return { ok: false, error: 'dimensiones_invalidas' }
  } else if (action === 'company.write') {
    if (value.name !== undefined && !bounded(value.name, 180)) return { ok: false, error: 'empresa_nombre_invalido' }
    if (value.email !== undefined && (typeof value.email !== 'string' || value.email.length > 180)) return { ok: false, error: 'empresa_email_invalido' }
    if (value.name === undefined && value.email === undefined) return { ok: false, error: 'empresa_sin_cambios' }
  }
  return { ok: true, action: action as ChangeAction, payload: value }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as object).sort().map(key => [key, stable((value as Record<string, unknown>)[key])]))
  return value
}
export function changePayloadHash(action: string, payload: unknown) {
  return createHash('sha256').update(JSON.stringify(stable({ action, payload }))).digest('hex')
}
