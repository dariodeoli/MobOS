import { createHash } from 'node:crypto'
import { parsePriceListItems, validarReemplazoExplicito, PriceListInputError } from '../price-lists'

export type ChangeAction = 'products.write' | 'prices.write' | 'price_lists.write' | 'customers.write' | 'company.write' | 'product_images.write'
const ACTIONS = new Set<ChangeAction>(['products.write', 'prices.write', 'price_lists.write', 'customers.write', 'company.write', 'product_images.write'])

function bounded(value: unknown, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max }
function integer(value: unknown, min = 0) { return typeof value === 'number' && Number.isInteger(value) && value >= min }

export function validateChange(action: unknown, payload: unknown): { ok: true; action: ChangeAction; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof action !== 'string' || !ACTIONS.has(action as ChangeAction)) return { ok: false, error: 'accion_no_disponible' }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'payload_invalido' }
  const value = payload as Record<string, unknown>
  if (action === 'products.write') {
    const operation = value.operation === undefined ? 'create' : value.operation
    if (operation !== 'create' && operation !== 'update') return { ok: false, error: 'operacion_producto_invalida' }
    if (operation === 'create' && (!bounded(value.name, 160) || !bounded(value.sku, 80))) return { ok: false, error: 'producto_nombre_sku_requeridos' }
    if (operation === 'update' && !bounded(value.productId, 128)) return { ok: false, error: 'producto_id_requerido' }
    if (value.name !== undefined && !bounded(value.name, 160)) return { ok: false, error: 'producto_nombre_invalido' }
    if (value.sku !== undefined && !bounded(value.sku, 80)) return { ok: false, error: 'producto_sku_invalido' }
    if (value.pricePyg !== undefined && !integer(value.pricePyg)) return { ok: false, error: 'precio_invalido' }
    if (value.stock !== undefined) return { ok: false, error: 'stock_no_permitido' }
    if (value.branchId !== undefined && (!bounded(value.branchId, 100))) return { ok: false, error: 'sucursal_invalida' }
  } else if (action === 'prices.write') {
    if (!bounded(value.productId, 100) || !integer(value.pricePyg) || !integer(value.expectedPricePyg)) return { ok: false, error: 'producto_precio_esperado_requeridos' }
  } else if (action === 'price_lists.write') {
    const operation = value.operation === undefined ? 'create' : value.operation
    if (operation !== 'create' && operation !== 'update') return { ok: false, error: 'operacion_lista_invalida' }
    if (operation === 'update' && !bounded(value.priceListId, 128)) return { ok: false, error: 'lista_id_requerido' }
    if (operation === 'create' && !bounded(value.name, 120)) return { ok: false, error: 'lista_nombre_requerido' }
    if (value.name !== undefined && !bounded(value.name, 120)) return { ok: false, error: 'lista_nombre_invalido' }
    try { validarReemplazoExplicito(value); parsePriceListItems(value.items) } catch (error) { return { ok: false, error: error instanceof PriceListInputError ? error.message : 'lista_items_invalidos' } }
  } else if (action === 'customers.write') {
    const operation = value.operation === undefined ? 'create' : value.operation
    if (operation !== 'create' && operation !== 'update') return { ok: false, error: 'operacion_cliente_invalida' }
    if (operation === 'update' && !bounded(value.customerId, 100)) return { ok: false, error: 'cliente_id_requerido' }
    if (operation === 'create' && !bounded(value.name, 180) && !bounded(value.firstName, 120)) return { ok: false, error: 'cliente_nombre_requerido' }
    for (const key of ['phone', 'email', 'document']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 180)) return { ok: false, error: 'dato_cliente_invalido' }
  } else if (action === 'product_images.write') {
    if (!bounded(value.productId, 100) || !bounded(value.contentType, 40) || !['image/jpeg', 'image/png', 'image/webp'].includes(String(value.contentType))) return { ok: false, error: 'imagen_invalida' }
    if (typeof value.dataBase64 !== 'string' || value.dataBase64.length < 16 || value.dataBase64.length > 7_000_000) return { ok: false, error: 'imagen_datos_invalidos' }
    // Dimensions are derived from the decoded image by product-images.ts;
    // accepting client-supplied dimensions here would make the MCP path
    // disagree with the multipart upload policy.
  } else if (action === 'company.write') {
    const fields = ['name', 'email', 'address', 'city', 'department', 'phone', 'ruc']
    if (!fields.some(field => Object.hasOwn(value, field))) return { ok: false, error: 'empresa_sin_cambios' }
    if (value.name !== undefined && !bounded(value.name, 180)) return { ok: false, error: 'empresa_nombre_invalido' }
    for (const field of fields.filter(field => field !== 'name')) if (value[field] !== undefined && value[field] !== null && (typeof value[field] !== 'string' || value[field].length > 500)) return { ok: false, error: 'empresa_campo_invalido' }
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
