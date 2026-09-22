import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { addressesInput, leerPorcentajeSeguro } from './_lib'

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// Filtros del listado resueltos en el servidor sobre TODAS las fichas del
// tenant, no solo la página cargada (mismo patrón que Pedidos).
const FILTROS_CLIENTES = new Set(['todos', 'mayoristas', 'minoristas', 'deuda', 'credito', 'sincredito', 'conemail'])
// Órdenes del listado (#160): por defecto, el cliente con pedido más reciente
// arriba; también por nombre, total gastado o alta más reciente.
const ORDENES_CLIENTE = new Set(['actividad', 'nombre', 'total', 'recientes'])

// Patrón LIKE literal: % y _ del texto buscado no actúan como comodines.
const patronLike = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`

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
  const orden = params.get('orden') || 'actividad'
  if (!ORDENES_CLIENTE.has(orden)) return error('Orden inválido.')
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
  // Agregado por cliente (mismo alcance que las estadísticas: sin cancelados)
  // para ordenar por actividad y por total gastado sin salir del SQL.
  const agregado = Prisma.sql`LEFT JOIN (
    SELECT "customerId", MAX("createdAt") AS "lastOrderAt", SUM("totalPyg")::float8 AS "totalSpent"
    FROM "Order" WHERE "tenantId" = ${tenant} AND "status" <> 'CANCELLED' AND "customerId" IS NOT NULL
    GROUP BY "customerId"
  ) o ON o."customerId" = c."id"`
  const claveOrden = orden === 'nombre' ? Prisma.sql`lower(c."name")`
    : orden === 'total' ? Prisma.sql`COALESCE(o."totalSpent", 0)`
      : orden === 'recientes' ? Prisma.sql`c."createdAt"`
        : Prisma.sql`COALESCE(o."lastOrderAt", c."createdAt")`
  const direccion = orden === 'nombre' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const comparacion = orden === 'nombre' ? Prisma.sql`>` : Prisma.sql`<`
  if (cursor) {
    // Cursor por la clave del orden + id: páginas consecutivas no repiten ni
    // saltean fichas empatadas en la misma fecha o monto.
    const cursorRows = await prisma.$queryRaw<Array<{ key: Date | number | string | null }>>(Prisma.sql`
      SELECT ${claveOrden} AS "key" FROM "Customer" c ${agregado}
      WHERE c."id" = ${cursor} AND c."tenantId" = ${tenant} LIMIT 1`)
    if (!cursorRows.length) return json([])
    const key = cursorRows[0].key
    condiciones.push(Prisma.sql`(${claveOrden} ${comparacion} ${key} OR (${claveOrden} = ${key} AND c."id" ${comparacion} ${cursor}))`)
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
    ${agregado}
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY ${claveOrden} ${direccion}, c."id" ${direccion}
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
  // Deuda por cliente (#236): pendiente de los pedidos vivos (total − cobrado
  // confirmado), el mismo criterio que el filtro «Con deuda».
  const idsOrdenados: string[] = ordenados.map((customer) => String(customer.id)).filter((id) => id.length > 0)
  const deudas = idsOrdenados.length
    ? await prisma.$queryRaw<Array<{ customerId: string | null; pendingPyg: number }>>`
        SELECT o."customerId", SUM(GREATEST(o."totalPyg" - COALESCE(p.paid, 0), 0))::float8 AS "pendingPyg"
        FROM "Order" o
        LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
        WHERE o."tenantId" = ${tenant} AND o."status" <> 'CANCELLED' AND o."customerId" IN (${Prisma.join(idsOrdenados)})
        GROUP BY o."customerId"
      `
    : []
  const deudaPorCliente = new Map(deudas.filter((fila) => fila.customerId).map((fila) => [String(fila.customerId), Number(fila.pendingPyg) || 0]))
  const statsPorCliente = new Map(stats.map((fila) => [fila.customerId, { orders: fila._count._all, totalSpentPyg: fila._sum.totalPyg ?? 0, lastOrderAt: fila._max.createdAt, pendingPyg: fila.customerId ? deudaPorCliente.get(fila.customerId) || 0 : 0 }]))
  return json(ordenados.map((customer) => ({ ...customer, wholesale: esMayorista(customer), stats: statsPorCliente.get(customer.id) || { orders: 0, totalSpentPyg: 0, lastOrderAt: null, pendingPyg: 0 } })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = await request.json() as Record<string, unknown>
    if (Array.isArray(body.rows)) return importarClientes(tenant, body.rows, session.user.id)
    const name = clean(body.name, 200)
    // Nombres desdoblados (#160): el nombre completo visible se compone del
    // primer y segundo nombre; `name` sigue aceptándose para compatibilidad.
    const firstName = clean(body.firstName, 120) || null
    const secondName = clean(body.secondName, 120) || null
    const nombreCompleto = [firstName, secondName].filter(Boolean).join(' ') || name
    if (!nombreCompleto) return error('El nombre es obligatorio.')
    const gestionaSeguro = ['ADMIN', 'GERENTE'].includes(session.user.role)
    const insuranceEnabled = body.insuranceEnabled === true
    const insuranceRatePct = leerPorcentajeSeguro(body.insuranceRatePct)
    if (insuranceRatePct === 'invalido') return error('El seguro debe ser un porcentaje entre 0 y 100 (hasta 2 decimales).')
    if ((insuranceEnabled || insuranceRatePct !== undefined) && !gestionaSeguro) return error('Solo administración o gerencia pueden configurar el seguro.', 403)
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
      name: nombreCompleto, firstName, secondName, phone, countryCode, email: clean(body.email, 200) || null, document,
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
      ...(insuranceRatePct === undefined ? {} : { insuranceRatePct }),
      ...(body.insuranceEnabled === undefined ? {} : { insuranceEnabled }),
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
