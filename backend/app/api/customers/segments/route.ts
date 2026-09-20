import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { consultarClientes } from '../../../../lib/customer-segments'
import { SEGMENTOS as SEGMENTOS_MARKETING, clasificarCliente, motivoNoElegible, opcionesSegmento, puedeGestionarMarketing, type SegmentoKey } from '../../../../lib/segments'

// Campañas de recompra (#82): segmentos calculados en SQL sobre todas las
// fichas del tenant. La pantalla Clientes → Campañas los usa para elegir
// destinatarios y mandar la plantilla de WhatsApp de a uno.
//
// Nota: el segmento `cumpleanos` NO se expone porque "Customer" todavía no
// tiene fecha de nacimiento; cuando exista el campo se agrega acá sin tocar
// el contrato (el resto de los segmentos ya está estable).
const SEGMENTOS = ['inactivos6m', 'mayoristasDormidos', 'deudoresAlDia'] as const
type Segmento = (typeof SEGMENTOS)[number]

const TOPE = 200
const puedeGestionar = (role: string) => ['ADMIN', 'GERENTE'].includes(role)

// Saldo pendiente: total de pedidos PENDING menos pagos confirmados. La misma
// cuenta que usa Créditos para no mostrar dos verdades distintas.
const saldoPendienteSql = (tenant: string) => Prisma.sql`(
  SELECT SUM(o."totalPyg" - COALESCE(p.paid, 0))
  FROM "Order" o
  LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
  WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" = 'PENDING'
)`

const sinCompraDesde = (tenant: string, meses: number) => Prisma.sql`NOT EXISTS (
  SELECT 1 FROM "Order" o
  WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" <> 'CANCELLED'
    AND o."createdAt" >= now() - interval '${Prisma.raw(String(meses))} months'
)`

const tieneDeuda = (tenant: string) => Prisma.sql`EXISTS (
  SELECT 1 FROM "Order" o
  LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
  WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" = 'PENDING'
    AND o."totalPyg" - COALESCE(p.paid, 0) > 0
)`

const tieneVencidos = (tenant: string) => Prisma.sql`EXISTS (
  SELECT 1 FROM "Order" o
  LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
  WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" = 'PENDING'
    AND o."dueAt" IS NOT NULL AND o."dueAt" < now() AND o."totalPyg" - COALESCE(p.paid, 0) > 0
)`

function condicionDe(segmento: Segmento, tenant: string) {
  if (segmento === 'mayoristasDormidos') return Prisma.sql`c."pricingTier" = 'WHOLESALE' AND ${sinCompraDesde(tenant, 3)}`
  if (segmento === 'deudoresAlDia') return Prisma.sql`${tieneDeuda(tenant)} AND NOT ${tieneVencidos(tenant)}`
  return sinCompraDesde(tenant, 6)
}

function ordenDe(segmento: Segmento) {
  return segmento === 'deudoresAlDia'
    ? Prisma.sql`ORDER BY "pendingPyg" DESC NULLS LAST, c."name" ASC`
    : Prisma.sql`ORDER BY st."lastOrderAt" ASC NULLS FIRST, c."name" ASC`
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role) && !puedeGestionarMarketing(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const params = new URL(request.url).searchParams
  const pedido = (params.get('segment') || 'inactivos6m').trim()

  // Camino de marketing (segmentos con opciones): INACTIVE, NO_PURCHASES,
  // FREQUENT y CATEGORY. Devuelve `rows` con elegibilidad y también
  // `customers` para quien consuma el contrato viejo.
  const claveMarketing = pedido.toUpperCase() as SegmentoKey
  if (SEGMENTOS_MARKETING.some((item) => item.key === claveMarketing)) {
    const opciones = opcionesSegmento({
      days: params.get('days') ?? undefined,
      minOrders: params.get('minOrders') ?? undefined,
      category: params.get('category') ?? undefined,
      cooldownDays: params.get('cooldownDays') ?? undefined,
    })
    const limite = Math.min(500, Math.max(1, Number(params.get('limit')) || 200))
    const ahora = new Date()
    const clientes = await consultarClientes(tenant, { segmento: claveMarketing, opciones })
    const delSegmento = clientes.filter((cliente) => clasificarCliente(cliente, claveMarketing, opciones, ahora))
    const rows = delSegmento.slice(0, limite).map((cliente) => {
      const reason = motivoNoElegible(cliente, ahora, opciones.cooldownDays)
      return {
        id: cliente.id,
        name: cliente.name,
        phone: cliente.phone,
        countryCode: cliente.countryCode,
        acceptsWhatsappMarketing: cliente.acceptsWhatsappMarketing,
        marketingContactedAt: cliente.marketingContactedAt,
        lastOrderAt: cliente.lastOrderAt,
        totalSpentPyg: cliente.totalSpentPyg,
        eligible: reason === null,
        reason,
      }
    })
    return json({
      segment: claveMarketing,
      segmento: SEGMENTOS_MARKETING.find((item) => item.key === claveMarketing),
      opciones,
      total: delSegmento.length,
      elegibles: rows.filter((row) => row.eligible).length,
      rows,
      customers: rows,
    })
  }

  const segmento = pedido as Segmento
  if (!SEGMENTOS.includes(segmento)) return error('Segmento inválido.')
  const condicion = condicionDe(segmento, tenant)
  const [{ total }] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total FROM "Customer" c
    WHERE c."tenantId" = ${tenant} AND ${condicion}
  `)
  const customers = await prisma.$queryRaw<Array<{
    id: string; name: string; phone: string | null; countryCode: string; acceptsWhatsappMarketing: boolean
    marketingContactedAt: Date | null; lastOrderAt: Date | null; totalSpentPyg: bigint; pendingPyg: bigint
  }>>(Prisma.sql`
    SELECT c."id", c."name", c."phone", c."countryCode", c."acceptsWhatsappMarketing", c."marketingContactedAt",
      st."lastOrderAt", COALESCE(st."totalSpentPyg", 0)::bigint AS "totalSpentPyg", COALESCE(${saldoPendienteSql(tenant)}, 0)::bigint AS "pendingPyg"
    FROM "Customer" c
    LEFT JOIN LATERAL (
      SELECT MAX(o."createdAt") AS "lastOrderAt", SUM(o."totalPyg") AS "totalSpentPyg"
      FROM "Order" o
      WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" <> 'CANCELLED'
    ) st ON TRUE
    WHERE c."tenantId" = ${tenant} AND ${condicion}
    ${ordenDe(segmento)}
    LIMIT ${TOPE}
  `)
  const filas = customers.map((row) => ({
    ...row,
    totalSpentPyg: Number(row.totalSpentPyg),
    pendingPyg: Number(row.pendingPyg),
    eligible: row.acceptsWhatsappMarketing === true,
    reason: row.acceptsWhatsappMarketing === true ? null : 'sin-consentimiento',
  }))
  return json({
    segment: pedido,
    segmento,
    total,
    elegibles: filas.filter((fila) => fila.eligible).length,
    customers: filas,
    rows: filas,
  })
}

// Marca de contacto: el operador abrió WhatsApp para ese cliente. Solo se
// marca a quien dio consentimiento explícito de marketing por WhatsApp.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!puedeGestionar(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const ids = Array.isArray(body.customerIds) ? Array.from(new Set(body.customerIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))) : []
  if (!ids.length) return error('Elegí al menos un cliente.')
  if (ids.length > TOPE) return error(`Se pueden marcar hasta ${TOPE} clientes por vez.`)
  const segmento = typeof body.segment === 'string' && SEGMENTOS.includes(body.segment as Segmento) ? body.segment : ''
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.customer.updateMany({ where: { tenantId: tenant, id: { in: ids }, acceptsWhatsappMarketing: true }, data: { marketingContactedAt: new Date() } })
    if (result.count) {
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_MARKETING_CONTACTED', entity: 'Customer', entityId: ids[0], metadata: { count: result.count, segment: segmento } } })
    }
    return result.count
  })
  return json({ ok: true, updated, skipped: ids.length - updated })
}
