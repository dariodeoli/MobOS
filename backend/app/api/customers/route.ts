import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// Filtros del listado resueltos en el servidor sobre TODAS las fichas del
// tenant, no solo la página cargada (mismo patrón que Pedidos).
const FILTROS_CLIENTES = new Set(['todos', 'mayoristas', 'minoristas', 'deuda', 'credito', 'sincredito', 'conemail'])

// Patrón LIKE literal: % y _ del texto buscado no actúan como comodines.
const patronLike = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`

function addressesInput(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 10) throw new Error('Podés guardar hasta 10 direcciones.')
  const addresses = value.map((row, index) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const address = clean(item.address, 400)
    if (!address) throw new Error('Cada dirección debe incluir su detalle.')
    return {
      label: clean(item.label, 80) || `Dirección ${index + 1}`,
      address,
      city: clean(item.city, 100) || null,
      department: clean(item.department, 100) || null,
      country: clean(item.country, 100) || 'Paraguay',
      notes: clean(item.notes, 400) || null,
      isDefault: item.isDefault === true,
    }
  })
  return addresses.map((address, index) => ({ ...address, isDefault: address.isDefault || (index === 0 && !addresses.some(item => item.isDefault)) }))
}

function esMayorista(customer: { pricingTier?: string | null }) {
  return customer.pricingTier === 'WHOLESALE'
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const filtro = params.get('filtro') || 'todos'
  if (!FILTROS_CLIENTES.has(filtro)) return error('Filtro inválido.')
  const q = (params.get('q') || '').trim().slice(0, 120)
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100))
  const cursor = params.get('cursor')
  const condiciones: Prisma.Sql[] = [Prisma.sql`c."tenantId" = ${tenant}`]
  if (filtro === 'mayoristas') condiciones.push(Prisma.sql`c."pricingTier" = 'WHOLESALE'`)
  else if (filtro === 'minoristas') condiciones.push(Prisma.sql`c."pricingTier" <> 'WHOLESALE'`)
  else if (filtro === 'credito') condiciones.push(Prisma.sql`COALESCE(c."creditLimitPyg", 0) > 0`)
  else if (filtro === 'sincredito') condiciones.push(Prisma.sql`COALESCE(c."creditLimitPyg", 0) = 0`)
  else if (filtro === 'conemail') condiciones.push(Prisma.sql`c."email" IS NOT NULL AND c."email" <> ''`)
  else if (filtro === 'deuda') condiciones.push(Prisma.sql`EXISTS (
    SELECT 1 FROM "Order" o
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
    WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" = 'PENDING' AND o."totalPyg" - COALESCE(p."paid", 0) > 0
  )`)
  if (cursor) {
    // Cursor por tupla (createdAt, id), igual que Pedidos: páginas consecutivas
    // no repiten ni saltean fichas creadas en el mismo milisegundo.
    const cursorRow = await prisma.customer.findFirst({ where: { id: cursor, tenantId: tenant }, select: { createdAt: true } })
    if (!cursorRow) return json([])
    condiciones.push(Prisma.sql`(c."createdAt" < ${cursorRow.createdAt} OR (c."createdAt" = ${cursorRow.createdAt} AND c."id" < ${cursor}))`)
  }
  if (q) {
    // Búsqueda instantánea por palabras: cada palabra tipeada tiene que aparecer
    // en alguno de los campos (así "perez juan" encuentra a "Juan Pérez").
    // Cubre nombre, teléfono, CI/RUC, correo, datos de facturación vigentes e
    // históricos, ciudad/dirección, etiquetas, notas internas y nota pública.
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6)
    const campos = Prisma.sql`concat_ws(' ', c."name", c."phone", c."document", c."email", c."billingName", c."billingDocument", c."notes", c."publicNote", array_to_string(c."tags", ' '))`
    condiciones.push(Prisma.sql`(${Prisma.join(tokens.map((token) => {
      const patron = patronLike(token)
      return Prisma.sql`(
        ${campos} ILIKE ${patron}
        OR EXISTS (SELECT 1 FROM "CustomerAddress" a WHERE a."customerId" = c."id" AND (a."city" ILIKE ${patron} OR a."address" ILIKE ${patron}))
        OR EXISTS (SELECT 1 FROM "CustomerBillingIdentity" b WHERE b."customerId" = c."id" AND (b."name" ILIKE ${patron} OR b."document" ILIKE ${patron}))
        OR EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND (o."billingName" ILIKE ${patron} OR o."billingDocument" ILIKE ${patron}))
      )`
    }), ' AND ')})`)
  }
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT c."id"
    FROM "Customer" c
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY c."createdAt" DESC, c."id" DESC
    LIMIT ${limit}
  `)
  if (!ids.length) return json([])
  // Segunda consulta con el include de siempre; el orden lo fija la lista de
  // ids para conservar la paginación por cursor.
  const data = await prisma.customer.findMany({ where: { id: { in: ids.map((row) => row.id) } }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } })
  const porId = new Map(data.map((customer) => [customer.id, customer]))
  const ordenados = ids.flatMap((row) => { const customer = porId.get(row.id); return customer ? [customer] : [] })
  const stats = await prisma.order.groupBy({
    by: ['customerId'],
    where: { tenantId: tenant, customerId: { in: ordenados.map((customer) => customer.id) }, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { totalPyg: true },
    _max: { createdAt: true },
  })
  const statsPorCliente = new Map(stats.map((fila) => [fila.customerId, { orders: fila._count._all, totalSpentPyg: fila._sum.totalPyg ?? 0, lastOrderAt: fila._max.createdAt }]))
  return json(ordenados.map((customer) => ({ ...customer, wholesale: esMayorista(customer), stats: statsPorCliente.get(customer.id) || { orders: 0, totalSpentPyg: 0, lastOrderAt: null } })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = await request.json() as Record<string, unknown>
    if (Array.isArray(body.rows)) return importarClientes(tenant, body.rows, session.user.id)
    const name = clean(body.name, 200)
    if (!name) return error('El nombre es obligatorio.')
    const document = clean(body.document, 100) || null
    const phone = clean(body.phone, 100) || null
    const countryCode = typeof body.countryCode === 'string' && /^\+\d{1,4}$/.test(body.countryCode) ? body.countryCode : '+595'
    const tags = Array.isArray(body.tags) ? body.tags.map((tag) => clean(tag, 50)).filter(Boolean).slice(0, 20) : []
    const pricingTier: 'RETAIL' | 'WHOLESALE' = body.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL'
    const priceListId = body.priceListId === undefined ? undefined : (() => {
      const valor = body.priceListId === null ? '' : clean(body.priceListId, 128)
      return valor || null
    })()
    if (priceListId && !await prisma.priceList.findFirst({ where: { id: priceListId, tenantId: tenant, isActive: true }, select: { id: true } })) return error('Lista de precios no encontrada.', 404)
    const creditLimitPyg = body.creditLimitPyg === undefined || body.creditLimitPyg === '' || body.creditLimitPyg === null ? undefined : Number(body.creditLimitPyg)
    if (creditLimitPyg !== undefined && (!Number.isSafeInteger(creditLimitPyg) || creditLimitPyg < 0 || creditLimitPyg > 2147483647)) return error('Límite de crédito inválido.')
    const creditDays = body.creditDays === undefined || body.creditDays === '' || body.creditDays === null ? undefined : Number(body.creditDays)
    if (creditDays !== undefined && (!Number.isSafeInteger(creditDays) || creditDays < 0 || creditDays > 365)) return error('Plazo de crédito inválido (0 a 365 días).')
    const fields = {
      name, phone, countryCode, email: clean(body.email, 200) || null, document,
      // Solo se tocan cuando llegan: una ficha guardada no pierde sus datos de
      // facturación por un guardado que no los incluye.
      ...(body.billingName === undefined ? {} : { billingName: clean(body.billingName, 200) || null }),
      ...(body.billingDocument === undefined ? {} : { billingDocument: clean(body.billingDocument, 100) || null }),
      notes: clean(body.notes, 2000) || null,
      externalId: clean(body.externalId, 100) || null,
      acceptsEmailMarketing: body.acceptsEmailMarketing === true,
      acceptsSmsMarketing: body.acceptsSmsMarketing === true,
      acceptsWhatsappMarketing: body.acceptsWhatsappMarketing === true,
      taxExempt: body.taxExempt === true,
      tags,
      pricingTier,
      ...(priceListId === undefined ? {} : { priceListId }),
      ...(creditLimitPyg !== undefined ? { creditLimitPyg } : {}),
      ...(creditDays !== undefined ? { creditDays } : {}),
    }
    const addresses = addressesInput(body.addresses)
    const existing = document
      ? await prisma.customer.findFirst({ where: { tenantId: tenant, document } })
      : phone ? await prisma.customer.findFirst({ where: { tenantId: tenant, phone } }) : fields.externalId ? await prisma.customer.findFirst({ where: { tenantId: tenant, externalId: fields.externalId } }) : null
    const data = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { ...fields, ...(addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses } }) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } })
      : await prisma.customer.create({ data: { tenantId: tenant, createdById: session.user.id, ...fields, ...(addresses ? { addresses: { create: addresses } } : {}) }, include: { addresses: true } })
    return json(data, { status: existing ? 200 : 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.') }
}

// Importa fichas en lote (export de otro sistema). Deduplica por documento,
// teléfono o id externo; nunca pisa fichas existentes. Devuelve el conteo.
async function importarClientes(tenant: string, rows: unknown, userId: string) {
  const entrada = Array.isArray(rows) ? rows.slice(0, 500) : []
  if (entrada.length === 0) return error('Enviá al menos una fila para importar.', 400)
  const normalizadas = entrada.map((row, indice) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const name = clean(item.name, 200)
    const document = clean(item.document, 100) || null
    const phone = clean(item.phone, 100) || null
    const externalId = clean(item.externalId, 100) || null
    if (!name && !phone) return null
    const countryCode = typeof item.countryCode === 'string' && /^\+\d{1,4}$/.test(item.countryCode) ? item.countryCode : '+595'
    return {
      name: name || phone || '',
      phone,
      countryCode,
      document,
      externalId,
      email: clean(item.email, 200) || null,
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => clean(tag, 50)).filter(Boolean).slice(0, 20) : [],
      acceptsEmailMarketing: item.acceptsEmailMarketing === true,
      acceptsSmsMarketing: item.acceptsSmsMarketing === true,
      acceptsWhatsappMarketing: item.acceptsWhatsappMarketing === true,
      taxExempt: item.taxExempt === true,
      addresses: (() => { try { return addressesInput(item.addresses) } catch { return undefined } })(),
    }
  }).filter((fila) => fila !== null)

  let creadas = 0
  let saltadas = 0
  const vistosDocumento = new Set<string>()
  const vistosTelefono = new Set<string>()
  const vistosExterno = new Set<string>()
  for (const fila of normalizadas) {
    if (!fila) continue
    const duplicadoLocal = (fila.document && vistosDocumento.has(fila.document)) || (fila.phone && vistosTelefono.has(fila.phone)) || (fila.externalId && vistosExterno.has(fila.externalId))
    if (duplicadoLocal) { saltadas += 1; continue }
    const existente = await prisma.customer.findFirst({
      where: { tenantId: tenant, OR: [{ document: fila.document ?? undefined }, { phone: fila.phone ?? undefined }, { externalId: fila.externalId ?? undefined }].filter((criterio) => Object.values(criterio)[0] !== undefined) },
      select: { id: true },
    })
    if (existente) { saltadas += 1; continue }
    if (fila.document) vistosDocumento.add(fila.document)
    if (fila.phone) vistosTelefono.add(fila.phone)
    if (fila.externalId) vistosExterno.add(fila.externalId)
    try {
      await prisma.customer.create({
        data: {
          tenantId: tenant, createdById: userId, name: fila.name, phone: fila.phone, countryCode: fila.countryCode, document: fila.document,
          externalId: fila.externalId, email: fila.email, tags: fila.tags,
          acceptsEmailMarketing: fila.acceptsEmailMarketing, acceptsSmsMarketing: fila.acceptsSmsMarketing,
          acceptsWhatsappMarketing: fila.acceptsWhatsappMarketing, taxExempt: fila.taxExempt,
          ...(fila.addresses?.length ? { addresses: { create: fila.addresses } } : {}),
        },
      })
      creadas += 1
    } catch { saltadas += 1 }
  }
  return json({ created: creadas, skipped: saltadas, total: entrada.length })
}
