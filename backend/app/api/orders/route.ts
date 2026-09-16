import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, normalizePayment, objectInput, receiveTradeIn, textInput } from '../../../lib/payment-input'
import { quotePromotion } from '../../../lib/promotions'
import { canApproveOrderDiscount } from '../../../lib/orders'

const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
const cleanText = (value: unknown, field: string, max: number) => value === undefined ? undefined : textInput(value, field, max)
const serialKey = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '').replace(/^MOBOS:/i, '') : ''

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
  return json(await prisma.order.findMany({ where, include: { items: true, payments: true, customer: true, seller: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
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
      let subtotal = 0; const normalized: Array<{ productId?: string; description: string; quantity: number; unitPricePyg: number; totalPyg: number; unitCostPyg?: number; baseUnitCostPyg?: number; insurancePyg: number; extraCostPyg: number; soldWithoutInsurance: boolean; serials: string[]; promotionSnapshot?: any }> = []
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
        let unitCostPyg: number | undefined; let baseUnitCostPyg: number | undefined; let insurancePyg = 0; let extraCostPyg = 0
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
          const trackedUnitCount = await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: product.id } })
          if (trackedUnitCount > 0 && serials.length !== quantity) throw new InputError('Seleccioná el IMEI/serial exacto de cada equipo antes de vender.')
          if (trackedUnitCount === 0 && serials.length) throw new InputError('Este producto no tiene unidades serializadas en stock.')
          if (serials.length) {
            const now = new Date()
            await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: product.id, status: 'RESERVED', reservedUntil: { lte: now } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: product.id, branchId, serial: { in: serials }, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, select: { id: true, serial: true } })
            if (units.length !== serials.length) throw new InputError('Uno o más IMEI/seriales ya no están disponibles para esta venta.', 409)
            const changed = await tx.inventoryUnit.updateMany({ where: { id: { in: units.map(unit => unit.id) }, tenantId: tenant, productId: product.id, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, data: { status: 'SOLD', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            if (changed.count !== units.length) throw new InputError('Uno o más IMEI/seriales cambiaron de estado. Intentá de nuevo.', 409)
            soldUnits.push(...units.map(unit => ({ ...unit, productId: product.id })))
          }
          const updated = await tx.product.updateMany({ where: { id: product.id, tenantId: tenant, isActive: true, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }), stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })
          if (!updated.count) throw new Error('Stock insuficiente o producto fuera de la sucursal.')
        }
        const line = quantity * price; subtotal += line
        if (!Number.isSafeInteger(subtotal)) throw new Error('Total fuera de rango seguro.')
        normalized.push({ productId: item.productId || undefined, description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : 'Producto', quantity, unitPricePyg: price, ...(unitCostPyg === undefined ? {} : { unitCostPyg }), ...(baseUnitCostPyg === undefined ? {} : { baseUnitCostPyg }), insurancePyg, extraCostPyg, soldWithoutInsurance, serials, totalPyg: line, ...(promotion ? { promotionSnapshot: promotion.promotionSnapshot } : {}) })
      }
      if (discount > subtotal) throw new Error('El descuento no puede superar el subtotal.')
      const total = subtotal - discount + delivery
      if (!safeInt(subtotal) || !safeInt(total)) throw new Error('Total inválido.')
      let confirmed = 0
      const normalizedPayments = []
      for (const payment of payments) {
        const normalizedPayment = await normalizePayment(tx, tenant, payment)
        normalizedPayments.push(normalizedPayment)
        const amount = normalizedPayment.amountPyg; const status = normalizedPayment.status
        if (status === 'CONFIRMED') { confirmed += amount; if (!Number.isSafeInteger(confirmed) || confirmed > total) throw new Error('Los pagos superan el total.') }
      }
      const order = await tx.order.create({ data: { tenantId: tenant, branchId, customerId, sellerId: session.user.id, orderNumber: typeof body.orderNumber === 'string' && body.orderNumber ? textInput(body.orderNumber, 'Número de orden', 100) : `MOB-${Date.now()}`, subtotalPyg: subtotal, discountPyg: discount as number, deliveryPyg: delivery as number, deliveryType: cleanText(body.deliveryType, 'Tipo de entrega', 100), deliveryNotes: cleanText(body.deliveryNotes, 'Observaciones de entrega', 2000), totalPyg: total, status: confirmed >= total ? 'COMPLETED' : 'PENDING', items: { create: normalized } } })
      if (discount > 0) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DISCOUNT_APPROVED', entity: 'Order', entityId: order.id, metadata: { discountPyg: discount, subtotalPyg: subtotal, approvedRole: session.user.role } } })
      if (soldUnits.length) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNITS_SOLD', entity: 'Order', entityId: order.id, metadata: { serials: soldUnits.map(unit => unit.serial), productIds: [...new Set(soldUnits.map(unit => unit.productId))] } } })
      for (const { tradeIn, ...paymentData } of normalizedPayments) {
        const payment = await tx.payment.create({ data: { ...paymentData, tenantId: tenant, orderId: order.id } })
        await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
      }
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true, customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } }, seller: { select: { id: true, name: true } } } })
    })
    return json(result, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear la venta.', e instanceof InputError ? e.status : 409) }
}
