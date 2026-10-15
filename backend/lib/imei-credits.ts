import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

// Créditos de verificación IMEI (docs/IMEI-CREDITOS.md).
//
// - Solo la plataforma (/superadmin) los otorga, ajusta o fija su cupo mensual.
//   La app de las empresas nunca muestra precios ni ofrece comprar.
// - Todo movimiento de saldo ocurre bajo `pg_advisory_xact_lock` por empresa y
//   queda en ImeiCreditEntry (libro solo de agregado, único por
//   (empresa, tipo, sourceRef) ⇒ cada operación se aplica una sola vez).
// - El proveedor se llama FUERA de la transacción: aquí solo se reserva y se
//   reembolsa.

type Tx = Prisma.TransactionClient

/** Créditos por servicio: 1 básico/find-my/identificación, 2 avanzado/blacklist, 15 MDM completo. */
export const CREDITOS_SERVICIO: Record<string, number> = {
  APPLE_BASIC: 1,
  FIND_MY: 1,
  IDENTIFICACION: 1,
  APPLE_ADVANCED: 2,
  BLACKLIST_PRO: 2,
  FULL_MDM: 15,
}
export const creditosDeServicio = (clave: string) => CREDITOS_SERVICIO[clave] ?? 1

/** Meses de cupo que se arrastran y meses de vida de un lote mensual. */
export const MESES_ARRASTRE = 3
export const MESES_VENCE_MENSUAL = 12

/**
 * Flag IMEI_CREDITS_ENFORCE. Sin definir: activo salvo en producción (que
 * arranca en sombra: registra el consumo pero no bloquea).
 */
export function imeiCreditsEnforce(env: Record<string, string | undefined> = process.env): boolean {
  const valor = String(env.IMEI_CREDITS_ENFORCE ?? '').trim().toLowerCase()
  if (['1', 'true', 'on', 'si', 'sí'].includes(valor)) return true
  if (['0', 'false', 'off', 'no'].includes(valor)) return false
  return env.NODE_ENV !== 'production'
}

const ZONA = 'America/Asuncion'
const partesMes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' })
/** «YYYY-MM» del mes de Paraguay. */
export function claveMes(fecha: Date): string {
  const partes = partesMes.formatToParts(fecha)
  return `${partes.find(p => p.type === 'year')?.value}-${partes.find(p => p.type === 'month')?.value}`
}
/** Medianoche (UTC-3) del día 1 del mes `clave` desplazado `meses` meses. */
export function inicioMes(clave: string, meses = 0): Date {
  const [anio, mes] = clave.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1 + meses, 1, 3, 0, 0))
}
const sumarMeses = (clave: string, n: number) => claveMes(inicioMes(clave, n))

const candado = (tx: Tx, tenantId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'imei-credits:' + tenantId})::bigint)`

async function insertarEntrada(tx: Tx, e: { tenantId: string; lotId?: string | null; type: string; amount: number; sourceRef: string; serviceKey?: string | null; queryId?: string | null; note?: string | null; actorId?: string | null }): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "ImeiCreditEntry" ("id","tenantId","lotId","type","amount","sourceRef","serviceKey","queryId","note","actorId")
    VALUES (${'ice_' + randomUUID()}, ${e.tenantId}, ${e.lotId ?? null}, ${e.type}, ${e.amount}, ${e.sourceRef}, ${e.serviceKey ?? null}, ${e.queryId ?? null}, ${e.note ?? null}, ${e.actorId ?? null})
    ON CONFLICT ("tenantId","type","sourceRef") DO NOTHING
    RETURNING "id"`
  return filas.length > 0
}

async function insertarLote(tx: Tx, l: { id: string; tenantId: string; source: string; granted: number; expiresAt?: Date | null; sourceRef?: string | null; note?: string | null; createdById?: string | null }) {
  await tx.$executeRaw`
    INSERT INTO "ImeiCreditLot" ("id","tenantId","source","granted","remaining","expiresAt","sourceRef","note","createdById")
    VALUES (${l.id}, ${l.tenantId}, ${l.source}, ${l.granted}, ${l.granted}, ${l.expiresAt ?? null}, ${l.sourceRef ?? null}, ${l.note ?? null}, ${l.createdById ?? null})
    ON CONFLICT ("id") DO NOTHING`
}

type Lote = { id: string; source: string; remaining: number; expiresAt: Date | null }
const lotesVigentes = (tx: Tx, tenantId: string, ahora: Date) => tx.$queryRaw<Lote[]>`
  SELECT "id","source","remaining","expiresAt" FROM "ImeiCreditLot"
  WHERE "tenantId" = ${tenantId} AND "remaining" > 0 AND ("expiresAt" IS NULL OR "expiresAt" > ${ahora})
  ORDER BY "expiresAt" ASC NULLS LAST, "createdAt" ASC, "id" ASC
  FOR UPDATE`

/** Verificación gratis, vencimientos y cupo mensual (perezoso e idempotente). Requiere el candado. */
async function asegurar(tx: Tx, tenantId: string, ahora: Date) {
  // 1 verificación gratis por empresa (empresas nuevas; las existentes entran por la migración).
  if (await insertarEntrada(tx, { tenantId, lotId: `ilf_${tenantId}`, type: 'GRANT', amount: 1, sourceRef: 'free', note: 'Verificación de bienvenida' })) {
    await insertarLote(tx, { id: `ilf_${tenantId}`, tenantId, source: 'FREE', granted: 1, sourceRef: 'free', note: 'Verificación de bienvenida' })
  }
  // Vencimientos.
  const vencidos = await tx.$queryRaw<{ id: string; remaining: number }[]>`
    SELECT "id","remaining" FROM "ImeiCreditLot" WHERE "tenantId" = ${tenantId} AND "remaining" > 0 AND "expiresAt" IS NOT NULL AND "expiresAt" <= ${ahora} FOR UPDATE`
  for (const lote of vencidos) {
    await insertarEntrada(tx, { tenantId, lotId: lote.id, type: 'EXPIRE', amount: -lote.remaining, sourceRef: `exp:${lote.id}:${lote.remaining}`, note: 'Vencimiento del lote' })
    await tx.$executeRaw`UPDATE "ImeiCreditLot" SET "remaining" = 0 WHERE "id" = ${lote.id}`
  }
  // Cupo mensual: se acredita el mes actual (y los que faltaron, hasta 3 atrás) una sola vez por mes.
  const ajuste = (await tx.$queryRaw<{ monthlyAllowance: number; since: Date }[]>`SELECT "monthlyAllowance","since" FROM "ImeiCreditSetting" WHERE "tenantId" = ${tenantId}`)[0]
  const cupo = Number(ajuste?.monthlyAllowance ?? 0)
  if (!ajuste || cupo <= 0) return
  const actual = claveMes(ahora)
  const desde = [claveMes(ajuste.since), sumarMeses(actual, -MESES_ARRASTRE)].sort().pop() as string
  for (let mes = desde; mes <= actual; mes = sumarMeses(mes, 1)) {
    const ya = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM "ImeiCreditEntry" WHERE "tenantId" = ${tenantId} AND "type" = 'GRANT' AND "sourceRef" = ${'sub:' + mes}`
    if (ya.length) continue
    // Tope de arrastre: lo que sobra de meses anteriores no pasa de 3 cupos.
    const mensuales = (await lotesVigentes(tx, tenantId, ahora)).filter(l => l.source === 'MONTHLY')
    let exceso = mensuales.reduce((suma, l) => suma + l.remaining, 0) - MESES_ARRASTRE * cupo
    for (const lote of mensuales) {
      if (exceso <= 0) break
      const quita = Math.min(exceso, lote.remaining)
      await insertarEntrada(tx, { tenantId, lotId: lote.id, type: 'EXPIRE', amount: -quita, sourceRef: `cap:${mes}:${lote.id}`, note: `Tope de arrastre (${MESES_ARRASTRE} meses de cupo)` })
      await tx.$executeRaw`UPDATE "ImeiCreditLot" SET "remaining" = "remaining" - ${quita} WHERE "id" = ${lote.id} AND "remaining" >= ${quita}`
      exceso -= quita
    }
    const loteId = `ilm_${tenantId}_${mes}`
    if (await insertarEntrada(tx, { tenantId, lotId: loteId, type: 'GRANT', amount: cupo, sourceRef: `sub:${mes}`, note: `Cupo mensual ${mes}` })) {
      await insertarLote(tx, { id: loteId, tenantId, source: 'MONTHLY', granted: cupo, expiresAt: inicioMes(mes, MESES_VENCE_MENSUAL), sourceRef: `sub:${mes}`, note: `Cupo mensual ${mes}` })
    }
  }
}

async function saldoEn(tx: Tx, tenantId: string, ahora: Date): Promise<number> {
  const filas = await tx.$queryRaw<{ n: bigint | null }[]>`
    SELECT COALESCE(SUM("remaining"), 0) AS n FROM "ImeiCreditLot"
    WHERE "tenantId" = ${tenantId} AND "remaining" > 0 AND ("expiresAt" IS NULL OR "expiresAt" > ${ahora})`
  return Number(filas[0]?.n ?? 0)
}

/** Descuenta `cantidad` de los lotes (el que vence primero antes). Devuelve lo descontado por lote. */
async function tomarDeLotes(tx: Tx, tenantId: string, cantidad: number, ahora: Date) {
  const tomas: { lotId: string; cantidad: number }[] = []
  let falta = cantidad
  for (const lote of await lotesVigentes(tx, tenantId, ahora)) {
    if (falta <= 0) break
    const toma = Math.min(falta, lote.remaining)
    const filas = await tx.$executeRaw`UPDATE "ImeiCreditLot" SET "remaining" = "remaining" - ${toma} WHERE "id" = ${lote.id} AND "remaining" >= ${toma}`
    if (filas !== 1) continue
    tomas.push({ lotId: lote.id, cantidad: toma })
    falta -= toma
  }
  return { tomas, faltante: falta }
}

export type EstadoCreditos = { saldo: number; cupoMensual: number; enforce: boolean }

/** Saldo vigente (acredita gratis/cupo del mes y vence lo vencido antes de contar). */
export async function estadoCreditos(tenantId: string, ahora = new Date()): Promise<EstadoCreditos> {
  return prisma.$transaction(async tx => {
    await candado(tx, tenantId)
    await asegurar(tx, tenantId, ahora)
    const cupo = await tx.$queryRaw<{ monthlyAllowance: number }[]>`SELECT "monthlyAllowance" FROM "ImeiCreditSetting" WHERE "tenantId" = ${tenantId}`
    return { saldo: await saldoEn(tx, tenantId, ahora), cupoMensual: Number(cupo[0]?.monthlyAllowance ?? 0), enforce: imeiCreditsEnforce() }
  })
}

export type ResultadoReserva<F> =
  | { tipo: 'existente'; fila: F }
  | { tipo: 'sin-creditos'; saldo: number; requeridos: number }
  | { tipo: 'reservada'; fila: F; consumidos: number; enSombra: number }

/**
 * Reserva la consulta y descuenta los créditos en UNA transacción bajo el
 * candado de la empresa. El mismo requestId nunca descuenta dos veces: la
 * segunda llamada encuentra la fila y devuelve `existente`.
 */
export async function reservarConsulta<F extends { id: string }>(input: {
  tenantId: string
  requestId: string
  servicioKey: string
  enforce?: boolean
  buscar: (tx: Tx) => Promise<F | null>
  crear: (tx: Tx) => Promise<F>
  ahora?: Date
}): Promise<ResultadoReserva<F>> {
  const ahora = input.ahora ?? new Date()
  const enforce = input.enforce ?? imeiCreditsEnforce()
  const requeridos = creditosDeServicio(input.servicioKey)
  return prisma.$transaction(async tx => {
    await candado(tx, input.tenantId)
    const existente = await input.buscar(tx)
    if (existente) return { tipo: 'existente' as const, fila: existente }
    await asegurar(tx, input.tenantId, ahora)
    const saldo = await saldoEn(tx, input.tenantId, ahora)
    if (enforce && saldo < requeridos) return { tipo: 'sin-creditos' as const, saldo, requeridos }
    const fila = await input.crear(tx)
    const { tomas, faltante } = await tomarDeLotes(tx, input.tenantId, requeridos, ahora)
    for (const toma of tomas) {
      await insertarEntrada(tx, { tenantId: input.tenantId, lotId: toma.lotId, type: 'CONSUME', amount: -toma.cantidad, sourceRef: `${input.requestId}:${toma.lotId}`, serviceKey: input.servicioKey, queryId: fila.id })
    }
    // Modo sombra: lo que no alcanzó se registra igual (sin lote), pero no bloquea.
    if (faltante > 0) await insertarEntrada(tx, { tenantId: input.tenantId, lotId: null, type: 'CONSUME', amount: -faltante, sourceRef: `${input.requestId}:sombra`, serviceKey: input.servicioKey, queryId: fila.id, note: 'Sin saldo (modo sombra: no bloquea)' })
    return { tipo: 'reservada' as const, fila, consumidos: requeridos - faltante, enSombra: faltante }
  }, { timeout: 15_000 })
}

/** ¿El resultado del proveedor permite devolver el crédito? Solo falla sin cobro del proveedor. */
export const correspondeReembolso = (estado: string, costoUsd: number) => estado === 'fallido' && !(costoUsd > 0)

/** Devuelve (una sola vez) los créditos de una consulta. Idempotente por (empresa, REFUND, sourceRef). */
export async function reembolsarConsulta(tenantId: string, queryId: string): Promise<number> {
  return prisma.$transaction(async tx => {
    await candado(tx, tenantId)
    const consumos = await tx.$queryRaw<{ lotId: string | null; amount: number; sourceRef: string; serviceKey: string | null }[]>`
      SELECT "lotId","amount","sourceRef","serviceKey" FROM "ImeiCreditEntry" WHERE "tenantId" = ${tenantId} AND "type" = 'CONSUME' AND "queryId" = ${queryId}`
    let devueltos = 0
    for (const c of consumos) {
      const monto = -Number(c.amount)
      if (!(await insertarEntrada(tx, { tenantId, lotId: c.lotId, type: 'REFUND', amount: monto, sourceRef: c.sourceRef, serviceKey: c.serviceKey, queryId, note: 'Consulta fallida sin cobro del proveedor' }))) continue
      if (c.lotId) await tx.$executeRaw`UPDATE "ImeiCreditLot" SET "remaining" = "remaining" + ${monto} WHERE "id" = ${c.lotId}`
      devueltos += monto
    }
    return devueltos
  })
}

// ── Acciones de la plataforma (/superadmin) ─────────────────────────────────
export class ErrorCreditos extends Error {}

const enteroPositivo = (valor: unknown, max = 100_000) => {
  const n = Number(valor)
  if (!Number.isInteger(n) || n <= 0 || n > max) throw new ErrorCreditos('La cantidad debe ser un entero positivo.')
  return n
}
const texto = (valor: unknown, max = 300) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '')

/** «Agregar verificaciones»: lote GRANT con vencimiento opcional. */
export async function agregarVerificaciones(input: { tenantId: string; actorId: string; cantidad: unknown; venceEl?: unknown; nota?: unknown; opId?: unknown }) {
  const cantidad = enteroPositivo(input.cantidad)
  let expiresAt: Date | null = null
  if (input.venceEl) {
    expiresAt = new Date(String(input.venceEl))
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new ErrorCreditos('El vencimiento debe ser una fecha futura.')
  }
  const nota = texto(input.nota)
  const opId = texto(input.opId, 80) || randomUUID()
  return prisma.$transaction(async tx => {
    await candado(tx, input.tenantId)
    const nuevo = await insertarEntrada(tx, { tenantId: input.tenantId, lotId: `ilg_${opId}`, type: 'GRANT', amount: cantidad, sourceRef: `grant:${opId}`, note: nota || null, actorId: input.actorId })
    if (nuevo) await insertarLote(tx, { id: `ilg_${opId}`, tenantId: input.tenantId, source: 'GRANT', granted: cantidad, expiresAt, sourceRef: `grant:${opId}`, note: nota || null, createdById: input.actorId })
    await asegurar(tx, input.tenantId, new Date())
    return { aplicado: nuevo, saldo: await saldoEn(tx, input.tenantId, new Date()), cantidad, expiresAt, nota }
  })
}

/** «Cupo mensual»: N verificaciones por mes. El mes en curso se acredita en el acto. */
export async function fijarCupoMensual(input: { tenantId: string; actorId: string; cantidad: unknown }) {
  const n = Number(input.cantidad)
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new ErrorCreditos('El cupo mensual debe ser un entero de 0 o más.')
  return prisma.$transaction(async tx => {
    await candado(tx, input.tenantId)
    const anterior = (await tx.$queryRaw<{ monthlyAllowance: number }[]>`SELECT "monthlyAllowance" FROM "ImeiCreditSetting" WHERE "tenantId" = ${input.tenantId}`)[0]
    await tx.$executeRaw`
      INSERT INTO "ImeiCreditSetting" ("tenantId","monthlyAllowance","since","updatedById","updatedAt")
      VALUES (${input.tenantId}, ${n}, CURRENT_TIMESTAMP, ${input.actorId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("tenantId") DO UPDATE SET "monthlyAllowance" = ${n}, "updatedById" = ${input.actorId}, "updatedAt" = CURRENT_TIMESTAMP,
        "since" = CASE WHEN "ImeiCreditSetting"."monthlyAllowance" = 0 THEN CURRENT_TIMESTAMP ELSE "ImeiCreditSetting"."since" END`
    await asegurar(tx, input.tenantId, new Date())
    return { cupoAnterior: Number(anterior?.monthlyAllowance ?? 0), cupoMensual: n, saldo: await saldoEn(tx, input.tenantId, new Date()) }
  })
}

/** «Ajuste» ± con nota obligatoria. Un ajuste negativo no puede dejar saldo negativo. */
export async function ajustarVerificaciones(input: { tenantId: string; actorId: string; cantidad: unknown; nota: unknown; opId?: unknown }) {
  const n = Number(input.cantidad)
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100_000) throw new ErrorCreditos('El ajuste debe ser un entero distinto de cero.')
  const nota = texto(input.nota)
  if (!nota) throw new ErrorCreditos('El ajuste exige una nota.')
  const opId = texto(input.opId, 80) || randomUUID()
  const ahora = new Date()
  return prisma.$transaction(async tx => {
    await candado(tx, input.tenantId)
    await asegurar(tx, input.tenantId, ahora)
    let aplicado = true
    if (n > 0) {
      aplicado = await insertarEntrada(tx, { tenantId: input.tenantId, lotId: `ila_${opId}`, type: 'ADJUST', amount: n, sourceRef: `adj:${opId}`, note: nota, actorId: input.actorId })
      if (aplicado) await insertarLote(tx, { id: `ila_${opId}`, tenantId: input.tenantId, source: 'ADJUST', granted: n, sourceRef: `adj:${opId}`, note: nota, createdById: input.actorId })
    } else {
      const yaAplicado = await tx.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM "ImeiCreditEntry" WHERE "tenantId" = ${input.tenantId} AND "type" = 'ADJUST' AND "sourceRef" LIKE ${'adj:' + opId + ':%'}`
      if (yaAplicado.length) aplicado = false
      else {
        if ((await saldoEn(tx, input.tenantId, ahora)) < -n) throw new ErrorCreditos('El ajuste deja el saldo en negativo.')
        const { tomas } = await tomarDeLotes(tx, input.tenantId, -n, ahora)
        for (const toma of tomas) await insertarEntrada(tx, { tenantId: input.tenantId, lotId: toma.lotId, type: 'ADJUST', amount: -toma.cantidad, sourceRef: `adj:${opId}:${toma.lotId}`, note: nota, actorId: input.actorId })
      }
    }
    return { aplicado, saldo: await saldoEn(tx, input.tenantId, ahora), cantidad: n, nota }
  })
}

// ── Lectura para el panel de plataforma ─────────────────────────────────────
export async function detalleCreditos(tenantId: string, ahora = new Date()) {
  const estado = await estadoCreditos(tenantId, ahora)
  const [lotes, movimientos, consumo, costo, setting] = await Promise.all([
    prisma.$queryRaw<any[]>`SELECT "id","source","granted","remaining","expiresAt","note","createdAt" FROM "ImeiCreditLot" WHERE "tenantId" = ${tenantId} ORDER BY "createdAt" DESC LIMIT 50`,
    prisma.$queryRaw<any[]>`SELECT "id","type","amount","serviceKey","note","actorId","createdAt" FROM "ImeiCreditEntry" WHERE "tenantId" = ${tenantId} ORDER BY "createdAt" DESC, "id" DESC LIMIT 100`,
    prisma.$queryRaw<any[]>`
      SELECT COALESCE("serviceKey",'—') AS servicio,
             COALESCE(SUM(CASE WHEN "type" = 'CONSUME' THEN -"amount" WHEN "type" = 'REFUND' THEN -"amount" ELSE 0 END), 0)::int AS creditos,
             COUNT(*) FILTER (WHERE "type" = 'CONSUME')::int AS consultas
      FROM "ImeiCreditEntry" WHERE "tenantId" = ${tenantId} AND "type" IN ('CONSUME','REFUND') GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM("costUsd"), 0)::float8 AS total,
             COALESCE(SUM("costUsd") FILTER (WHERE "requestedAt" >= ${inicioMes(claveMes(ahora))}), 0)::float8 AS "mesActual",
             COUNT(*)::int AS consultas
      FROM "ImeiCheckQuery" WHERE "tenantId" = ${tenantId}`,
    prisma.$queryRaw<any[]>`SELECT "monthlyAllowance","since" FROM "ImeiCreditSetting" WHERE "tenantId" = ${tenantId}`,
  ])
  return {
    ...estado,
    cupoDesde: setting[0]?.since ?? null,
    lotes: lotes.map(l => ({ ...l, granted: Number(l.granted), remaining: Number(l.remaining) })),
    movimientos: movimientos.map(m => ({ ...m, amount: Number(m.amount) })),
    consumo,
    costoProveedorUsd: { total: Number(costo[0]?.total ?? 0), mesActual: Number(costo[0]?.mesActual ?? 0), consultas: Number(costo[0]?.consultas ?? 0) },
  }
}
