import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, normalizePayment, objectInput, receiveTradeIn, textInput } from '../../../lib/payment-input'
import { quotePromotion } from '../../../lib/promotions'
import { canApproveOrderDiscount } from '../../../lib/orders'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { serialKey } from '../../../lib/validation'
import { lineDiscount as lineDiscountFor, warrantyDaysFor } from '../../../lib/pricing'
import { changeStock } from '../../../lib/stock'
import { syncOrderItemSerials } from '../../../lib/order-serials'

// Detalle devuelto tanto al crear como al reutilizar una orden idempotente.
const orderDetail = Prisma.validator<Prisma.OrderInclude>()({
  items: true,
  payments: true,
  customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
  seller: { select: { id: true, name: true } },
})

const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
const cleanText = (value: unknown, field: string, max: number) => value === undefined ? undefined : textInput(value, field, max)

function itemSerials(value: unknown, quantity: number) {
  if (value === undefined) return [] as string[]
  if (!Array.isArray(value) || value.length > quantity) throw new InputError('Los IMEI/seriales de la línea son inválidos.')
  const serials = value.map(serialKey).filter(Boolean)
  if (serials.length !== value.length || new Set(serials).size !== serials.length) throw new InputError('Los IMEI/seriales de la línea deben ser únicos.')
  return serials
}

function inlineAddresses(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 10) throw new InputError('addresses debe contener entre 0 y 10 direcciones.')
  const rows = value.map((row, index) => {
    const input = objectInput(row)
    const address = textInput(input.address, 'Dirección', 400)
    return { label: typeof input.label === 'string' && input.label.trim() ? textInput(input.label, 'Etiqueta', 80) : `Dirección ${index + 1}`,
      address, city: input.city === undefined || input.city === null || input.city === '' ? null : textInput(input.city, 'Ciudad', 100),
      department: input.department === undefined || input.department === null || input.department === '' ? null : textInput(input.department, 'Departamento', 100),
      country: input.country === undefined || input.country === null || input.country === '' ? 'Paraguay' : textInput(input.country, 'País', 100),
      notes: input.notes === undefined || input.notes === null || input.notes === '' ? null : textInput(input.notes, 'Notas de dirección', 400), isDefault: input.isDefault === true }
  })
  return rows.map((row, index) => ({ ...row, isDefault: row.isDefault || (index === 0 && !rows.some(item => item.isDefault)) }))
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const where = session.user.role === 'VENDEDOR'
    ? { tenantId: tenant, branchId: session.user.branchId, sellerId: session.user.id }
    : session.user.role === 'CAJERA'
      ? { tenantId: tenant, branchId: session.user.branchId }
      : { tenantId: tenant }
  const params = new URL(request.url).searchParams
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100))
  const cursor = params.get('cursor')
  return json(await prisma.order.findMany({ where, include: { items: true, payments: true, customer: true, seller: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: limit, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const limited = enforceRateLimit(request, 'orders', 120, 60_000)
  if (limited) return limited
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  if (idempotencyKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Identificador de operación inválido.')
  try {
  // Reintento de la misma operación: se devuelve la orden ya creada sin
  // volver a descontar stock ni duplicar pagos.
  if (idempotencyKey) {
    const previous = await prisma.order.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } }, include: orderDetail })
    if (previous) return json(previous)
  }
  let payload: unknown
  try { payload = await request.json() } catch { throw new InputError('JSON inválido.') }
  const body = objectInput(payload); const items = Array.isArray(body.items) ? body.items : []; const payments = Array.isArray(body.payments) ? body.payments : (body.payment ? [body.payment] : [])
  if (['coupon', 'couponCode', 'couponCodes', 'discountCode', 'promoCode'].some(key => key in body)) throw new InputError('Enviá couponCode dentro de cada línea de items.')
  if (body.customerId !== undefined && body.customer !== undefined) throw new InputError('Enviá customerId o customer, no ambos.')
  const selectedCustomerId = body.customerId === undefined ? undefined : textInput(body.customerId, 'customerId', 200)
  let customer: { name: string; phone?: string; countryCode?: string; email?: string; document?: string; addresses: ReturnType<typeof inlineAddresses> } | undefined
  if (body.customer !== undefined) {
    const input = objectInput(body.customer)
    if (Object.keys(input).some(key => !['name', 'phone', 'address', 'addresses', 'countryCode', 'email', 'document'].includes(key))) throw new InputError('customer contiene campos no admitidos.')
    const phone = input.phone === undefined || input.phone === '' ? undefined : textInput(input.phone, 'Teléfono', 100)
    const document = input.document === undefined || input.document === '' ? undefined : textInput(input.document, 'Documento', 100)
    const countryCode = input.countryCode === undefined ? '+595' : textInput(input.countryCode, 'Código de país', 5)
    if (!/^\+\d{1,4}$/.test(countryCode)) throw new InputError('Código de país inválido.')
    const addresses = inlineAddresses(input.addresses === undefined && input.address !== undefined ? [{ label: 'Principal', address: input.address, isDefault: true }] : input.addresses)
    customer = { name: textInput(input.name, 'Nombre', 200),
      ...(phone === undefined ? {} : { phone }), countryCode,
      ...(input.email === undefined || input.email === '' ? {} : { email: textInput(input.email, 'Email', 200) }),
      ...(document === undefined ? {} : { document }), addresses }
  }
  if (!items.length) return error('Productos son obligatorios.')
  // Factura a otro titular: el cliente compra pero la factura sale a nombre
  // de otra persona o empresa (esposo/a, padre, RUC de la empresa, etc.).
  let billingName: string | undefined; let billingDocument: string | undefined
  if (body.billingTo !== undefined) {
    const input = objectInput(body.billingTo)
    if (Object.keys(input).some(key => !['name', 'document'].includes(key))) throw new InputError('billingTo contiene campos no admitidos.')
    billingName = input.name === undefined || input.name === '' ? undefined : textInput(input.name, 'Titular de factura', 200)
    billingDocument = input.document === undefined || input.document === '' ? undefined : textInput(input.document, 'RUC de factura', 100)
    if (!billingName && !billingDocument) throw new InputError('El titular de factura necesita nombre o RUC.')
  }
  const orderNotes = body.notes === undefined || body.notes === null || body.notes === '' ? null : textInput(body.notes, 'Comentario', 2000)
  const discount = body.discountPyg ?? 0; const delivery = body.deliveryPyg ?? 0
  if (!safeInt(discount) || !safeInt(delivery)) return error('Descuento y delivery inválidos.')
  if (discount > 0 && !canApproveOrderDiscount(session.user)) throw new InputError('Tu rol no puede aprobar descuentos. Solicitá autorización a gerencia.', 403)
  if (discount > 0 && items.some(item => item?.couponCode !== undefined)) throw new InputError('No se puede combinar cupón y descuento global.')
    const result = await prisma.$transaction(async tx => {
      const branchId = session.user.branchId
      if (branchId && !await tx.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } })) throw new Error('Sucursal no encontrada.')
      let customerId = selectedCustomerId
      if (customerId && !await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })) throw new Error('Cliente no encontrado.')
      if (customer) {
        // Serialize inline checkouts for this tenant/name, including when no customer exists yet.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(json_build_array(${tenant}::text, lower(${customer.name}::text))::text, 0))`
        // Literal equality: names containing % or _ must not act as ILIKE patterns.
        const matches = await tx.$queryRaw<Array<{ id: string; phone: string | null; document: string | null }>>`
          SELECT "id", "phone", "document" FROM "Customer"
          WHERE "tenantId" = ${tenant} AND (lower("name") = lower(${customer.name}) OR (${customer.document ?? null}::text IS NOT NULL AND "document" = ${customer.document ?? null}) OR (${customer.phone ?? null}::text IS NOT NULL AND "phone" = ${customer.phone ?? null}))
          LIMIT 2 FOR SHARE
        `
        if (matches.length > 1) throw new InputError('Hay varios clientes con ese nombre. Seleccioná el cliente existente y enviá customerId.', 409)
        const existing = matches[0]
        if (existing) {
          if (customer.phone !== undefined && existing.phone !== null && existing.phone !== customer.phone) throw new InputError('El teléfono no coincide. Seleccioná el cliente existente y enviá customerId.', 409)
          if (customer.document !== undefined && existing.document !== null && existing.document !== customer.document) throw new InputError('El documento no coincide. Seleccioná el cliente existente y enviá customerId.', 409)
          customerId = existing.id
          const storedAddresses = customer.addresses.length
            ? await tx.customerAddress.findMany({ where: { customerId: existing.id }, select: { address: true } })
            : []
          const addressesToCreate = customer.addresses.filter(address => !storedAddresses.some(stored => stored.address.trim().toLocaleLowerCase() === address.address.trim().toLocaleLowerCase()))
          await tx.customer.update({ where: { id: existing.id }, data: { ...(existing.phone === null && customer.phone ? { phone: customer.phone } : {}), ...(existing.document === null && customer.document ? { document: customer.document } : {}), ...(addressesToCreate.length ? { addresses: { create: addressesToCreate } } : {}) } })
        } else {
          const created = await tx.customer.create({ data: { tenantId: tenant, name: customer.name, phone: customer.phone, countryCode: customer.countryCode,
            email: customer.email, document: customer.document, ...(customer.addresses.length ? { addresses: { create: customer.addresses } } : {}) }, select: { id: true } })
          customerId = created.id
        }
      }
      let subtotal = 0; const normalized: Array<{ productId?: string; description: string; quantity: number; unitPricePyg: number; totalPyg: number; discountPyg: number; discountPct?: number; unitCostPyg?: number; baseUnitCostPyg?: number; insurancePyg: number; extraCostPyg: number; soldWithoutInsurance: boolean; serials: string[]; serialsPending: number; costPending: boolean; promotionSnapshot?: any }> = []
      const soldUnits: Array<{ id: string; serial: string; productId: string }> = []
      const serialsInOrder = new Set<string>()
      for (const item of items) {
        objectInput(item)
        if (['coupon', 'couponCodes', 'discountCode', 'promoCode', 'promotionSnapshot'].some(key => key in item)) throw new InputError('Enviá solo couponCode como metadata del cupón.')
        const quantity = Number(item.quantity); const price = Number(item.unitPricePyg ?? item.pricePyg ?? item.price ?? 0)
        if (!safeInt(quantity, 1) || !safeInt(price) || !Number.isSafeInteger(quantity * price)) throw new Error('Cantidad y precio inválidos.')
        const serials = itemSerials(item.inventoryUnitSerials, quantity)
        if (serials.some(serial => serialsInOrder.has(serial))) throw new InputError('Un IMEI/serial no puede repetirse en la misma venta.')
        serials.forEach(serial => serialsInOrder.add(serial))
        const promotion = item.couponCode === undefined ? undefined : await quotePromotion(tx, tenant, branchId, { ...item, quantity }, true)
        if (promotion && price !== promotion.unitPricePyg) throw new InputError('El precio del cupón cambió o fue alterado. Volvé a aplicarlo.', 409)
        let unitCostPyg: number | undefined; let baseUnitCostPyg: number | undefined; let insurancePyg = 0; let extraCostPyg = 0; let costPending = false; let serialsPending = 0
        const soldWithoutInsurance = item.soldWithoutInsurance === true
        if (item.soldWithoutInsurance !== undefined && typeof item.soldWithoutInsurance !== 'boolean') throw new InputError('"Vendido sin seguro" debe ser verdadero o falso.')
        if (item.extraCostPyg !== undefined) {
          extraCostPyg = Number(item.extraCostPyg)
          if (!safeInt(extraCostPyg)) throw new InputError('Costo extra inválido.')
        }
        if (item.productId) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: tenant, isActive: true } })
          if (!product) throw new Error(`Producto no encontrado: ${item.productId}`)
          if ((branchId === null && product.branchId !== null) || (branchId && product.branchId !== null && product.branchId !== branchId)) throw new Error('El producto pertenece a otra sucursal.')
          // Foto del costo: la ganancia histórica no cambia si luego se actualiza el costo.
          if (product.costPyg !== null && product.costPyg !== undefined) baseUnitCostPyg = product.costPyg
          const policy = product.category ? await tx.costPolicy.findFirst({ where: { tenantId: tenant, category: product.category, isActive: true }, select: { insuranceRate: true } }) : null
          const rate = product.insuranceRate === null || product.insuranceRate === undefined ? Number(policy?.insuranceRate ?? 0) : Number(product.insuranceRate)
          if (!soldWithoutInsurance && rate > 0) {
            insurancePyg = Math.round((price * rate) / 100)
            if (!safeInt(insurancePyg)) throw new InputError('El seguro calculado es inválido.')
          }
          const combinedCost = (baseUnitCostPyg ?? 0) + insurancePyg + extraCostPyg
          if ((baseUnitCostPyg !== undefined || insurancePyg > 0 || extraCostPyg > 0) && safeInt(combinedCost)) unitCostPyg = combinedCost
          costPending = baseUnitCostPyg === undefined && insurancePyg === 0 && extraCostPyg === 0
          const trackedUnitCount = await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: product.id } })
          if (trackedUnitCount === 0 && serials.length) throw new InputError('Este producto no tiene unidades serializadas en stock.')
          if (serials.length !== quantity) {
            if (trackedUnitCount === 0) {
              // Producto sin unidades serializadas: se vende por cantidad, sin IMEI.
            } else {
              // Venta sobre pedido: sin stock disponible, el cliente reserva y
              // el IMEI se completa al entregar.
              const available = await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: product.id, status: 'AVAILABLE' } })
              if (available > 0) throw new InputError('Seleccioná el IMEI/serial exacto de cada equipo antes de vender.')
              serialsPending = quantity - serials.length
            }
          }
          if (serials.length) {
            const now = new Date()
            await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: product.id, status: 'RESERVED', reservedUntil: { lte: now } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: product.id, branchId, serial: { in: serials }, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, select: { id: true, serial: true } })
            if (units.length !== serials.length) throw new InputError('Uno o más IMEI/seriales ya no están disponibles para esta venta.', 409)
            const changed = await tx.inventoryUnit.updateMany({ where: { id: { in: units.map(unit => unit.id) }, tenantId: tenant, productId: product.id, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, data: { status: 'SOLD', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            if (changed.count !== units.length) throw new InputError('Uno o más IMEI/seriales cambiaron de estado. Intentá de nuevo.', 409)
            soldUnits.push(...units.map(unit => ({ ...unit, productId: product.id })))
          }
          // Solo los equipos realmente entregados descuentan stock; el tramo
          // "sobre pedido" no tiene existencia física que descontar.
          const decrementBy = quantity - serialsPending
          if (decrementBy > 0) await changeStock(tx, { tenantId: tenant, productId: product.id, delta: -decrementBy, branchId, includeBranchless: true, message: 'Stock insuficiente o producto fuera de la sucursal.' })
        }
        const discountPyg = item.discountPyg === undefined || item.discountPyg === '' || item.discountPyg === null ? 0 : Number(item.discountPyg)
        const discountPct = item.discountPct === undefined || item.discountPct === '' || item.discountPct === null ? undefined : Number(item.discountPct)
        let lineDiscount = 0; let lineTotal = 0
        try {
          const priced = lineDiscountFor({ quantity, unitPricePyg: price, discountPyg, discountPct })
          lineDiscount = priced.discountPyg; lineTotal = priced.totalPyg
        } catch (pricingError) { throw new InputError(pricingError instanceof Error ? pricingError.message : 'Descuento inválido.') }
        const line = quantity * price
        subtotal += lineTotal
        if (!Number.isSafeInteger(subtotal)) throw new Error('Total fuera de rango seguro.')
        normalized.push({ productId: item.productId || undefined, description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : 'Producto', quantity, unitPricePyg: price, ...(unitCostPyg === undefined ? {} : { unitCostPyg }), ...(baseUnitCostPyg === undefined ? {} : { baseUnitCostPyg }), insurancePyg, extraCostPyg, soldWithoutInsurance, serials, serialsPending, costPending, discountPyg: lineDiscount, ...(discountPct !== undefined ? { discountPct } : {}), totalPyg: lineTotal, ...(promotion ? { promotionSnapshot: promotion.promotionSnapshot } : {}) })
      }
      if (discount > subtotal) throw new Error('El descuento no puede superar el subtotal.')
      const total = subtotal - discount + delivery
      if (!safeInt(subtotal) || !safeInt(total)) throw new Error('Total inválido.')
      // Venta a crédito: plazo y límite del cliente (control de mora).
      let dueAt: Date | null = null; let creditDays: number | null = null; let creditLimit: number | null = null
      if (body.creditDays !== undefined || body.dueAt !== undefined) {
        const customerRow = customerId ? await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { creditLimitPyg: true, creditDays: true } }) : null
        if (!customerRow?.creditLimitPyg) throw new InputError('El cliente no tiene límite de crédito habilitado. Configuralo en Clientes.')
        creditLimit = customerRow.creditLimitPyg
        const requestedDays = body.creditDays !== undefined ? Number(body.creditDays) : (customerRow.creditDays ?? undefined)
        if (requestedDays !== undefined && (!safeInt(requestedDays) || requestedDays > 365)) throw new InputError('El plazo de crédito debe estar entre 0 y 365 días.')
        creditDays = requestedDays ?? null
        dueAt = body.dueAt !== undefined && typeof body.dueAt === 'string' && body.dueAt.trim() ? new Date(body.dueAt.trim()) : new Date(Date.now() + (requestedDays ?? 0) * 86400000)
        if (Number.isNaN(dueAt.getTime())) throw new InputError('Vencimiento de crédito inválido.')
      }
      let confirmed = 0
      const normalizedPayments = []
      for (const payment of payments) {
        const normalizedPayment = await normalizePayment(tx, tenant, payment)
        normalizedPayments.push(normalizedPayment)
        const amount = normalizedPayment.amountPyg; const status = normalizedPayment.status
        if (status === 'CONFIRMED') { confirmed += amount; if (!Number.isSafeInteger(confirmed) || confirmed > total) throw new Error('Los pagos superan el total.') }
      }
      // Límite de crédito: pendiente histórico + lo nuevo a crédito ≤ límite.
      if (creditLimit !== null && customerId) {
        const outstanding = await tx.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(o."totalPyg" - COALESCE(p.confirmed, 0)), 0)::bigint AS total
          FROM "Order" o
          LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${tenant} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
          WHERE o."tenantId" = ${tenant} AND o."customerId" = ${customerId} AND o."status" = 'PENDING'`
        const pendingTotal = Number(outstanding[0]?.total || 0n)
        if (!Number.isSafeInteger(pendingTotal) || pendingTotal + (total - confirmed) > creditLimit) throw new InputError('Supera el límite de crédito del cliente.', 409)
      }
      const order = await tx.order.create({ data: { tenantId: tenant, branchId, customerId, sellerId: session.user.id, orderNumber: typeof body.orderNumber === 'string' && body.orderNumber ? textInput(body.orderNumber, 'Número de orden', 100) : `MOB-${Date.now()}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`, idempotencyKey, subtotalPyg: subtotal, discountPyg: discount as number, deliveryPyg: delivery as number, deliveryType: cleanText(body.deliveryType, 'Tipo de entrega', 100), deliveryNotes: cleanText(body.deliveryNotes, 'Observaciones de entrega', 2000), ...(billingName === undefined ? {} : { billingName }), ...(billingDocument === undefined ? {} : { billingDocument }), ...(orderNotes === null ? {} : { notes: orderNotes }), ...(dueAt ? { dueAt } : {}), ...(creditDays !== null ? { creditDays } : {}), totalPyg: total, status: confirmed >= total ? 'COMPLETED' : 'PENDING', items: { create: normalized } } })
      if (discount > 0) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DISCOUNT_APPROVED', entity: 'Order', entityId: order.id, metadata: { discountPyg: discount, subtotalPyg: subtotal, approvedRole: session.user.role } } })
      if (soldUnits.length) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNITS_SOLD', entity: 'Order', entityId: order.id, metadata: { serials: soldUnits.map(unit => unit.serial), productIds: [...new Set(soldUnits.map(unit => unit.productId))] } } })
      for (const { tradeIn, ...paymentData } of normalizedPayments) {
        const payment = await tx.payment.create({ data: { ...paymentData, tenantId: tenant, orderId: order.id } })
        await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
      }
      // Garantía automática: registra la cobertura de cada equipo serializado
      // (días del producto o por condición) para que el cliente la vea por QR.
      if (branchId) {
        const customerName = order.customerId ? (await tx.customer.findUnique({ where: { id: order.customerId }, select: { name: true } }))?.name || 'Consumidor final' : 'Consumidor final'
        const coverageItems = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { id: true, productId: true, description: true, serials: true } })
        for (const item of coverageItems) {
          const serials = Array.isArray(item.serials) ? item.serials as string[] : []
          if (!serials.length || !item.productId) continue
          const product = await tx.product.findUnique({ where: { id: item.productId }, select: { condition: true, warrantyDays: true, warrantyCoverage: true, warrantyExclusions: true } })
          const days = warrantyDaysFor({ condition: product?.condition, warrantyDays: product?.warrantyDays })
          if (!days) continue
          for (const serial of serials) {
            const exists = await tx.warrantyCase.findFirst({ where: { tenantId: tenant, serial, kind: 'COVERAGE' }, select: { id: true } })
            if (exists) continue
            const id = randomUUID(); const now = new Date()
            await tx.warrantyCase.create({ data: {
              id, tenantId: tenant, branchId, orderItemId: item.id, kind: 'COVERAGE', customerName, serial,
              description: item.description || 'Garantía de compra', status: 'RECEIVED',
              publicToken: randomUUID(), warrantyDays: days, expiresAt: new Date(now.getTime() + days * 86400000),
              coverage: product?.warrantyCoverage || 'Defectos de fábrica del equipo.',
              exclusions: product?.warrantyExclusions || 'Daños físicos, humedad, reparaciones de terceros y desgaste por uso.',
            } })
          }
        }
      }
      // Espejo indexado de seriales (aunque la venta no tenga sucursal).
      const serialItems = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { id: true, serials: true } })
      await syncOrderItemSerials(tx, serialItems)
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetail })
    })
    return json(result, { status: 201 })
  } catch (e) {
    // Dos reintentos concurrentes con la misma clave: el segundo choca con el
    // índice único; se devuelve entonces la orden que ganó la carrera.
    if (idempotencyKey && (e as { code?: string })?.code === 'P2002') {
      try {
        const previous = await prisma.order.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } }, include: orderDetail })
        if (previous) return json(previous)
      } catch { /* cae al error genérico */ }
    }
    return error(e instanceof Error ? e.message : 'No se pudo crear la venta.', e instanceof InputError ? e.status : 409)
  }
}
