type Field = { type: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: readonly unknown[] }
type ToolSchema = { type: 'object'; additionalProperties: false; required?: string[]; properties: Record<string, Field> }
const id: Field = { type: 'string', minLength: 1, maxLength: 100 }
const page = { cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50 } }
const query: Field = { type: 'string', maxLength: 120 }

/** The same closed schema drives discovery and request validation. */
export function toolInputSchema(action: string): ToolSchema {
  const reads: Record<string, Record<string, Field>> = {
    'company.read': {},
    'products.read': { branchId: id, q: query, ...page },
    'customers.read': { q: query, ...page },
    'sales.read': { branchId: id, ...page },
    'price_lists.read': { listId: id, q: query, ...page },
    'reports.read': { branchId: id, from: { type: 'string' }, to: { type: 'string' }, groupBy: query, tzOffset: { type: 'integer', minimum: -840, maximum: 840 }, paymentsBy: query },
  }
  if (Object.hasOwn(reads, action)) return { type: 'object', additionalProperties: false, properties: reads[action] }
  return action === 'company.create' ? { type: 'object', additionalProperties: false, required: ['companyName'], properties: { companyName: { type: 'string', minLength: 2, maxLength: 100 } } } : action === 'products.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, operation: { type: 'string', enum: ['create', 'update'] }, previewId: { type: 'string' }, productId: { type: 'string' }, branchId: { type: 'string' }, name: { type: 'string', maxLength: 160 }, sku: { type: 'string', maxLength: 80 }, category: { type: 'string', maxLength: 120 }, model: { type: 'string', maxLength: 80 }, color: { type: 'string', maxLength: 60 }, capacity: { type: 'string', maxLength: 20 }, pricePyg: { type: 'integer', minimum: 0 }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : action === 'price_lists.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'operation', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, operation: { type: 'string', enum: ['create', 'update'] }, previewId: { type: 'string' }, priceListId: { type: 'string' }, name: { type: 'string', maxLength: 120 }, isActive: { type: 'boolean' }, replaceItems: { type: 'boolean' }, items: { type: 'array' }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : action === 'prices.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, productId: { type: 'string' }, pricePyg: { type: 'integer', minimum: 0 }, expectedPricePyg: { type: 'integer', minimum: 0 }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : action === 'product_images.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'productId', 'dataBase64', 'contentType', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, productId: { type: 'string' }, branchId: { type: 'string' }, variantKey: { type: 'string', maxLength: 100 }, dataBase64: { type: 'string', minLength: 16, maxLength: 7000000 }, contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 } } } : action === 'customers.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, operation: { type: 'string', enum: ['create', 'update'] }, customerId: { type: 'string' }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 }, name: { type: 'string', maxLength: 180 }, firstName: { type: 'string', maxLength: 120 }, secondName: { type: 'string', maxLength: 120 }, document: { type: 'string', maxLength: 100 }, phone: { type: 'string', maxLength: 100 }, email: { type: 'string', maxLength: 200 }, addresses: { type: 'array' } } } : action === 'company.write' ? { type: 'object', additionalProperties: false, required: ['mode', 'idempotencyKey'], properties: { mode: { type: 'string', enum: ['preview', 'commit'] }, previewId: { type: 'string' }, idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 }, name: { type: 'string', maxLength: 120 }, email: { type: 'string', maxLength: 160 }, address: { type: 'string', maxLength: 400 }, city: { type: 'string', maxLength: 120 }, department: { type: 'string', maxLength: 120 }, phone: { type: 'string', maxLength: 40 }, ruc: { type: 'string', maxLength: 20 } } } : action === 'sales.read' ? { type: 'object', additionalProperties: false, properties: { branchId: { type: 'string' }, cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } } : { type: 'object', additionalProperties: false, properties: { branchId: { type: 'string' }, q: { type: 'string', maxLength: 120 }, listId: { type: 'string', maxLength: 120 }, cursor: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 50 }, from: { type: 'string' }, to: { type: 'string' }, groupBy: { type: 'string' }, tzOffset: { type: 'integer' }, paymentsBy: { type: 'string' } } }
}

export function invalidToolArguments(action: string, args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'arguments debe ser un objeto.'
  const value = args as Record<string, unknown>
  const schema = toolInputSchema(action)
  for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) return `Argumento requerido: ${key}.`
  for (const [key, fieldValue] of Object.entries(value)) {
    const field = schema.properties[key]
    if (!field) return `Argumento no permitido: ${key}.`
    if (field.type === 'integer' ? !Number.isSafeInteger(fieldValue) : field.type === 'array' ? !Array.isArray(fieldValue) : typeof fieldValue !== field.type) return `${key} inválido.`
    if (typeof fieldValue === 'string' && ((field.minLength !== undefined && fieldValue.length < field.minLength) || (field.maxLength !== undefined && fieldValue.length > field.maxLength))) return `${key} inválido.`
    if (typeof fieldValue === 'number' && ((field.minimum !== undefined && fieldValue < field.minimum) || (field.maximum !== undefined && fieldValue > field.maximum))) return `${key} inválido.`
    if (field.enum && !field.enum.includes(fieldValue)) return `${key} inválido.`
  }
  for (const key of ['from', 'to']) if (value[key] !== undefined) {
    const date = value[key] as string
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return `${key} inválido.`
  }
  if (value.cursor !== undefined && !decodeToolCursor(action, value.cursor)) return 'Cursor inválido.'
  return null
}

export function decodeToolCursor(action: string, value: unknown): Record<string, string> | null {
  if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null
    const keys = action === 'price_lists.read' ? ['id'] : action === 'sales.read' ? ['createdAt', 'id'] : ['name', 'id']
    if (Object.keys(cursor).length !== keys.length || keys.some(key => typeof cursor[key] !== 'string')) return null
    if (!cursor.id || cursor.id.length > 100 || keys.some(key => cursor[key].length > 180)) return null
    if (action === 'sales.read' && (Number.isNaN(Date.parse(cursor.createdAt)) || new Date(cursor.createdAt).toISOString() !== cursor.createdAt)) return null
    return Object.fromEntries(keys.map(key => [key, cursor[key]]))
  } catch { return null }
}
