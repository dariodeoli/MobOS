import { prisma } from '../../../lib/prisma'
import { PaymentCurrency, ProductCondition } from '@prisma/client'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { skuUnico } from '../../../lib/sku'
import { serialKey } from '../../../lib/validation'
import { classifyStockKind } from '../../../lib/stock-kind'
import { promoteToEquipo } from '../../../lib/stock'
import { INVENTORY_UNIT_RECEIVED, liberarReservasVencidas } from '../../../lib/inventory'
import { LIMITE_MONTO_GENERAL, numero, numeroOpcional } from '../../../lib/montos'
import { sucursalEfectiva } from '../../../lib/sucursal-efectiva'
import { canSeeCostForSession, redactProductCosts } from '../../../lib/cost-visibility'
import { catalogMeta, catalogSearchFilter, parseCatalogPage } from '../../../lib/product-catalog'
import { accessoryCatalogFilter, parseAccessoryCategory, parseCompatibleModels } from '../../../lib/product-accessories'
import { PRIMARY_IMAGE_INCLUDE, primaryImageFields } from '../../../lib/product-images'
import { updateProductPrice, ProductPriceError } from '../../../lib/product-price'
import { createProduct as createProductShared, updateProduct as updateProductShared, ProductServiceError } from '../../../lib/product-service'

// Variante estructurada: texto libre acotado; vacío se guarda como null.
const variantField = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null



// #287 + #404: unidades vendibles y foto principal (solo el id; las URLs se arman aparte).
const PRODUCT_LIST_INCLUDE = { _count: { select: { inventoryUnits: { where: { status: 'AVAILABLE' as const } } } }, images: PRIMARY_IMAGE_INCLUDE }

const unitDetails = (body: any, fallback: { condition: string; costPyg?: number }) => {
  const raw = body.unit || body
  const batteryHealth = raw.batteryHealth === undefined || raw.batteryHealth === null || raw.batteryHealth === '' ? null : Number(raw.batteryHealth)
  if (batteryHealth !== null && (!Number.isSafeInteger(batteryHealth) || batteryHealth < 0 || batteryHealth > 100)) throw new Error('La batería debe estar entre 0 y 100%.')
  const purchasedAt = raw.purchasedAt ? new Date(raw.purchasedAt) : null
  if (purchasedAt && Number.isNaN(purchasedAt.getTime())) throw new Error('Fecha de compra inválida.')
  const costCurrency: PaymentCurrency = raw.costCurrency === 'USD' ? PaymentCurrency.USD : PaymentCurrency.PYG
  const originalCost = raw.originalCost === undefined || raw.originalCost === null || raw.originalCost === '' ? null : Number(raw.originalCost)
  const exchangeRatePyg = raw.exchangeRatePyg === undefined || raw.exchangeRatePyg === null || raw.exchangeRatePyg === '' ? null : Number(raw.exchangeRatePyg)
  if (originalCost !== null && (!Number.isFinite(originalCost) || originalCost < 0)) throw new Error('Costo original inválido.')
  if (exchangeRatePyg !== null && (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0)) throw new Error('Cotización inválida.')
  const costPyg = raw.costPyg === undefined || raw.costPyg === '' ? fallback.costPyg ?? null : Number(raw.costPyg)
  if (costPyg !== null && (!Number.isSafeInteger(costPyg) || costPyg < 0 || costPyg > LIMITE_MONTO_GENERAL)) throw new Error('Costo en guaraníes inválido.')
  const condition: ProductCondition = Object.values(ProductCondition).includes(raw.condition) ? raw.condition : fallback.condition as ProductCondition
  return { condition, batteryHealth, supplierName: typeof raw.supplierName === 'string' && raw.supplierName.trim() ? raw.supplierName.trim().slice(0, 160) : null, purchasedAt, costPyg, costCurrency, originalCost, exchangeRatePyg, notes: typeof raw.unitNotes === 'string' ? raw.unitNotes.trim().slice(0, 500) || null : null }
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  await prisma.$transaction(tx => liberarReservasVencidas(tx, tenant))
  const p = new URL(request.url).searchParams; const q = p.get('q') || ''
  // #286: un vendedor/cajera sin sucursal asignada opera con su sucursal
  // efectiva (última usada → primera creada) para que el catálogo no quede vacío.
  const branchEfectiva = ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? await sucursalEfectiva(session) : null
  const branchFilter = ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? { OR: [{ branchId: branchEfectiva }, { branchId: null }] } : undefined
  const searchFilter = catalogSearchFilter(q)
  const accessoryFilter = accessoryCatalogFilter(p.get('accessoryCategory'))
  // Paginado por cursor: el catálogo puede tener más de una pantalla y el
  // orden necesita un desempate estable (nombre no es único). El tope subió a
  // 500 para que la sincronización del panel traiga el catálogo en una sola
  // página (#247); el default sigue en 200 para el resto de los llamadores.
  const limit = Math.min(500, Math.max(1, Number(p.get('limit')) || 200))
  const cursor = p.get('cursor')
  const where = { AND: [{ tenantId: tenant, isActive: true }, ...(branchFilter ? [branchFilter] : []), ...(searchFilter ? [searchFilter] : []), ...(accessoryFilter ? [accessoryFilter] : [])] }
  // #354: con `page` el POS pide el catálogo por páginas y con búsqueda en el
  // servidor ({ items, total, page, pageSize, pages }). Sin `page` el contrato
  // anterior (arreglo con cursor) queda igual para el resto de los llamadores.
  if (p.has('page')) {
    const { page, pageSize, skip } = parseCatalogPage(p)
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: pageSize, skip, include: PRODUCT_LIST_INCLUDE }),
    ])
    const verCostoPagina = await canSeeCostForSession(session)
    return json({ items: rows.map(({ _count, images, ...producto }) => redactProductCosts({ ...producto, unitsCount: _count?.inventoryUnits ?? 0, ...primaryImageFields(producto.id, images) }, verCostoPagina)), ...catalogMeta(total, page, pageSize) })
  }
  const data = await prisma.product.findMany({
    where,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // #287: el producto y sus unidades son el mismo objeto en dos vistas: la
    // lista dice cuántas unidades físicas (vendibles) tiene cada variante.
    include: PRODUCT_LIST_INCLUDE,
  })
  const verCosto = await canSeeCostForSession(session)
  return json(data.map(({ _count, images, ...producto }) => redactProductCosts({ ...producto, unitsCount: _count?.inventoryUnits ?? 0, ...primaryImageFields(producto.id, images) }, verCosto)))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const b = await request.json()
  // The MCP-safe product contract is shared with the web route. Legacy POS
  // payloads (stock, serials, costs and physical-unit fields) continue through
  // the full path below so existing inventory semantics remain unchanged.
  const sharedKeys = new Set(['name', 'sku', 'category', 'model', 'color', 'capacity', 'compatibleModels', 'accessoryCategory', 'pricePyg', 'price', 'branchId'])
  if (Object.keys(b).every(key => sharedKeys.has(key)) && b.stock === undefined && b.imei === undefined) {
    try {
      const created = await createProductShared(prisma, { id: session.user.id, tenantId: tenant, role: session.user.role, permissions: session.user.permissions, branchId: session.user.branchId }, b)
      return json(created, { status: 201 })
    } catch (cause) {
      const code = cause instanceof ProductServiceError ? cause.code : 'invalid'
      return error(cause instanceof Error ? cause.message : 'No se pudo crear el producto.', code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'conflict' ? 409 : 400)
    }
  }
  const price = Number(b.pricePyg ?? b.price ?? 0); const stock = Number(b.stock ?? 0)
  const cost = b.costPyg === undefined || b.costPyg === null || b.costPyg === '' ? undefined : Number(b.costPyg)
  const wholesalePricePyg = b.wholesalePricePyg === undefined || b.wholesalePricePyg === null || b.wholesalePricePyg === '' ? null : Number(b.wholesalePricePyg)
  const priceUsd = b.priceUsd === undefined || b.priceUsd === null || b.priceUsd === '' ? null : Number(b.priceUsd)
  if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0 || priceUsd > LIMITE_MONTO_GENERAL)) throw new Error('Precio en USD inválido.')
  const warrantyDays = b.warrantyDays === undefined || b.warrantyDays === null || b.warrantyDays === '' ? null : Number(b.warrantyDays)
  if (warrantyDays !== null && (!Number.isSafeInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 730)) throw new Error('Los días de garantía deben estar entre 0 y 730.')
  const warrantyCoverage = typeof b.warrantyCoverage === 'string' && b.warrantyCoverage.trim() ? b.warrantyCoverage.trim().slice(0, 1000) : null
  const warrantyExclusions = typeof b.warrantyExclusions === 'string' && b.warrantyExclusions.trim() ? b.warrantyExclusions.trim().slice(0, 1000) : null
  if (wholesalePricePyg !== null && (!Number.isSafeInteger(wholesalePricePyg) || wholesalePricePyg < 0 || wholesalePricePyg > LIMITE_MONTO_GENERAL)) throw new Error('Precio mayorista inválido.')
  const insuranceRate = b.insuranceRate === undefined || b.insuranceRate === null || b.insuranceRate === '' ? undefined : Number(b.insuranceRate)
  const reorderPoint = b.reorderPoint === undefined ? undefined : b.reorderPoint === null || b.reorderPoint === '' ? null : Number(b.reorderPoint)
  if (typeof b.sku !== 'string' || !b.sku.trim() || typeof b.name !== 'string' || !b.name.trim()) return error('SKU y nombre son obligatorios.')
  if (!Number.isSafeInteger(price) || price < 0 || price > LIMITE_MONTO_GENERAL || !Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && (!Number.isSafeInteger(cost) || cost < 0 || cost > LIMITE_MONTO_GENERAL)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  if (reorderPoint !== undefined && reorderPoint !== null && (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || reorderPoint > 2147483647)) return error('El umbral de reposición debe ser un entero válido.')
  let accessoryCategory: ReturnType<typeof parseAccessoryCategory>; let compatibleModels: ReturnType<typeof parseCompatibleModels>
  try { accessoryCategory = parseAccessoryCategory(b.accessoryCategory); compatibleModels = parseCompatibleModels(b.compatibleModels) } catch (e) { return error(e instanceof Error ? e.message : 'Datos de accesorio inválidos.') }
  const requestedBranchId: string | null = b.branchId || session.user.branchId || null
  const branchId = requestedBranchId ?? await sucursalEfectiva(session)
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  if (session.user.branchId && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  const serial = serialKey(b.imei)
  if (serial && (stock !== 1 || !branchId)) return error('Un producto con IMEI/serial debe ingresar como una sola unidad en una sucursal.')
  const locationId = typeof b.locationId === 'string' && b.locationId.trim() ? b.locationId.trim() : null
  if (locationId && !serial) return error('La ubicación física se asigna a equipos con IMEI/serial.')
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial && await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true } })) throw new Error('Ese IMEI/serial ya existe.')
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: branchId ?? '', isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const product = await tx.product.create({ data: { tenantId: tenant, sku: await skuUnico(tx, tenant, branchId, b.sku.trim()), name: b.name.trim(), category: b.category, stockKind: classifyStockKind({ category: b.category, hasUnits: Boolean(serial) }), model: variantField(b.model, 80), color: variantField(b.color, 60), capacity: variantField(b.capacity, 20), imei: serial || null, condition: b.condition || 'NEW', pricePyg: price, ...(wholesalePricePyg !== null ? { wholesalePricePyg } : {}), priceUsd, warrantyDays, warrantyCoverage, warrantyExclusions, costPyg: cost, insuranceRate, stock, branchId, ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(accessoryCategory !== undefined ? { accessoryCategory } : {}), ...(compatibleModels !== undefined ? { compatibleModels } : {}) } })
      if (serial) {
        const unit = await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId, locationId, serial, ...unitDetails(b, { condition: product.condition, costPyg: cost }) } })
        // La unidad serializada deja su alta en la cronología desde el primer día.
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: INVENTORY_UNIT_RECEIVED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial, productId: product.id, branchId, locationId, origin: 'alta-producto' } } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_CREATED', entity: 'Product', entityId: product.id, metadata: { name: product.name, sku: product.sku, pricePyg: numero(product.pricePyg), costPyg: numeroOpcional(product.costPyg), stock: product.stock } } })
      return product
    })
    return json(data, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear el producto.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const b = await request.json(); if (!b.id) return error('Producto obligatorio.')
  const sharedKeys = new Set(['id', 'name', 'sku', 'category', 'model', 'color', 'capacity', 'compatibleModels', 'accessoryCategory', 'pricePyg', 'price', 'branchId'])
  if (Object.keys(b).every(key => sharedKeys.has(key))) {
    try {
      const updated = await updateProductShared(prisma, { id: session.user.id, tenantId: tenant, role: session.user.role, permissions: session.user.permissions, branchId: session.user.branchId }, String(b.id), b)
      return json(updated)
    } catch (cause) {
      const code = cause instanceof ProductServiceError ? cause.code : 'invalid'
      return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el producto.', code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'conflict' ? 409 : 400)
    }
  }
  const priceOnly = Object.keys(b).every(key => ['id', 'pricePyg', 'expectedPricePyg'].includes(key)) && b.pricePyg !== undefined
  if (priceOnly) {
    try {
      const changed = await updateProductPrice({ tenantId: tenant, user: session.user, effectiveBranchId: session.user.branchId ?? await sucursalEfectiva(session), productId: String(b.id), pricePyg: Number(b.pricePyg), expectedPricePyg: b.expectedPricePyg === undefined ? undefined : Number(b.expectedPricePyg) })
      return json(changed)
    } catch (e) {
      const code = e instanceof ProductPriceError ? e.code : 'price_update_failed'
      return error(code, code === 'product_not_found' ? 404 : code === 'permission_denied' || code === 'branch_denied' ? 403 : 409)
    }
  }
  const price = b.pricePyg === undefined ? undefined : Number(b.pricePyg); const stock = b.stock === undefined ? undefined : Number(b.stock)
  const cost = b.costPyg === undefined ? undefined : b.costPyg === null || b.costPyg === '' ? null : Number(b.costPyg)
  const insuranceRate = b.insuranceRate === undefined ? undefined : b.insuranceRate === null || b.insuranceRate === '' ? null : Number(b.insuranceRate)
  const reorderPoint = b.reorderPoint === undefined ? undefined : b.reorderPoint === null || b.reorderPoint === '' ? null : Number(b.reorderPoint)
  if ((price !== undefined && (!Number.isSafeInteger(price) || price < 0 || price > LIMITE_MONTO_GENERAL)) || (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647))) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > LIMITE_MONTO_GENERAL)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && insuranceRate !== null && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  if (reorderPoint !== undefined && reorderPoint !== null && (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || reorderPoint > 2147483647)) return error('El umbral de reposición debe ser un entero válido.')
  let accessoryCategory: ReturnType<typeof parseAccessoryCategory>; let compatibleModels: ReturnType<typeof parseCompatibleModels>
  try { accessoryCategory = parseAccessoryCategory(b.accessoryCategory); compatibleModels = parseCompatibleModels(b.compatibleModels) } catch (e) { return error(e instanceof Error ? e.message : 'Datos de accesorio inválidos.') }
  const product = await prisma.product.findFirst({ where: { id: b.id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  const userBranchId = session.user.branchId ?? await sucursalEfectiva(session)
  if ((userBranchId === null && product.branchId !== null) || (userBranchId && product.branchId !== null && product.branchId !== userBranchId)) return error('No autorizado para esa sucursal.', 403)
  const serial = b.imei === undefined ? undefined : serialKey(b.imei)
  if (serial !== undefined && (!serial || stock !== undefined && stock !== 1 || product.stock !== 1 || !product.branchId)) return error('El IMEI/serial solo se asigna a una unidad individual con stock 1.')
  // Cambiar el SKU a uno ya usado en la sucursal chocaría con el índice único:
  // se avisa antes en vez de devolver el error crudo de Prisma.
  if (typeof b.sku === 'string' && b.sku.trim() && b.sku.trim() !== product.sku) {
    const repetido = await prisma.product.findFirst({ where: { tenantId: tenant, branchId: product.branchId, sku: b.sku.trim(), id: { not: product.id } }, select: { id: true } })
    if (repetido) return error('Ya existe otro producto con ese SKU en la sucursal.', 409)
  }
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial !== undefined) {
        const existing = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { productId: true } })
        if (existing && existing.productId !== product.id) throw new Error('Ese IMEI/serial ya existe.')
        const details = unitDetails(b, { condition: product.condition, costPyg: numeroOpcional(product.costPyg) ?? undefined })
        const locationId = b.locationId === undefined ? undefined : typeof b.locationId === 'string' && b.locationId.trim() ? b.locationId.trim() : null
        if (locationId && (!product.branchId || !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: product.branchId, isActive: true }, select: { id: true } })))) throw new Error('Ubicación no encontrada para esa sucursal.')
        if (!existing) await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId: product.branchId, locationId: locationId ?? null, serial, ...details } }).then(() => promoteToEquipo(tx, tenant, product.id))
        else await tx.inventoryUnit.update({ where: { tenantId_serial: { tenantId: tenant, serial } }, data: { ...details, ...(locationId !== undefined ? { locationId } : {}) } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: product.id, metadata: { name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : product.name, pricePyg: price ?? numero(product.pricePyg), costPyg: cost ?? numeroOpcional(product.costPyg), condition: b.condition ?? product.condition, stock: stock ?? product.stock, stockBefore: product.stock, ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(serial !== undefined ? { imei: serial } : {}) } } })
      return tx.product.update({ where: { id: product.id }, data: { ...(typeof b.name === 'string' && b.name.trim() ? { name: b.name.trim() } : {}), ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(price !== undefined ? { pricePyg: price } : {}), ...(b.wholesalePricePyg !== undefined ? { wholesalePricePyg: b.wholesalePricePyg === null || b.wholesalePricePyg === '' ? null : Number(b.wholesalePricePyg) } : {}), ...(b.priceUsd !== undefined ? { priceUsd: b.priceUsd === null || b.priceUsd === '' ? null : Number(b.priceUsd) } : {}), ...(b.warrantyDays !== undefined ? { warrantyDays: b.warrantyDays === null || b.warrantyDays === '' ? null : Number(b.warrantyDays) } : {}), ...(b.warrantyCoverage !== undefined ? { warrantyCoverage: typeof b.warrantyCoverage === 'string' && b.warrantyCoverage.trim() ? b.warrantyCoverage.trim().slice(0, 1000) : null } : {}), ...(b.warrantyExclusions !== undefined ? { warrantyExclusions: typeof b.warrantyExclusions === 'string' && b.warrantyExclusions.trim() ? b.warrantyExclusions.trim().slice(0, 1000) : null } : {}), ...(cost !== undefined ? { costPyg: cost } : {}), ...(insuranceRate !== undefined ? { insuranceRate } : {}), ...(stock !== undefined ? { stock } : {}), ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(b.category !== undefined ? { category: b.category || null, stockKind: classifyStockKind({ category: b.category || null, hasUnits: Boolean(serial) || Boolean(product.imei) || (await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: product.id } })) > 0 }) } : {}), ...(accessoryCategory !== undefined ? { accessoryCategory } : {}), ...(compatibleModels !== undefined ? { compatibleModels } : {}), ...(b.model !== undefined ? { model: variantField(b.model, 80) } : {}), ...(b.color !== undefined ? { color: variantField(b.color, 60) } : {}), ...(b.capacity !== undefined ? { capacity: variantField(b.capacity, 20) } : {}), ...(serial !== undefined ? { imei: serial } : {}), ...(b.condition !== undefined ? { condition: b.condition } : {}) } })
    })
    return json(data)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar el producto.', 409) }
}

export async function DELETE(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const id = new URL(request.url).searchParams.get('id'); if (!id) return error('Producto obligatorio.')
  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  if ((session.user.branchId === null && product.branchId !== null) || (session.user.branchId && product.branchId !== session.user.branchId)) return error('No autorizado para esa sucursal.', 403)
  const data = await prisma.product.update({ where: { id: product.id }, data: { isActive: false } })
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_DELETED', entity: 'Product', entityId: product.id, metadata: { name: product.name, sku: product.sku } } })
  return json({ id: data.id, isActive: data.isActive })
}
