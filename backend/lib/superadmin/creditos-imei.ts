import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logError } from '../log'
import { ErrorCreditos, agregarVerificaciones, correspondeReembolso, reembolsarConsulta, ajustarVerificaciones, fijarCupoMensual } from '../imei-credits'
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
    if (accion === 'conciliar') return await conciliarConsulta(tenantId, dueno, cuerpo)
    return { status: 400, cuerpo: { message: 'Acción inválida: usá agregar, cupo, ajuste o conciliar.' } }
  } catch (error) {
    if (error instanceof ErrorCreditos) return { status: 400, cuerpo: { message: error.message } }
    logError('superadmin_creditos_error', { reason: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/**
 * Conciliación de una consulta IMEI contra el panel del proveedor. Solo la
 * plataforma: el estado y el costo real salen de sus datos y, si la consulta
 * quedó fallida sin cobro, recién acá se devuelve el crédito (una sola vez).
 */
async function conciliarConsulta(tenantId: string, dueno: Dueno, cuerpo: any): Promise<Resultado> {
  const requestId = typeof cuerpo?.requestId === 'string' ? cuerpo.requestId.trim() : ''
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  if (!requestId && !id) return { status: 400, cuerpo: { message: 'Indicá requestId o id de la consulta a conciliar.' } }
  const registro = await prisma.imeiCheckQuery.findFirst({ where: { tenantId, ...(id ? { id } : { requestId }) } })
  if (!registro) return { status: 404, cuerpo: { message: 'No se encontró la consulta a conciliar.' } }
  const estados = ['verificado', 'parcial', 'conciliar', 'pendiente', 'fallido']
  const status = typeof cuerpo?.status === 'string' && estados.includes(cuerpo.status) ? cuerpo.status : registro.status
  const costUsd = cuerpo?.costUsd === undefined ? Number(registro.costUsd) : Number(cuerpo.costUsd)
  if (!Number.isFinite(costUsd) || costUsd < 0) return { status: 400, cuerpo: { message: 'Costo inválido para conciliar.' } }
  const actualizado = await prisma.imeiCheckQuery.update({
    where: { id: registro.id },
    data: {
      status,
      costUsd: String(costUsd.toFixed(2)),
      externalId: typeof cuerpo?.externalId === 'string' && cuerpo.externalId.trim() ? cuerpo.externalId.trim().slice(0, 128) : registro.externalId,
      conciliatedAt: new Date(),
      conciliationNote: typeof cuerpo?.note === 'string' ? cuerpo.note.trim().slice(0, 500) : registro.conciliationNote,
      resolvedAt: typeof cuerpo?.resolvedAt === 'string' && !Number.isNaN(new Date(cuerpo.resolvedAt).getTime()) ? new Date(cuerpo.resolvedAt) : new Date(),
      error: status === 'conciliar' ? registro.error : null,
    },
  })
  const devueltos = correspondeReembolso(status, costUsd) ? await reembolsarConsulta(tenantId, registro.id) : 0
  await registrar(tenantId, dueno, 'IMEI_QUERY_CONCILIATED', { queryId: registro.id, requestId: registro.requestId, status, costUsd, externalId: actualizado.externalId, devueltos })
  return { status: 200, cuerpo: { ok: true, id: registro.id, status, devueltos } }
}

async function registrar(tenantId: string, dueno: Dueno, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { tenantId, userId: null, action, entity: 'ImeiCredit', entityId: tenantId, metadata: { ...metadata, porPlataforma: true, actorUserId: dueno.userId, actorTenantId: dueno.tenantId } as Prisma.InputJsonValue } })
}
