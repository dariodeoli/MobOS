import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, normalizePayment, objectInput, receiveTradeIn, textInput } from '../../../lib/payment-input'
import { resolveInsuranceRate } from '../../../lib/insurance'
import { quotePromotion } from '../../../lib/promotions'
import { canApproveOrderDiscount } from '../../../lib/orders'
import { consumeAuthorization, usableAuthorization, DEFAULT_BELOW_LIST_PCT } from '../../../lib/authorizations'
import { armarComprobante } from '../../../lib/orders'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { serialKey } from '../../../lib/validation'
import { lineDiscount as lineDiscountFor, warrantyDaysFor, resolveUnitPrice, unitPricePygFallback, PricingError } from '../../../lib/pricing'
import { changeStock } from '../../../lib/stock'
import { syncOrderItemSerials } from '../../../lib/order-serials'
import { esCodigoDuplicado, nextOrderNumber } from '../../../lib/order-number'

// Detalle devuelto tanto al crear como al reutilizar una orden idempotente.
const orderDetail = Prisma.validator<Prisma.OrderInclude>()({
  items: true,
  payments: true,
  customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
  seller: { select: { id: true, name: true } },
  tenant: { select: { name: true, address: true, city: true, department: true, phone: true, ruc: true, email: true } },
  branch: { select: { name: true, address: true, city: true, department: true, phone: true, instagram: true } },
})

const INT_MAX = 2147483647
const safeInt = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= INT_MAX
// Repuestos/arreglos detectados en la inspección PhoneCheck (#240): el costo
// cargado en la unidad suma al costo real del equipo para margen y seguro
// (#148 §19), junto con lo que ya tenía cargado la unidad.
const costoRepuestosDeInspection = (inspection: unknown): number => {
  const valor = Number((inspection as { costoRepuestosPyg?: unknown } | null)?.costoRepuestosPyg)
  return Number.isSafeInteger(valor) && valor > 0 ? valor : 0
}
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

// Filtros del listado: misma semántica que el filtrado del cliente, resuelta
// en el servidor sobre TODOS los pedidos del alcance del usuario.
const FILTROS_PEDIDOS = new Set(['activos', 'nopagados', 'pendientes', 'parciales', 'credito', 'archivados', 'todos'])

// Patrón LIKE literal: % y _ del texto buscado no actúan como comodines.
const patronLike = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`

// Comparación de texto sin acentos ni mayúsculas (espejo de normalizarBusqueda
// del cliente) sin depender de extensiones de PostgreSQL.
const textoNormalizado = (expresion: string, valor: string) =>
  Prisma.sql`translate(lower(${Prisma.raw(expresion)}), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc') ILIKE ${patronLike(valor)}`

// Clave alfanumérica: tolera separadores (#, -, espacios) en códigos y seriales.
const textoAlfanumerico = (expresion: string, valor: string) =>
  Prisma.sql`regexp_replace(lower(${Prisma.raw(expresion)}), '[^a-z0-9]', '', 'g') LIKE ${patronLike(valor)}`

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const filtro = params.get('filtro') || 'activos'
  if (!FILTROS_PEDIDOS.has(filtro)) return error('Filtro inválido.')
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100))
  const cursor = params.get('cursor')
  const q = (params.get('q') || '').trim().slice(0, 120)
  // Alcance por rol: VENDEDOR ve lo suyo de su sucursal; CAJERA su sucursal;
  // ADMIN/GERENTE todo el tenant. El repartidor solo lo que tiene asignado
  // (su panel es /api/delivery/orders). Sin sucursal el alcance es NULL.
  const condiciones: Prisma.Sql[] = [Prisma.sql`o."tenantId" = ${tenant}`]
  if (session.user.role === 'REPARTIDOR') {
    condiciones.push(Prisma.sql`o."assignedToId" = ${session.user.id}`)
  } else if (session.user.role === 'VENDEDOR') {
    condiciones.push(Prisma.sql`o."sellerId" = ${session.user.id}`)
    condiciones.push(session.user.branchId ? Prisma.sql`o."branchId" = ${session.user.branchId}` : Prisma.sql`o."branchId" IS NULL`)
  } else if (session.user.role === 'CAJERA') {
    condiciones.push(session.user.branchId ? Prisma.sql`o."branchId" = ${session.user.branchId}` : Prisma.sql`o."branchId" IS NULL`)
  }
  const confirmado = Prisma.sql`COALESCE(p."paid", 0)`
  const esPagado = Prisma.sql`(${confirmado} >= o."totalPyg" AND o."totalPyg" > 0)`
  // "A crédito" tiene prioridad sobre Pagado/Parcial/Pendiente: plazo vigente y
  // saldo pendiente real (los pagos posteriores pueden cancelar el crédito).
  const esCredito = Prisma.sql`(COALESCE(o."creditDays", 0) > 0 AND o."totalPyg" - ${confirmado} > 0)`
  const esCompletado = Prisma.sql`(o."archivedAt" IS NOT NULL OR (${esPagado} AND o."fulfillmentStatus" = 'DELIVERED'))`
  const esCancelado = Prisma.sql`(o."status" = 'CANCELLED')`
  if (filtro === 'activos') condiciones.push(Prisma.sql`NOT ${esCompletado} AND NOT ${esCancelado}`)
  else if (filtro === 'archivados') condiciones.push(esCompletado)
  else if (filtro === 'nopagados') condiciones.push(Prisma.sql`o."totalPyg" - ${confirmado} > 0 AND NOT ${esCancelado}`)
  else if (filtro === 'pendientes') condiciones.push(Prisma.sql`NOT ${esCredito} AND ${confirmado} = 0 AND NOT ${esCancelado}`)
  else if (filtro === 'parciales') condiciones.push(Prisma.sql`NOT ${esCredito} AND ${confirmado} > 0 AND NOT ${esPagado} AND NOT ${esCancelado}`)
  else if (filtro === 'credito') condiciones.push(Prisma.sql`${esCredito} AND NOT ${esCancelado}`)
  if (cursor) {
    // Cursor por tupla (createdAt, id): el orden desempata por id para que
    // páginas consecutivas no repitan ni salteen pedidos del mismo milisegundo.
    const cursorRow = await prisma.order.findFirst({ where: { id: cursor, tenantId: tenant }, select: { createdAt: true } })
    if (!cursorRow) return json([])
    condiciones.push(Prisma.sql`(o."createdAt" < ${cursorRow.createdAt} OR (o."createdAt" = ${cursorRow.createdAt} AND o."id" < ${cursor}))`)
  }
  if (q) {
    const qFold = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const qCodigo = qFold.replace(/[^a-z0-9]/g, '')
    const qDigitos = qFold.replace(/\D/g, '')
    const soloDigitos = qDigitos.length > 0 && /^[\d\s.,-]+$/.test(qFold)
    const texto = patronLike(q); const textoFold = patronLike(qFold)
    const seriales: Prisma.Sql[] = [Prisma.sql`s."serial" ILIKE ${texto}`]
    if (qCodigo) seriales.push(textoAlfanumerico('s."serial"', qCodigo))
    const coincidencias: Prisma.Sql[] = [
      Prisma.sql`o."orderNumber" ILIKE ${texto}`,
      textoNormalizado('o."billingName"', qFold),
      textoNormalizado('o."billingDocument"', qFold),
      textoNormalizado('o."notes"', qFold),
      textoNormalizado('c."name"', qFold),
      textoNormalizado('c."phone"', qFold),
      textoNormalizado('c."email"', qFold),
      textoNormalizado('c."document"', qFold),
      textoNormalizado('c."billingName"', qFold),
      textoNormalizado('c."billingDocument"', qFold),
      Prisma.sql`o."tags"::text ILIKE ${textoFold}`,
      Prisma.sql`o."totalPyg"::text ILIKE ${textoFold}`,
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o."id" AND ${textoNormalizado('oi."description"', qFold)})`,
      // Producto/modelo/variante del catálogo: la descripción del ítem queda
      // congelada al vender, así que además se busca contra la ficha viva.
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderItem" oip JOIN "Product" pr ON pr."id" = oip."productId" WHERE oip."orderId" = o."id" AND (${textoNormalizado('pr."name"', qFold)} OR ${textoNormalizado('pr."model"', qFold)} OR ${textoNormalizado('pr."color"', qFold)} OR ${textoNormalizado('pr."capacity"', qFold)}))`,
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderItem" oi2 JOIN "OrderItemSerial" s ON s."orderItemId" = oi2."id" WHERE oi2."orderId" = o."id" AND (${Prisma.join(seriales, ' OR ')}))`,
    ]
    if (qCodigo) coincidencias.push(textoAlfanumerico('o."orderNumber"', qCodigo))
    if (soloDigitos) coincidencias.push(Prisma.sql`o."totalPyg"::text LIKE ${patronLike(qDigitos)}`)
    // Teléfono y documento con separadores ("0981-123-456"): se comparan solo
    // los dígitos de ambos lados.
    if (qDigitos.length >= 4) {
      coincidencias.push(Prisma.sql`regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g') LIKE ${patronLike(qDigitos)}`)
      coincidencias.push(Prisma.sql`regexp_replace(COALESCE(c."document", ''), '[^0-9]', '', 'g') LIKE ${patronLike(qDigitos)}`)
      coincidencias.push(Prisma.sql`regexp_replace(COALESCE(o."billingDocument", ''), '[^0-9]', '', 'g') LIKE ${patronLike(qDigitos)}`)
    }
    condiciones.push(Prisma.sql`(${Prisma.join(coincidencias, ' OR ')})`)
  }
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT o."id"
    FROM "Order" o
    LEFT JOIN "Customer" c ON c."id" = o."customerId"
    LEFT JOIN (
      SELECT "orderId", SUM("amountPyg") AS paid
      FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED'
      GROUP BY "orderId"
    ) p ON p."orderId" = o."id"
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY o."createdAt" DESC, o."id" DESC
    LIMIT ${limit}
  `)
  if (!ids.length) return json([])
  // Segunda consulta con el include de siempre; el orden lo fija la lista de
  // ids para conservar la paginación por cursor.
  const rows = await prisma.order.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: { items: true, payments: true, customer: true, seller: { select: { id: true, name: true } } } })
  const porId = new Map(rows.map((row) => [row.id, row]))
  return json(ids.map((row) => porId.get(row.id)).filter(Boolean))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const limited = enforceRateLimit(request, 'orders', 120, 60_000)
  if (limited) return limited
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  // Enlace de seguimiento del pedido: aleatorio de 64 hex. Nace como enlace de
  // nivel rápido del pedido (listable, revocable y rotable desde el panel) y la
  // creación lo devuelve para imprimirlo o compartirlo al entregar (#178).
  const publicToken = randomBytes(32).toString('hex')
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
  // Venta cargada sin conexión (POS offline-first): el stock local puede estar
  // viejo. Con esta marca se permite la venta, se descuenta solo lo disponible y
  // el pedido queda señalado para revisión. El modo online no la envía.
  if (body.offline !== undefined && typeof body.offline !== 'boolean') throw new InputError('offline debe ser verdadero o falso.')
  const offlineSale = body.offline === true
  let stockFaltante = 0
  let sinImeiOffline = 0
  // Se permite customerId + customer para actualizar los datos de contacto de
  // una ficha ya elegida (correo/teléfono que el vendedor corrigió en el POS):
  // en ese caso el objeto customer no lleva nombre.
  if (body.customerId !== undefined && body.customer !== undefined && objectInput(body.customer).name !== undefined) throw new InputError('Enviá customerId o customer, no ambos.')
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
    customer = { name: input.name === undefined ? '' : textInput(input.name, 'Nombre', 200),
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
  // Descuento fuera de política: el vendedor necesita una autorización DISCOUNT
  // aprobada, vigente (24 h), sin usar y que alcance para el monto de esta venta.
  const canDiscount = canApproveOrderDiscount(session.user)
  let discountAuthorization: { id: string; maxDiscountPyg: number } | null = null
  if (discount > 0 && !canDiscount) {
    const rawAuthorizationId = body.discountAuthorizationId
    if (rawAuthorizationId === undefined || rawAuthorizationId === null || rawAuthorizationId === '') throw new InputError('Tu rol no puede aprobar descuentos. Solicitá autorización a gerencia desde el carrito.', 403)
    const authorizationId = textInput(rawAuthorizationId, 'discountAuthorizationId', 200)
    const authorization = await prisma.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant, kind: 'DISCOUNT' } })
    discountAuthorization = usableAuthorization(authorization, { userId: session.user.id, kinds: ['DISCOUNT'], label: 'descuento' })
    if (discount > discountAuthorization.maxDiscountPyg) {
      throw new InputError(`La autorización no alcanza para este descuento (máx Gs ${discountAuthorization.maxDiscountPyg.toLocaleString('es-PY')}). Solicitá una nueva.`, 403)
    }
  }
  // Precio por debajo de lista: misma regla de un solo uso, con la autorización
  // de tipo BELOW_LIST_PRICE que pida el vendedor desde el carrito. Se valida
  // acá para fallar temprano y se consume dentro de la transacción. Hasta el
  // porcentaje configurado por la empresa (default 10%) no pide autorización.
  const limitesEmpresa = await prisma.tenant.findUnique({ where: { id: tenant }, select: { belowListPct: true, loyaltyPct: true, insurancePct: true } })
  const belowListPct = Number(limitesEmpresa?.belowListPct ?? DEFAULT_BELOW_LIST_PCT)
  const insurancePct = Math.min(100, Math.max(0, Number(limitesEmpresa?.insurancePct ?? 0)))
  // Fidelización: 0 (default) la deja apagada y la venta no cambia en nada.
  const loyaltyPct = Math.min(100, Math.max(0, Number(limitesEmpresa?.loyaltyPct ?? 0)))
  let priceAuthorization: { id: string; maxDiscountPyg: number } | null = null
  if (!canDiscount) {
    const rawPriceAuthorizationId = body.priceAuthorizationId
    if (rawPriceAuthorizationId !== undefined && rawPriceAuthorizationId !== null && rawPriceAuthorizationId !== '') {
      const authorizationId = textInput(rawPriceAuthorizationId, 'priceAuthorizationId', 200)
      const authorization = await prisma.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant, kind: 'BELOW_LIST_PRICE' } })
      priceAuthorization = usableAuthorization(authorization, { userId: session.user.id, kinds: ['BELOW_LIST_PRICE'], label: 'precio' })
    }
  }
  if (discount > 0 && items.some(item => item?.couponCode !== undefined)) throw new InputError('No se puede combinar cupón y descuento global.')
    const crearPedido = () => prisma.$transaction(async tx => {
      const branchId = session.user.branchId
      if (branchId && !await tx.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } })) throw new Error('Sucursal no encontrada.')
      let customerId = selectedCustomerId
      let pricingTier = 'RETAIL'
      let priceListId: string | null = null
      // Seguro del cliente (#160): el toggle y su porcentaje viajan con la
      // venta para que el costo real incluya el seguro.
      let customerInsurance: { enabled: boolean; ratePct: number | null } = { enabled: false, ratePct: null }
      if (customerId) {
        const selectedCustomer = await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true, pricingTier: true, priceListId: true, insuranceEnabled: true, insuranceRatePct: true } })
        if (!selectedCustomer) throw new Error('Cliente no encontrado.')
        pricingTier = selectedCustomer.pricingTier || 'RETAIL'
        priceListId = selectedCustomer.priceListId
        customerInsurance = { enabled: selectedCustomer.insuranceEnabled === true, ratePct: selectedCustomer.insuranceRatePct === null ? null : Number(selectedCustomer.insuranceRatePct) }
      }
      if (customerId && customer && !customer.name) {
        // Contacto editado sobre una ficha ya elegida: se actualiza lo que el
        // vendedor cargó (correo/teléfono) sin tocar el resto de la ficha.
        await tx.customer.update({ where: { id: customerId }, data: {
          ...(customer.email ? { email: customer.email } : {}),
          ...(customer.phone ? { phone: customer.phone } : {}),
        } })
      }
      if (customer && !customerId) {
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
      // Si el cliente se resolvió/creó por nombre, el precio del cliente (tipo
      // y lista) se relee por su id final antes de congelar los precios.
      if (customerId && customerId !== selectedCustomerId) {
        const resuelto = await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { pricingTier: true, priceListId: true, insuranceEnabled: true, insuranceRatePct: true } })
        if (resuelto) {
          pricingTier = resuelto.pricingTier || 'RETAIL'
          priceListId = resuelto.priceListId
          customerInsurance = { enabled: resuelto.insuranceEnabled === true, ratePct: resuelto.insuranceRatePct === null ? null : Number(resuelto.insuranceRatePct) }
        }
      }
      const priceList = priceListId
        ? await tx.priceList.findFirst({ where: { id: priceListId, tenantId: tenant, isActive: true }, include: { items: { include: { tiers: { orderBy: { minQty: 'asc' } } } } } })
        : null
      // La factura a otro titular queda en la ficha del cliente: la próxima
      // venta la propone y la búsqueda puede encontrar por esa razón social.
      if (customerId && (billingName || billingDocument)) {
        await tx.customer.update({ where: { id: customerId }, data: { ...(billingName ? { billingName } : {}), ...(billingDocument ? { billingDocument } : {}) } })
        if (billingName) {
          const identidad = await tx.customerBillingIdentity.findFirst({ where: { customerId, name: billingName, document: billingDocument || null }, select: { id: true } })
          if (identidad) await tx.customerBillingIdentity.update({ where: { id: identidad.id }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } })
          else await tx.customerBillingIdentity.create({ data: { tenantId: tenant, customerId, name: billingName, document: billingDocument || null, uses: 1 } })
        }
      }
      // Identidad de facturación reutilizable: se guarda para poder volver a
      // facturar a ese titular sin tipearlo de nuevo. Con datos incompletos no
      // se guarda (no se rompe la venta).
      if (customerId && billingName && billingDocument) {
        await tx.customerBillingIdentity.upsert({
          where: { tenantId_customerId_document: { tenantId: tenant, customerId, document: billingDocument } },
          update: { name: billingName },
          create: { tenantId: tenant, customerId, name: billingName, document: billingDocument, createdById: session.user.id },
        })
      }
      let subtotal = 0; const normalized: Array<{ productId?: string; description: string; quantity: number; unitPricePyg: number; listPricePyg?: number; priceSource?: string; priceListId?: string; totalPyg: number; discountPyg: number; discountPct?: number; unitCostPyg?: number; baseUnitCostPyg?: number; insurancePyg: number; extraCostPyg: number; soldWithoutInsurance: boolean; serials: string[]; serialsPending: number; costPending: boolean; promotionSnapshot?: any; comboId?: string; comboName?: string }> = []
      const soldUnits: Array<{ id: string; serial: string; productId: string }> = []
      const serialsInOrder = new Set<string>()
      // Diferencia acumulada entre precio de lista y precio cargado (venta bajo
      // lista): es lo que debe cubrir la autorización BELOW_LIST_PRICE. La base
      // (lista × cantidad de las líneas rebajadas) mide el porcentaje permitido.
      let belowListPyg = 0
      let belowListBasePyg = 0
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
        // Combo: la línea puede recordar de qué combo salió. Se valida contra la
        // empresa y se congela el nombre para que el reporte no dependa del combo vivo.
        let comboId: string | undefined; let comboName: string | undefined
        if (item.comboId !== undefined && item.comboId !== null && item.comboId !== '') {
          comboId = textInput(item.comboId, 'comboId', 200)
          const combo = await tx.combo.findFirst({ where: { id: comboId, tenantId: tenant }, select: { name: true } })
          if (!combo) throw new InputError('El combo de la línea no pertenece a esta empresa.', 404)
          comboName = combo.name
        } else if (item.comboName !== undefined && item.comboName !== null && item.comboName !== '') {
          comboName = textInput(item.comboName, 'comboName', 200)
        }
        let unitCostPyg: number | undefined; let baseUnitCostPyg: number | undefined; let listPricePyg: number | undefined; let priceSource: string | undefined; let insurancePyg = 0; let extraCostPyg = 0; let costPending = false; let serialsPending = 0
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
          // Costo real por unidad (#148 §19): costo de la unidad + lo que se le
          // paga al consignador al venderla (#33) + repuestos/arreglos de la
          // inspección PhoneCheck (#240). Si la unidad no tiene costo propio ni
          // consignación, vale el costo del producto; si no hay ninguno, la
          // línea queda con costo pendiente (no se inventa un costo).
          if (serials.length && serials.length === quantity) {
            const unidades = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: product.id, serial: { in: serials } }, select: { costPyg: true, consignorPyg: true, inspection: true } })
            if (unidades.length === serials.length) {
              const bases = unidades.map((unidad) => {
                const repuestos = costoRepuestosDeInspection(unidad.inspection)
                const consignacion = Number(unidad.consignorPyg ?? 0)
                if (unidad.costPyg !== null && unidad.costPyg !== undefined) return Number(unidad.costPyg) + consignacion + repuestos
                if (Number.isSafeInteger(consignacion) && consignacion > 0) return consignacion + repuestos
                return product.costPyg === null || product.costPyg === undefined ? null : Number(product.costPyg) + repuestos
              })
              if (bases.every((valor) => valor !== null)) {
                const costoPorUnidad = Math.round((bases as number[]).reduce((suma, valor) => suma + valor, 0) / bases.length)
                if (!safeInt(costoPorUnidad)) throw new InputError('El costo real de la unidad (con consignación y repuestos) supera el máximo permitido.')
                baseUnitCostPyg = costoPorUnidad
              }
            }
          }
          // Precio de lista congelado: la lista del cliente (escalón/ítem),
          // el mayorista o el minorista, con la misma autoridad que
          // /api/pricing. Un precio en USD no cotiza en guaraníes: la línea
          // conserva el precio retail como referencia (mismo helper que el
          // endpoint, issue #79).
          const resolvedPrice = resolveUnitPrice({ product, quantity, customer: { pricingTier }, priceList })
          listPricePyg = unitPricePygFallback(resolvedPrice, product.pricePyg)
          priceSource = resolvedPrice.origin
          // El precio de cupón ya viene cotizado por el servidor: no cuenta
          // como venta bajo lista discrecional.
          if (item.couponCode === undefined && price < listPricePyg) {
            const gap = (listPricePyg - price) * quantity
            if (!Number.isSafeInteger(gap)) throw new Error('Diferencia bajo lista fuera de rango.')
            belowListPyg += gap
            belowListBasePyg += listPricePyg * quantity
            if (!Number.isSafeInteger(belowListPyg) || !Number.isSafeInteger(belowListBasePyg)) throw new Error('Diferencia bajo lista fuera de rango.')
          }
          const policy = product.category ? await tx.costPolicy.findFirst({ where: { tenantId: tenant, category: product.category, isActive: true }, select: { insuranceRate: true } }) : null
          // Precedencia de la tasa (#160): producto > seguro del cliente (con
          // el default de la empresa) > política por categoría.
          const rate = resolveInsuranceRate({
            productRate: product.insuranceRate,
            customerEnabled: customerInsurance.enabled,
            customerRate: customerInsurance.ratePct,
            categoryRate: policy?.insuranceRate,
            companyDefaultPct: insurancePct,
          })
          // Base de cálculo de FIN (#162): el seguro es un porcentaje del costo
          // del producto; costo real = costo + seguro.
          if (!soldWithoutInsurance && rate > 0 && baseUnitCostPyg !== undefined) {
            insurancePyg = Math.round((baseUnitCostPyg * rate) / 100)
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
              if (available > 0 && !offlineSale) throw new InputError('Seleccioná el IMEI/serial exacto de cada equipo antes de vender.')
              // Venta offline sin IMEI: queda como sobre pedido (el IMEI se
              // asigna al entregar) y se cuenta para la revisión.
              if (available > 0 && offlineSale) sinImeiOffline += quantity - serials.length
              serialsPending = quantity - serials.length
            }
          }
          if (serials.length) {
            const now = new Date()
            await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: product.id, status: 'RESERVED', reservedUntil: { lte: now } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservationCustomerId: null, reservedById: null } })
            const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: product.id, branchId, serial: { in: serials }, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, select: { id: true, serial: true } })
            if (units.length !== serials.length) throw new InputError('Uno o más IMEI/seriales ya no están disponibles para esta venta.', 409)
            const changed = await tx.inventoryUnit.updateMany({ where: { id: { in: units.map(unit => unit.id) }, tenantId: tenant, productId: product.id, OR: [{ status: 'AVAILABLE' }, { status: 'RESERVED', reservedById: session.user.id, reservedUntil: { gt: now } }] }, data: { status: 'SOLD', reservedUntil: null, reservationCustomer: null, reservationCustomerId: null, reservedById: null } })
            if (changed.count !== units.length) throw new InputError('Uno o más IMEI/seriales cambiaron de estado. Intentá de nuevo.', 409)
            soldUnits.push(...units.map(unit => ({ ...unit, productId: product.id })))
          }
          // Solo los equipos realmente entregados descuentan stock; el tramo
          // "sobre pedido" no tiene existencia física que descontar.
          const decrementBy = quantity - serialsPending
          if (decrementBy > 0) {
            if (offlineSale) {
              // Stock laxo: se descuenta solo lo disponible (el contador nunca
              // queda negativo) y la diferencia se registra para revisión.
              const disponible = Math.max(0, Number(product.stock || 0))
              const aDescontar = Math.min(disponible, decrementBy)
              if (aDescontar > 0) await changeStock(tx, { tenantId: tenant, productId: product.id, delta: -aDescontar, branchId, includeBranchless: true, message: 'Stock insuficiente o producto fuera de la sucursal.' })
              stockFaltante += decrementBy - aDescontar
            } else {
              await changeStock(tx, { tenantId: tenant, productId: product.id, delta: -decrementBy, branchId, includeBranchless: true, message: 'Stock insuficiente o producto fuera de la sucursal.' })
            }
          }
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
        normalized.push({ productId: item.productId || undefined, description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : 'Producto', quantity, unitPricePyg: price, ...(listPricePyg === undefined ? {} : { listPricePyg }),
          ...(priceSource === undefined ? {} : { priceSource }), ...(priceListId ? { priceListId } : {}), ...(unitCostPyg === undefined ? {} : { unitCostPyg }), ...(baseUnitCostPyg === undefined ? {} : { baseUnitCostPyg }), insurancePyg, extraCostPyg, soldWithoutInsurance, serials, serialsPending, costPending, discountPyg: lineDiscount, ...(discountPct !== undefined ? { discountPct } : {}), totalPyg: lineTotal, ...(promotion ? { promotionSnapshot: promotion.promotionSnapshot } : {}), ...(comboId ? { comboId } : {}), ...(comboName ? { comboName } : {}) })
      }
      if (discount > subtotal) throw new Error('El descuento no puede superar el subtotal.')
      const total = subtotal - discount + delivery
      if (!safeInt(subtotal) || !safeInt(total)) throw new Error('Total inválido.')
      // Venta bajo lista sin permiso de descuento: hasta el porcentaje
      // configurado no pide autorización; el excedente debe estar cubierto por
      // la autorización BELOW_LIST_PRICE vigente.
      const priceAuth = priceAuthorization
      const permitidoBajoLista = Math.floor((belowListBasePyg * belowListPct) / 100)
      const excedenteBajoLista = Math.max(0, belowListPyg - permitidoBajoLista)
      if (belowListPyg > 0 && !canDiscount) {
        if (excedenteBajoLista > 0 && !priceAuth) throw new InputError(`El precio está más de ${belowListPct}% por debajo de lista y tu rol no puede autorizarlo. Solicitá autorización de precio desde el carrito.`, 403)
        if (priceAuth && excedenteBajoLista > priceAuth.maxDiscountPyg) {
          throw new InputError(`La autorización de precio no alcanza para esta venta (excedente bajo lista Gs ${excedenteBajoLista.toLocaleString('es-PY')}, máx Gs ${priceAuth.maxDiscountPyg.toLocaleString('es-PY')}). Solicitá una nueva.`, 403)
        }
      }
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
      // Identificador comercial de la empresa (`PREFIX-#0001`) con el contador
      // transaccional del tenant; un número explícito del cliente manda.
      const orderNumber = typeof body.orderNumber === 'string' && body.orderNumber ? textInput(body.orderNumber, 'Número de orden', 100) : await nextOrderNumber(tx, tenant)

      const order = await tx.order.create({ data: { tenantId: tenant, branchId, customerId, sellerId: session.user.id, orderNumber, idempotencyKey, subtotalPyg: subtotal, discountPyg: discount as number, deliveryPyg: delivery as number, deliveryType: cleanText(body.deliveryType, 'Tipo de entrega', 100), deliveryNotes: cleanText(body.deliveryNotes, 'Observaciones de entrega', 2000), ...(billingName === undefined ? {} : { billingName }), ...(billingDocument === undefined ? {} : { billingDocument }), ...(orderNotes === null ? {} : { notes: orderNotes }), ...(dueAt ? { dueAt } : {}), ...(creditDays !== null ? { creditDays } : {}), ...(offlineSale ? { offlineSyncedAt: new Date() } : {}), totalPyg: total, status: confirmed >= total ? 'COMPLETED' : 'PENDING', items: { create: normalized } } })
      // El enlace de seguimiento se emite como token de nivel rápido del pedido:
      // el panel puede volver a copiarlo y «Regenerar acceso QR» lo rota (#178).
      await tx.orderAccessToken.create({ data: { orderId: order.id, tenantId: tenant, level: 'rapido', token: publicToken, createdBy: session.user.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_CREATED', entity: 'Order', entityId: order.id, metadata: { orderNumber: order.orderNumber, totalPyg: total, items: normalized.length, ...(customerId ? { customerId } : {}), ...(offlineSale ? { offline: true } : {}) } } })
      // POS offline: la venta llegó de la cola local. Queda el rastro de lo que
      // se relajó (stock faltante y equipos sin IMEI) para que se revise.
      if (offlineSale) {
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_OFFLINE_SYNCED', entity: 'Order', entityId: order.id, metadata: { orderNumber: order.orderNumber, stockFaltante, sinImei: sinImeiOffline, totalPyg: total } } })
      }
      // Fidelización: acredita puntos por la venta (1 punto = 1 Gs.) dentro de
      // la misma transacción. Con loyaltyPct en 0 no se toca nada.
      if (loyaltyPct > 0 && order.customerId && total > 0) {
        const pointsPyg = Math.floor((total * loyaltyPct) / 100)
        if (pointsPyg > 0) {
          await tx.loyaltyMovement.create({ data: { tenantId: tenant, customerId: order.customerId, orderId: order.id, kind: 'ACCRUAL', pointsPyg, note: `Venta ${order.orderNumber}`, createdById: session.user.id } })
          await tx.customer.update({ where: { id: order.customerId }, data: { loyaltyPointsPyg: { increment: pointsPyg } } })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'LOYALTY_ACCRUED', entity: 'Customer', entityId: order.customerId, metadata: { orderId: order.id, orderNumber: order.orderNumber, pointsPyg, loyaltyPct, totalPyg: total } } })
        }
      }
      const discountAuth = discountAuthorization
      if (discountAuth) {
        // Consumo atómico: dos ventas concurrentes con la misma autorización no
        // pueden usarla dos veces; la que pierde revierte toda la transacción.
        await consumeAuthorization(tx, { id: discountAuth.id, tenantId: tenant, kinds: ['DISCOUNT'], userId: session.user.id, label: 'descuento', usedByOrderId: order.id })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DISCOUNT_AUTHORIZED', entity: 'Order', entityId: order.id, metadata: { authorizationId: discountAuth.id, maxDiscountPyg: discountAuth.maxDiscountPyg, discountPyg: discount, subtotalPyg: subtotal } } })
      }
      if (priceAuth && excedenteBajoLista > 0) {
        // La autorización de precio se consume una sola vez y deja auditoría
        // del monto bajo lista que cubrió.
        await consumeAuthorization(tx, { id: priceAuth.id, tenantId: tenant, kinds: ['BELOW_LIST_PRICE'], userId: session.user.id, label: 'precio', usedByOrderId: order.id })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_PRICE_AUTHORIZED', entity: 'Order', entityId: order.id, metadata: { authorizationId: priceAuth.id, maxDiscountPyg: priceAuth.maxDiscountPyg, belowListPyg, subtotalPyg: subtotal } } })
      }
      if (discount > 0) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_DISCOUNT_APPROVED', entity: 'Order', entityId: order.id, metadata: { discountPyg: discount, subtotalPyg: subtotal, approvedRole: session.user.role } } })
      if (soldUnits.length) await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNITS_SOLD', entity: 'Order', entityId: order.id, metadata: { serials: soldUnits.map(unit => unit.serial), productIds: [...new Set(soldUnits.map(unit => unit.productId))] } } })
      for (const { tradeIn, ...paymentData } of normalizedPayments) {
        const payment = await tx.payment.create({ data: { ...paymentData, tenantId: tenant, orderId: order.id, createdById: session.user.id, userId: session.user.id } })
        await receiveTradeIn(tx, tradeIn, payment, order, tenant, session.user.id)
      }
      // Comprobante congelado al emitir: queda guardado con los ítems, los pagos
      // y los datos de las partes tal como estaban en esta venta.
      const emitido = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          customer: { select: { name: true, document: true, phone: true, countryCode: true, email: true, billingName: true, billingDocument: true } },
          seller: { select: { name: true } },
          branch: { select: { name: true, address: true, city: true, department: true, phone: true } },
          tenant: { select: { name: true } },
        },
      })
      if (emitido) await tx.order.update({ where: { id: order.id }, data: { receiptSnapshot: armarComprobante(emitido as unknown as Record<string, unknown>) } })
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
              id, tenantId: tenant, branchId, orderItemId: item.id, kind: 'COVERAGE', ...(order.customerId ? { customerId: order.customerId } : {}), customerName, serial,
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
    // El código corto se calcula dentro de la transacción. Si otra venta ganó
    // el número en el medio, se reintenta: la transacción fallida se revirtió
    // entera (stock, pagos y garantías incluidos).
    let result
    for (let intento = 0; ; intento++) {
      try { result = await crearPedido(); break } catch (e) {
        if (intento >= 2 || idempotencyKey || !esCodigoDuplicado(e)) throw e
      }
    }
    // El enlace de seguimiento viaja en la respuesta de creación (y queda como
    // enlace de nivel rápido del pedido, listable y rotable desde el panel).
    return json({ ...result, publicToken }, { status: 201 })
  } catch (e) {
    // Dos reintentos concurrentes con la misma clave: el segundo choca con el
    // índice único; se devuelve entonces la orden que ganó la carrera.
    if (idempotencyKey && (e as { code?: string })?.code === 'P2002') {
      try {
        const previous = await prisma.order.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } }, include: orderDetail })
        if (previous) return json(previous)
      } catch { /* cae al error genérico */ }
    }
    // Un error de precios es de datos (4xx) y se muestra tal cual: la venta no
    // se crea y el vendedor sabe qué corregir (issue #78).
    if (e instanceof PricingError) return error(e.message, 400)
    return error(e instanceof Error ? e.message : 'No se pudo crear la venta.', e instanceof InputError ? e.status : 409)
  }
}
