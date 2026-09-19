import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { canAccessOrder } from '../../../lib/orders'
import { serialKey } from '../../../lib/validation'
import {
  AUTHORIZATION_KINDS,
  AUTHORIZATION_RESOLVERS,
  DISCOUNT_MAX_PYG,
  authorizationValueOf,
  safeIntValue,
} from '../../../lib/authorizations'

// Autorizaciones comerciales y operativas: cualquier vendedor pide cambios de
// condición (mayorista, crédito, días), un descuento fuera de política, una
// venta bajo lista, un ajuste de stock, la anulación de un pedido, un gasto
// fuera del límite, una transferencia entre sucursales o una compra a crédito
// por encima del umbral; y administración/gerencia resuelve. El motor es el
// mismo para todos los tipos: una pendiente por vendedor + tipo + sujeto,
// resolución única y consumo de un solo uso.
// VENDEDOR ve solo sus pedidos; ADMIN/GERENTE ven todas las del tenant.
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED']
const INT_MAX = 2147483647
// Los tipos con sujeto propio (unidad, pedido, producto, gasto, transferencia,
// compra) no exigen ficha de cliente: el sujeto es la operación, no la
// condición comercial del cliente.
const SUBJECT_KINDS = ['BELOW_LIST_PRICE', 'STOCK_ADJUST', 'ORDER_VOID', 'EXPENSE_OVER_LIMIT', 'TRANSFER', 'PURCHASE_CREDIT']
const STOCK_ACTIONS = ['remove', 'adjust']
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const safeInt = safeIntValue

const authorizationDetail = Prisma.validator<Prisma.CustomerAuthorizationInclude>()({
  customer: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
})

type ValueShape = { creditLimitPyg?: number; creditDays?: number; discountPyg?: number; maxDiscountPyg?: number }

// Valida el pedido según el tipo y devuelve solo las claves con valor.
function normalizeValue(kind: string, raw: unknown, label: string): ValueShape | string {
  if (raw === undefined || raw === null) {
    if (kind === 'WHOLESALE') return {}
    if (kind === 'DISCOUNT' || kind === 'BELOW_LIST_PRICE') return `${label}: el monto del descuento es obligatorio.`
    return kind === 'CREDIT' ? `${label}: el límite de crédito es obligatorio.` : `${label}: los días de crédito son obligatorios.`
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return `${label}: valor inválido.`
  const input = raw as Record<string, unknown>
  const value: ValueShape = {}
  if (kind === 'CREDIT') {
    if (input.creditLimitPyg === undefined || input.creditLimitPyg === null || input.creditLimitPyg === '') return `${label}: el límite de crédito es obligatorio.`
    const limit = Number(input.creditLimitPyg)
    if (!safeInt(limit, 0, INT_MAX)) return `${label}: el límite de crédito debe ser un entero entre 0 y ${INT_MAX}.`
    value.creditLimitPyg = limit
  }
  if (kind === 'CREDIT' || kind === 'CREDIT_DAYS') {
    if (input.creditDays !== undefined && input.creditDays !== null && input.creditDays !== '') {
      const days = Number(input.creditDays)
      if (!safeInt(days, 0, 365)) return `${label}: los días de crédito deben estar entre 0 y 365.`
      value.creditDays = days
    } else if (kind === 'CREDIT_DAYS') {
      return `${label}: los días de crédito son obligatorios.`
    }
  }
  if (kind === 'DISCOUNT' || kind === 'BELOW_LIST_PRICE') {
    // El pedido pide cuánto descontar; la resolución autoriza un máximo (puede
    // ser 0 o menor a lo pedido, pero nunca un monto negativo).
    const rawAmount = input.maxDiscountPyg ?? input.discountPyg
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') return `${label}: el monto del descuento es obligatorio.`
    const amount = Number(rawAmount)
    if (!safeInt(amount, 0, DISCOUNT_MAX_PYG)) return `${label}: el descuento debe ser un entero entre 0 y ${DISCOUNT_MAX_PYG}.`
    if (input.maxDiscountPyg !== undefined) value.maxDiscountPyg = amount
    else {
      if (amount <= 0) return `${label}: el descuento debe ser mayor a 0.`
      value.discountPyg = amount
    }
  }
  return value
}

const inputObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

// Valor autorizado de los tipos con sujeto. La resolución no toca la ficha
// del cliente: habilita la operación puntual (ajuste, anulación o precio).
function normalizeSubjectResolution(kind: string, raw: unknown, requestedValue: unknown, label: string): Prisma.InputJsonValue | string {
  const input = inputObject(raw)
  const requested = authorizationValueOf(requestedValue)
  if (kind === 'ORDER_VOID' || kind === 'TRANSFER') return { approved: true }
  if (kind === 'STOCK_ADJUST') {
    const rawStock = input.adjustedStock ?? input.stock
    if (rawStock === undefined || rawStock === null || rawStock === '') return { approved: true }
    const adjustedStock = Number(rawStock)
    if (!safeInt(adjustedStock, 0, INT_MAX)) return `${label}: la existencia autorizada debe ser un entero entre 0 y ${INT_MAX}.`
    return { approved: true, adjustedStock }
  }
  // EXPENSE_OVER_LIMIT y PURCHASE_CREDIT: el máximo autorizado puede ser menor
  // (o 0) al pedido; sin resolución explícita se autoriza lo pedido.
  if (kind === 'EXPENSE_OVER_LIMIT') {
    const rawAmount = input.maxAmountPyg ?? requested.amountPyg
    const amount = Number(rawAmount)
    if (!safeInt(amount, 0, INT_MAX)) return `${label}: el máximo autorizado debe ser un entero entre 0 y ${INT_MAX}.`
    return { maxAmountPyg: amount }
  }
  if (kind === 'PURCHASE_CREDIT') {
    const rawAmount = input.maxTotalPyg ?? requested.totalPyg
    const amount = Number(rawAmount)
    if (!safeInt(amount, 0, INT_MAX)) return `${label}: el máximo autorizado debe ser un entero entre 0 y ${INT_MAX}.`
    return { maxTotalPyg: amount }
  }
  // BELOW_LIST_PRICE: el máximo autorizado puede ser menor (o 0) al pedido.
  const rawAmount = input.maxDiscountPyg ?? input.discountPyg ?? requested.discountPyg
  const amount = Number(rawAmount)
  if (!safeInt(amount, 0, DISCOUNT_MAX_PYG)) return `${label}: el máximo autorizado debe ser un entero entre 0 y ${DISCOUNT_MAX_PYG}.`
  return { maxDiscountPyg: amount }
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const status = clean(params.get('status'), 20).toUpperCase()
  const kind = clean(params.get('kind'), 20).toUpperCase()
  const customerId = clean(params.get('customerId'), 128)
  const mine = params.get('mine') === '1'
  if (status && !STATUSES.includes(status)) return error('Estado de solicitud inválido.')
  if (kind && !(AUTHORIZATION_KINDS as readonly string[]).includes(kind)) return error('Tipo de autorización inválido.')
  const seeAll = (AUTHORIZATION_RESOLVERS as readonly string[]).includes(session.user.role)
  const rows = await prisma.customerAuthorization.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(customerId ? { customerId } : {}),
      ...(mine || !seeAll ? { requestedById: session.user.id } : {}),
    },
    include: authorizationDetail,
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  // Pendientes primero: son las que requieren decisión.
  const pending = rows.filter(row => row.status === 'PENDING')
  const rest = rows.filter(row => row.status !== 'PENDING')
  return json([...pending, ...rest])
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const requestedCustomerId = clean(body?.customerId, 128)
    const kind = clean(body?.kind, 20).toUpperCase()
    const note = clean(body?.note, 500) || null
    if (!(AUTHORIZATION_KINDS as readonly string[]).includes(kind)) return error('Tipo de autorización inválido.')
    const isSubjectKind = SUBJECT_KINDS.includes(kind)
    // El descuento y los tipos con sujeto pueden no tener cliente (venta de
    // consumidor final, unidad o pedido); el resto sí exige ficha.
    if (!requestedCustomerId && kind !== 'DISCOUNT' && !isSubjectKind) return error('Cliente obligatorio.')
    if (requestedCustomerId) {
      const customer = await prisma.customer.findFirst({ where: { id: requestedCustomerId, tenantId: session.user.tenantId }, select: { id: true } })
      if (!customer) return error('Cliente no encontrado.', 404)
    }
    const customerId = requestedCustomerId || null
    let entity: string | null = null
    let entityId: string | null = null
    let requestedJson: Prisma.InputJsonValue | null = null
    if (kind === 'STOCK_ADJUST') {
      // Retiro o ajuste con motivo sobre una unidad física, dentro del alcance
      // del solicitante: no se puede pedir autorización sobre otra sucursal.
      const raw = inputObject(body?.requestedValue)
      const unitId = clean(raw.unitId, 128)
      const action = clean(raw.action, 20)
      const motivo = clean(raw.reason, 500)
      if (!unitId) return error('Solicitud: la unidad es obligatoria.')
      if (!STOCK_ACTIONS.includes(action)) return error('Solicitud: la acción de inventario es inválida.')
      if (motivo.length < 3) return error('Solicitud: indicá un motivo de entre 3 y 500 caracteres.')
      const unit = await prisma.inventoryUnit.findFirst({ where: { id: unitId, tenantId: session.user.tenantId }, select: { id: true, branchId: true } })
      if (!unit) return error('Unidad no encontrada.', 404)
      const scopeOk = session.user.role === 'ADMIN' || (unit.branchId !== null && unit.branchId === session.user.branchId)
      if (!scopeOk) return error('No autorizado para esa sucursal.', 403)
      let stock: number | undefined
      if (raw.stock !== undefined && raw.stock !== null && raw.stock !== '') {
        stock = Number(raw.stock)
        if (!safeInt(stock, 0, INT_MAX)) return error('Solicitud: la existencia debe ser un entero entre 0 y 2147483647.')
      }
      entity = 'INVENTORY_UNIT'
      entityId = unitId
      requestedJson = { unitId, action, reason: motivo, ...(stock === undefined ? {} : { stock }) }
    } else if (kind === 'ORDER_VOID') {
      const raw = inputObject(body?.requestedValue)
      const orderId = clean(raw.orderId, 128)
      const voidKind = clean(raw.kind, 20) || 'full'
      const motivo = clean(raw.reason, 500)
      if (!orderId) return error('Solicitud: el pedido es obligatorio.')
      if (voidKind !== 'full') return error('Solicitud: solo se admite la anulación total.')
      if (motivo.length < 3) return error('Solicitud: indicá un motivo de entre 3 y 500 caracteres.')
      const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: session.user.tenantId }, select: { id: true, status: true, sellerId: true, branchId: true } })
      if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
      if (order.status === 'CANCELLED') return error('El pedido ya fue anulado o cancelado.', 409)
      entity = 'ORDER'
      entityId = orderId
      requestedJson = { orderId, kind: 'full', reason: motivo }
    } else if (kind === 'BELOW_LIST_PRICE') {
      const normalized = normalizeValue(kind, body?.requestedValue, 'Solicitud')
      if (typeof normalized === 'string') return error(normalized)
      const raw = inputObject(body?.requestedValue)
      const productId = clean(raw.productId, 128) || null
      const description = clean(raw.description, 200) || null
      if (productId) {
        const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.user.tenantId }, select: { id: true } })
        if (!product) return error('Producto no encontrado.', 404)
        entity = 'PRODUCT'
        entityId = productId
      }
      let discountPct: number | undefined
      if (raw.discountPct !== undefined && raw.discountPct !== null && raw.discountPct !== '') {
        discountPct = Number(raw.discountPct)
        if (!safeInt(discountPct, 0, 100)) return error('Solicitud: el porcentaje debe estar entre 0 y 100.')
      }
      requestedJson = {
        ...normalized,
        ...(discountPct === undefined ? {} : { discountPct }),
        ...(productId ? { productId } : {}),
        ...(description ? { description } : {}),
      }
    } else if (kind === 'EXPENSE_OVER_LIMIT') {
      // Gasto por encima del límite de la empresa: el sujeto es el gasto, que
      // recién existe al ejecutarse. La aprobación fija el monto máximo.
      const raw = inputObject(body?.requestedValue)
      const amountPyg = Number(raw.amountPyg)
      const expenseDescription = clean(raw.description, 300)
      if (!safeInt(amountPyg, 1, INT_MAX)) return error('Solicitud: el monto del gasto debe ser un entero mayor a 0.')
      if (expenseDescription.length < 3) return error('Solicitud: describí el gasto en 3 a 300 caracteres.')
      entity = 'EXPENSE'
      requestedJson = { amountPyg, description: expenseDescription }
    } else if (kind === 'TRANSFER') {
      // Traslado entre sucursales: el sujeto es el producto a mover desde la
      // sucursal de origen, dentro del alcance del solicitante.
      const raw = inputObject(body?.requestedValue)
      const sourceBranchId = clean(raw.sourceBranchId, 128)
      const destinationBranchId = clean(raw.destinationBranchId, 128)
      const productId = clean(raw.productId, 128)
      if (!sourceBranchId || !destinationBranchId || sourceBranchId === destinationBranchId || !productId) return error('Solicitud: origen, destino distintos y producto son obligatorios.')
      if (session.user.role !== 'ADMIN' && session.user.branchId !== sourceBranchId) return error('No autorizado para esa sucursal.', 403)
      const branches = await prisma.branch.findMany({ where: { tenantId: session.user.tenantId, id: { in: [sourceBranchId, destinationBranchId] }, isActive: true }, select: { id: true } })
      if (branches.length !== 2) return error('Solicitud: sucursal de origen o destino no encontrada.')
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.user.tenantId, branchId: sourceBranchId, isActive: true }, select: { id: true } })
      if (!product) return error('Producto no encontrado en la sucursal de origen.', 404)
      let quantity: number | undefined
      if (raw.quantity !== undefined && raw.quantity !== null && raw.quantity !== '') {
        quantity = Number(raw.quantity)
        if (!safeInt(quantity, 1, INT_MAX)) return error('Solicitud: la cantidad debe ser un entero mayor a 0.')
      }
      const rawSerials = raw.serials === undefined ? [] : Array.isArray(raw.serials) ? raw.serials : null
      if (rawSerials === null || rawSerials.length > 200) return error('Solicitud: los IMEI/seriales no son válidos.')
      const serials = rawSerials.map(serial => typeof serial === 'string' ? serialKey(serial) : '').filter(Boolean)
      if (serials.length !== rawSerials.length || new Set(serials).size !== serials.length) return error('Solicitud: cada IMEI/serial debe ser válido y único.')
      const effectiveQuantity = quantity ?? serials.length
      if (effectiveQuantity < 1) return error('Solicitud: indicá la cantidad o los IMEI/seriales a transferir.')
      if (serials.length > effectiveQuantity) return error('Solicitud: hay más IMEI/seriales que la cantidad indicada.')
      entity = 'STOCK_TRANSFER'
      entityId = productId
      requestedJson = { sourceBranchId, destinationBranchId, productId, quantity: effectiveQuantity, ...(serials.length ? { serials } : {}) }
    } else if (kind === 'PURCHASE_CREDIT') {
      // Compra a crédito por encima del umbral: el sujeto es el proveedor (si
      // ya existe la ficha) y el total pedido.
      const raw = inputObject(body?.requestedValue)
      const totalPyg = Number(raw.totalPyg)
      if (!safeInt(totalPyg, 1, INT_MAX)) return error('Solicitud: el total de la compra debe ser un entero mayor a 0.')
      const requestedSupplierId = clean(raw.supplierId, 128) || null
      const requestedSupplierName = clean(raw.supplierName, 160) || null
      if (!requestedSupplierId && !requestedSupplierName) return error('Solicitud: indicá el proveedor de la compra a crédito.')
      let supplierName = requestedSupplierName
      if (requestedSupplierId) {
        const supplier = await prisma.supplier.findFirst({ where: { id: requestedSupplierId, tenantId: session.user.tenantId, isActive: true }, select: { id: true, name: true } })
        if (!supplier) return error('Proveedor no encontrado.', 404)
        supplierName = supplier.name
      }
      entity = 'PURCHASE'
      entityId = requestedSupplierId
      requestedJson = { totalPyg, ...(requestedSupplierId ? { supplierId: requestedSupplierId } : {}), ...(supplierName ? { supplierName } : {}) }
    } else {
      const normalized = normalizeValue(kind, body?.requestedValue, 'Solicitud')
      if (typeof normalized === 'string') return error(normalized)
      requestedJson = kind === 'WHOLESALE' ? null : (normalized as Prisma.InputJsonValue)
    }
    // Una pendiente por vendedor + tipo + sujeto: pedir otra solo duplica la
    // decisión de gerencia.
    const pendingWhere: Prisma.CustomerAuthorizationWhereInput = {
      tenantId: session.user.tenantId,
      requestedById: session.user.id,
      kind,
      status: 'PENDING',
      ...(entity ? { entity, entityId } : customerId ? { customerId } : {}),
    }
    const pending = await prisma.customerAuthorization.findFirst({ where: pendingWhere, select: { id: true } })
    if (pending) {
      if (kind === 'DISCOUNT') return error('Ya tenés una solicitud de descuento pendiente. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'BELOW_LIST_PRICE') return error('Ya tenés una solicitud de precio bajo lista pendiente. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'STOCK_ADJUST') return error('Ya tenés una solicitud pendiente para esa unidad. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'ORDER_VOID') return error('Ya tenés una solicitud de anulación pendiente para ese pedido. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'EXPENSE_OVER_LIMIT') return error('Ya tenés una solicitud de gasto pendiente. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'TRANSFER') return error('Ya tenés una solicitud de transferencia pendiente para ese producto. Esperá a que gerencia la resuelva.', 409)
      if (kind === 'PURCHASE_CREDIT') return error('Ya tenés una solicitud de compra a crédito pendiente. Esperá a que gerencia la resuelva.', 409)
      return error('Ya hay una solicitud pendiente de este tipo para el cliente.', 409)
    }
    const auditSubject = kind === 'STOCK_ADJUST' ? { entity: 'InventoryUnit', entityId: entityId as string }
      : kind === 'ORDER_VOID' ? { entity: 'Order', entityId: entityId as string }
        : kind === 'BELOW_LIST_PRICE' ? { entity: entity ? 'Product' : customerId ? 'Customer' : 'Order', entityId: entityId ?? customerId ?? 'below-list-price' }
          : kind === 'EXPENSE_OVER_LIMIT' ? { entity: 'CashMovement', entityId: 'expense' }
            : kind === 'TRANSFER' ? { entity: 'StockTransfer', entityId: entityId ?? 'transfer' }
              : kind === 'PURCHASE_CREDIT' ? { entity: 'PurchaseOrder', entityId: entityId ?? 'purchase-credit' }
                : { entity: customerId ? 'Customer' : 'Order', entityId: customerId ?? 'discount' }
    const created = await prisma.$transaction(async tx => {
      const authorization = await tx.customerAuthorization.create({
        data: { tenantId: session.user.tenantId, customerId, kind, entity, entityId, requestedValue: requestedJson ?? Prisma.DbNull, requestedById: session.user.id, note },
        include: authorizationDetail,
      })
      await tx.auditLog.create({ data: {
        tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_AUTHORIZATION_REQUESTED',
        entity: auditSubject.entity, entityId: auditSubject.entityId,
        metadata: { kind, ...(requestedJson ? { requestedValue: requestedJson } : {}), ...(note ? { note } : {}), ...(customerId ? { customerId } : {}), ...(entity ? { subject: { entity, entityId } } : {}) },
      } })
      return authorization
    })
    return json(created, { status: 201 })
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya hay una solicitud pendiente de este tipo.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar la solicitud.')
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!(AUTHORIZATION_RESOLVERS as readonly string[]).includes(session.user.role)) return error('Solo gerencia o el dueño pueden resolver solicitudes.', 403)
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = clean(body?.id, 128)
    const action = clean(body?.action, 20).toLowerCase()
    const resolvedNote = clean(body?.resolvedNote, 500) || null
    if (!id) return error('Solicitud obligatoria.')
    if (action !== 'approve' && action !== 'reject') return error('Acción inválida.')
    const current = await prisma.customerAuthorization.findFirst({ where: { id, tenantId: session.user.tenantId } })
    if (!current) return error('Solicitud no encontrada.', 404)
    if (current.status !== 'PENDING') return error('La solicitud ya fue resuelta.', 409)
    // Segregación de funciones: un vendedor o gerente no resuelve lo que pidió.
    // El dueño (ADMIN) es la última instancia de la empresa: si trabaja solo,
    // su propia solicitud quedaría sin aprobador.
    if (current.requestedById === session.user.id && session.user.role !== 'ADMIN') return error('No podés resolver tu propia solicitud.', 403)
    const isSubjectKind = SUBJECT_KINDS.includes(current.kind)
    // Un rechazo sin motivo deja al vendedor sin saber qué corregir.
    if (action === 'reject' && (current.kind === 'DISCOUNT' || current.kind === 'BELOW_LIST_PRICE' || isSubjectKind) && !resolvedNote) {
      return error('Indicá el motivo del rechazo.')
    }

    const requested = authorizationValueOf(current.requestedValue)
    let applied: ValueShape = {}
    let resolvedJson: Prisma.InputJsonValue | null = null
    if (action === 'approve') {
      if (isSubjectKind) {
        const normalized = normalizeSubjectResolution(current.kind, body?.resolvedValue ?? requested, requested, 'Autorización')
        if (typeof normalized === 'string') return error(normalized)
        resolvedJson = normalized
      } else {
        const normalized = normalizeValue(current.kind, body?.resolvedValue === undefined || body?.resolvedValue === null ? requested : body.resolvedValue, 'Autorización')
        if (typeof normalized === 'string') return error(normalized)
        applied = normalized
        if (current.kind === 'CREDIT_DAYS' && applied.creditDays === undefined) applied.creditDays = requested.creditDays
        if (current.kind === 'CREDIT') {
          if (applied.creditLimitPyg === undefined) applied.creditLimitPyg = requested.creditLimitPyg
          if (applied.creditDays === undefined && requested.creditDays !== undefined) applied.creditDays = requested.creditDays
        }
        // El máximo autorizado puede ser menor (o 0) al pedido; sin resolución
        // explícita se autoriza lo pedido.
        if (current.kind === 'DISCOUNT') applied = { maxDiscountPyg: applied.maxDiscountPyg ?? requested.discountPyg ?? 0 }
        resolvedJson = current.kind === 'WHOLESALE' ? null : (applied as Prisma.InputJsonValue)
      }
    }
    // Audit en la cronología del sujeto (unidad, pedido, producto, gasto,
    // transferencia o compra) para que la resolución aparezca donde se pidió.
    const subjectEntity = current.entity === 'INVENTORY_UNIT' ? 'InventoryUnit'
      : current.entity === 'ORDER' ? 'Order'
        : current.entity === 'PRODUCT' ? 'Product'
          : current.entity === 'EXPENSE' ? 'CashMovement'
            : current.entity === 'STOCK_TRANSFER' ? 'StockTransfer'
              : current.entity === 'PURCHASE' ? 'PurchaseOrder'
                : null
    const auditEntity = subjectEntity ?? (current.customerId ? 'Customer' : 'Order')
    const auditEntityId = subjectEntity ? (current.entityId ?? 'unknown') : (current.customerId ?? 'discount')

    const updated = await prisma.$transaction(async tx => {
      // Las condiciones comerciales del cliente sí actualizan la ficha; los
      // tipos con sujeto resuelven la operación puntual sin tocar al cliente.
      if (action === 'approve' && current.customerId && !isSubjectKind) {
        if (current.kind === 'WHOLESALE') {
          await tx.customer.update({ where: { id: current.customerId }, data: { pricingTier: 'WHOLESALE' } })
        } else if (current.kind === 'CREDIT') {
          await tx.customer.update({ where: { id: current.customerId }, data: {
            ...(applied.creditLimitPyg === undefined ? {} : { creditLimitPyg: applied.creditLimitPyg }),
            ...(applied.creditDays === undefined ? {} : { creditDays: applied.creditDays }),
          } })
        } else if (current.kind === 'CREDIT_DAYS') {
          await tx.customer.update({ where: { id: current.customerId }, data: { ...(applied.creditDays === undefined ? {} : { creditDays: applied.creditDays }) } })
        }
      }
      const authorization = await tx.customerAuthorization.update({
        where: { id: current.id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          resolvedValue: resolvedJson ?? Prisma.DbNull,
          resolvedById: session.user.id,
          resolvedNote,
          resolvedAt: new Date(),
        },
        include: authorizationDetail,
      })
      await tx.auditLog.create({ data: {
        tenantId: session.user.tenantId, userId: session.user.id,
        action: action === 'approve' ? 'CUSTOMER_AUTHORIZATION_APPROVED' : 'CUSTOMER_AUTHORIZATION_REJECTED',
        entity: auditEntity, entityId: auditEntityId,
        metadata: {
          kind: current.kind,
          ...(current.requestedValue ? { requestedValue: current.requestedValue as Prisma.InputJsonValue } : {}),
          ...(resolvedJson ? { resolvedValue: resolvedJson } : {}),
          ...(resolvedNote ? { resolvedNote } : {}),
          ...(current.entity ? { subject: { entity: current.entity, entityId: current.entityId } } : {}),
          ...(current.customerId ? { customerId: current.customerId } : {}),
        },
      } })
      return authorization
    })
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la solicitud.')
  }
}
