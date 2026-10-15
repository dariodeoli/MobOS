import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logError } from '../log'
import { ErrorCreditos, agregarVerificaciones, ajustarVerificaciones, fijarCupoMensual } from '../imei-credits'
import { filtroSinDemo } from './filtro-demo'
import { PAGINA, num, patronBusqueda, type ParamsLista } from './consultas'

// Panel de plataforma: créditos de verificación IMEI por empresa.
const ORDEN: Record<string, string> = { consumo: 'COALESCE(c.consumidos, 0)', nombre: 'lower(t."name")', saldo: 'COALESCE(s.saldo, 0)', costo: 'COALESCE(k.costo, 0)' }

export async function empresaExiste(id: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT 1 AS n FROM "Tenant" t WHERE t."id" = ${id} AND ${filtroSinDemo('t')}`)
  return filas.length > 0
}

export async function listarCreditosEmpresas(p: ParamsLista, ahora = new Date()) {
  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (p.q) {
    const patron = patronBusqueda(p.q)
    condiciones.push(Prisma.sql`(t."name" ILIKE ${patron} OR t."email" ILIKE ${patron} OR t."slug" ILIKE ${patron})`)
  }
  const donde = Prisma.join(condiciones, ' AND ')
  const orden = Prisma.raw(`${ORDEN[p.orden] ?? ORDEN.consumo} ${p.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, t."id"`)
  const union = Prisma.sql`
    FROM "Tenant" t
    LEFT JOIN (SELECT "tenantId", SUM("remaining")::int AS saldo FROM "ImeiCreditLot" WHERE "remaining" > 0 AND ("expiresAt" IS NULL OR "expiresAt" > ${ahora}) GROUP BY 1) s ON s."tenantId" = t."id"
    LEFT JOIN (SELECT "tenantId", COALESCE(SUM(-"amount"), 0)::int AS consumidos FROM "ImeiCreditEntry" WHERE "type" IN ('CONSUME','REFUND') GROUP BY 1) c ON c."tenantId" = t."id"
    LEFT JOIN (SELECT "tenantId", SUM("costUsd")::float8 AS costo, COUNT(*)::int AS consultas FROM "ImeiCheckQuery" GROUP BY 1) k ON k."tenantId" = t."id"
    LEFT JOIN "ImeiCreditSetting" g ON g."tenantId" = t."id"`
  const [filas, total] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT t."id", t."name", t."email", COALESCE(s.saldo, 0)::int AS saldo, COALESCE(c.consumidos, 0)::int AS consumidos,
             COALESCE(k.consultas, 0)::int AS consultas, COALESCE(k.costo, 0)::float8 AS "costoUsd", COALESCE(g."monthlyAllowance", 0)::int AS "cupoMensual"
      ${union}
      WHERE ${filtroSinDemo('t')} AND ${donde}
      ORDER BY ${orden}
      LIMIT ${PAGINA} OFFSET ${(p.pagina - 1) * PAGINA}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n ${union} WHERE ${filtroSinDemo('t')} AND ${donde}`),
  ])
  return { items: filas, total: num(total[0]?.n), pagina: p.pagina, porPagina: PAGINA }
}

type Dueno = { userId: string; tenantId: string }
type Resultado = { status: number; cuerpo: Record<string, unknown> }

/**
 * Agregar verificaciones / cupo mensual / ajuste. Todo queda en el AuditLog de
 * la empresa afectada (con quién lo hizo) y en el libro de créditos.
 */
export async function aplicarAccionCreditos(tenantId: string, dueno: Dueno, cuerpo: any): Promise<Resultado> {
  const accion = String(cuerpo?.action ?? '')
  try {
    if (accion === 'agregar') {
      const r = await agregarVerificaciones({ tenantId, actorId: dueno.userId, cantidad: cuerpo?.cantidad, venceEl: cuerpo?.venceEl, nota: cuerpo?.nota, opId: cuerpo?.opId })
      if (!r.aplicado) return { status: 200, cuerpo: { ok: true, repetido: true, saldo: r.saldo } }
      await registrar(tenantId, dueno, 'IMEI_CREDITS_GRANTED', { cantidad: r.cantidad, venceEl: r.expiresAt, nota: r.nota })
      return { status: 201, cuerpo: { ok: true, saldo: r.saldo } }
    }
    if (accion === 'cupo') {
      const r = await fijarCupoMensual({ tenantId, actorId: dueno.userId, cantidad: cuerpo?.cantidad })
      await registrar(tenantId, dueno, 'IMEI_CREDITS_ALLOWANCE_SET', { cupoAnterior: r.cupoAnterior, cupoMensual: r.cupoMensual })
      return { status: 200, cuerpo: { ok: true, saldo: r.saldo, cupoMensual: r.cupoMensual } }
    }
    if (accion === 'ajuste') {
      const r = await ajustarVerificaciones({ tenantId, actorId: dueno.userId, cantidad: cuerpo?.cantidad, nota: cuerpo?.nota, opId: cuerpo?.opId })
      if (!r.aplicado) return { status: 200, cuerpo: { ok: true, repetido: true, saldo: r.saldo } }
      await registrar(tenantId, dueno, 'IMEI_CREDITS_ADJUSTED', { cantidad: r.cantidad, nota: r.nota })
      return { status: 200, cuerpo: { ok: true, saldo: r.saldo } }
    }
    return { status: 400, cuerpo: { message: 'Acción inválida: usá agregar, cupo o ajuste.' } }
  } catch (error) {
    if (error instanceof ErrorCreditos) return { status: 400, cuerpo: { message: error.message } }
    logError('superadmin_creditos_error', { reason: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

async function registrar(tenantId: string, dueno: Dueno, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { tenantId, userId: null, action, entity: 'ImeiCredit', entityId: tenantId, metadata: { ...metadata, porPlataforma: true, actorUserId: dueno.userId, actorTenantId: dueno.tenantId } as Prisma.InputJsonValue } })
}
