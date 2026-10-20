import type { Prisma, Product } from '@prisma/client'
import { hasPermission, type AuthUser } from './auth'
import { classifyStockKind } from './stock-kind'
import { parseAccessoryCategory, parseCompatibleModels } from './product-accessories'
import { skuUnico } from './sku'
import { LIMITE_MONTO_GENERAL } from './montos'

type Db = PrismaClientLike | Prisma.TransactionClient
type PrismaClientLike = Prisma.TransactionClient | {
  product: any
  branch: any
  auditLog: any
  $transaction: any
}

export type ProductServiceActor = Pick<AuthUser, 'id' | 'tenantId' | 'role' | 'permissions' | 'branchId'>

export type ProductServiceInput = {
  name?: unknown
  sku?: unknown
  category?: unknown
  model?: unknown
  color?: unknown
  capacity?: unknown
  compatibleModels?: unknown
  accessoryCategory?: unknown
  pricePyg?: unknown
  price?: unknown
}

export class ProductServiceError extends Error {
  constructor(public readonly code: 'forbidden' | 'invalid' | 'conflict' | 'not_found', message: string) {
    super(message)
  }
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''

function assertActor(actor: ProductServiceActor) {
  if (!actor.tenantId || !actor.id || !hasPermission(actor, 'products:manage')) {
    throw new ProductServiceError('forbidden', 'El usuario no puede gestionar productos.')
  }
}

function integer(value: unknown, label: string) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0 || result > LIMITE_MONTO_GENERAL) throw new ProductServiceError('invalid', `${label} debe ser un entero válido.`)
  return result
}

async function branchFor(db: Db, actor: ProductServiceActor, requested: unknown) {
  const branchId = typeof requested === 'string' && requested.trim() ? requested.trim() : actor.branchId ?? null
  if (actor.branchId && branchId !== actor.branchId) throw new ProductServiceError('forbidden', 'No autorizado para esa sucursal.')
  if (!branchId) throw new ProductServiceError('invalid', 'La sucursal es obligatoria para crear un producto.')
  const branch = await db.branch.findFirst({ where: { id: branchId, tenantId: actor.tenantId, isActive: true }, select: { id: true } })
  if (!branch) throw new ProductServiceError('not_found', 'Sucursal no encontrada.')
  return branch.id
}

function scalarFields(input: ProductServiceInput, partial: boolean) {
  const name = text(input.name, 200)
  const sku = text(input.sku, 60)
  if (!partial && (!name || !sku)) throw new ProductServiceError('invalid', 'SKU y nombre son obligatorios.')
  const data: Record<string, unknown> = {
    ...(name ? { name } : {}),
    ...(sku ? { sku } : {}),
    ...(input.category !== undefined ? { category: text(input.category, 120) || null } : {}),
    ...(input.model !== undefined ? { model: text(input.model, 80) || null } : {}),
    ...(input.color !== undefined ? { color: text(input.color, 60) || null } : {}),
    ...(input.capacity !== undefined ? { capacity: text(input.capacity, 20) || null } : {}),
  }
  if (!partial && !Object.keys(data).length) throw new ProductServiceError('invalid', 'Datos de producto obligatorios.')
  return data
}

function safeOptional(input: ProductServiceInput) {
  const data: Record<string, unknown> = {}
  if (input.pricePyg !== undefined || input.price !== undefined) data.pricePyg = integer(input.pricePyg ?? input.price, 'El precio')
  if (input.accessoryCategory !== undefined) {
    try { data.accessoryCategory = parseAccessoryCategory(input.accessoryCategory) } catch (cause) { throw new ProductServiceError('invalid', cause instanceof Error ? cause.message : 'Categoría de accesorio inválida.') }
  }
  if (input.compatibleModels !== undefined) {
    try { data.compatibleModels = parseCompatibleModels(input.compatibleModels) } catch (cause) { throw new ProductServiceError('invalid', cause instanceof Error ? cause.message : 'Modelos compatibles inválidos.') }
  }
  return data
}

export async function createProduct(db: Db, actor: ProductServiceActor, input: ProductServiceInput & { branchId?: unknown }) {
  assertActor(actor)
  const branchId = await branchFor(db, actor, input.branchId)
  const data = { ...scalarFields(input, false), ...safeOptional(input) }
  const sku = await skuUnico(db as Prisma.TransactionClient, actor.tenantId, branchId, String(data.sku))
  const product = await db.product.create({ data: { tenantId: actor.tenantId, branchId, sku, name: data.name, category: data.category ?? null, model: data.model ?? null, color: data.color ?? null, capacity: data.capacity ?? null, stockKind: classifyStockKind({ category: data.category as string | null }), pricePyg: data.pricePyg ?? 0, stock: 0, isActive: true, ...(data.accessoryCategory !== undefined ? { accessoryCategory: data.accessoryCategory } : {}), ...(data.compatibleModels !== undefined ? { compatibleModels: data.compatibleModels } : {}) } })
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'PRODUCT_CREATED', entity: 'Product', entityId: product.id, metadata: { source: 'mcp', sku: product.sku, stock: 0 } } })
  return product as Product
}

export async function updateProduct(db: Db, actor: ProductServiceActor, id: string, input: ProductServiceInput & { branchId?: unknown }) {
  assertActor(actor)
  if (!id || id.length > 128) throw new ProductServiceError('invalid', 'Producto obligatorio.')
  const product = await db.product.findFirst({ where: { id, tenantId: actor.tenantId, isActive: true } })
  if (!product) throw new ProductServiceError('not_found', 'Producto no encontrado.')
  if (actor.branchId && product.branchId !== actor.branchId) throw new ProductServiceError('forbidden', 'No autorizado para esa sucursal.')
  if (input.branchId !== undefined && input.branchId !== product.branchId) throw new ProductServiceError('forbidden', 'No autorizado para esa sucursal.')
  const scalar = scalarFields(input, true)
  const optional = safeOptional(input)
  if (!Object.keys(scalar).length && !Object.keys(optional).length) throw new ProductServiceError('invalid', 'No enviaste cambios.')
  if (scalar.sku && scalar.sku !== product.sku) {
    const duplicate = await db.product.findFirst({ where: { tenantId: actor.tenantId, branchId: product.branchId, sku: scalar.sku, id: { not: id }, isActive: true }, select: { id: true } })
    if (duplicate) throw new ProductServiceError('conflict', 'Ya existe otro producto con ese SKU en la sucursal.')
  }
  const category = scalar.category !== undefined ? scalar.category : product.category
  const updated = await db.product.update({ where: { id }, data: { ...scalar, ...optional, ...(scalar.category !== undefined ? { stockKind: classifyStockKind({ category: category as string | null, hasUnits: product.imei !== null }) } : {}) } })
  await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: id, metadata: { source: 'mcp', fields: [...Object.keys(scalar), ...Object.keys(optional)] } } })
  return updated as Product
}
