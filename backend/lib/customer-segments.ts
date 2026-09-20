// Una sola consulta de agregados por cliente (última compra, cantidad, total,
// saldo y categorías compradas) para segmentos y campañas. El filtro grueso se
// resuelve en SQL y la decisión final, en los predicados puros de segments.ts.

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import type { ClienteParaSegmento, OpcionesSegmento, SegmentoKey } from './segments'

type FilaSegmento = {
  id: string
  name: string
  phone: string | null
  countryCode: string | null
  email: string | null
  pricingTier: string
  acceptsWhatsappMarketing: boolean
  marketingContactedAt: Date | null
  lastOrderAt: Date | null
  orderCount: number
  totalSpentPyg: bigint
  outstandingPyg: bigint
  categories: string[] | null
}

const LIMITE_FILAS = 1000

export async function consultarClientes(
  tenantId: string,
  filtro: { ids?: string[]; segmento?: SegmentoKey; opciones?: OpcionesSegmento } = {},
): Promise<ClienteParaSegmento[]> {
  const condiciones: Prisma.Sql[] = [Prisma.sql`c."tenantId" = ${tenantId}`]
  const having: Prisma.Sql[] = []
  if (filtro.ids) {
    if (!filtro.ids.length) return []
    condiciones.push(Prisma.sql`c."id" IN (${Prisma.join(filtro.ids)})`)
  } else if (filtro.segmento === 'NO_PURCHASES') {
    having.push(Prisma.sql`COUNT(o."id") = 0`)
  } else if (filtro.segmento === 'FREQUENT' && filtro.opciones) {
    having.push(Prisma.sql`COUNT(o."id") >= ${filtro.opciones.minOrders}`)
  } else if (filtro.segmento === 'INACTIVE' && filtro.opciones) {
    // `createdAt` es timestamp sin zona y Prisma lo guarda en UTC: se compara
    // contra el ahora UTC (no contra `now()`, que trae la zona de la sesión).
    having.push(Prisma.sql`COUNT(o."id") >= 1 AND MAX(o."createdAt") <= (now() AT TIME ZONE 'UTC') - (${filtro.opciones.days} * interval '1 day')`)
  } else if (filtro.segmento === 'CATEGORY' && filtro.opciones) {
    having.push(Prisma.sql`COUNT(o."id") >= 1`)
    if (filtro.opciones.category) {
      condiciones.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Order" o2
        JOIN "OrderItem" oi2 ON oi2."orderId" = o2."id"
        JOIN "Product" p2 ON p2."id" = oi2."productId"
        WHERE o2."customerId" = c."id" AND o2."tenantId" = c."tenantId" AND o2."status" <> 'CANCELLED'
          AND lower(btrim(p2."category")) = lower(btrim(${filtro.opciones.category}))
      )`)
    }
  }
  const rows = await prisma.$queryRaw<FilaSegmento[]>(Prisma.sql`
    SELECT c."id", c."name", c."phone", c."countryCode", c."email", c."pricingTier"::text AS "pricingTier",
      c."acceptsWhatsappMarketing", c."marketingContactedAt",
      MAX(o."createdAt") AS "lastOrderAt",
      COUNT(o."id")::int AS "orderCount",
      COALESCE(SUM(o."totalPyg"), 0)::bigint AS "totalSpentPyg",
      COALESCE(SUM(GREATEST(o."totalPyg" - COALESCE(pay.paid, 0), 0)) FILTER (WHERE o."status" = 'PENDING'), 0)::bigint AS "outstandingPyg",
      COALESCE(array_agg(DISTINCT p."category") FILTER (WHERE p."category" IS NOT NULL), '{}') AS "categories"
    FROM "Customer" c
    LEFT JOIN "Order" o ON o."customerId" = c."id" AND o."tenantId" = c."tenantId" AND o."status" <> 'CANCELLED'
    LEFT JOIN "OrderItem" oi ON oi."orderId" = o."id"
    LEFT JOIN "Product" p ON p."id" = oi."productId"
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenantId} AND status = 'CONFIRMED' GROUP BY "orderId") pay ON pay."orderId" = o."id"
    WHERE ${Prisma.join(condiciones, ' AND ')}
    GROUP BY c."id"
    ${having.length ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty}
    ORDER BY MAX(o."createdAt") ASC NULLS FIRST, c."name" ASC
    LIMIT ${LIMITE_FILAS}
  `)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    countryCode: row.countryCode,
    email: row.email,
    pricingTier: row.pricingTier,
    acceptsWhatsappMarketing: row.acceptsWhatsappMarketing,
    marketingContactedAt: row.marketingContactedAt,
    lastOrderAt: row.lastOrderAt,
    orderCount: row.orderCount,
    totalSpentPyg: Number(row.totalSpentPyg),
    outstandingPyg: Number(row.outstandingPyg),
    categories: Array.isArray(row.categories) ? row.categories : [],
  }))
}
