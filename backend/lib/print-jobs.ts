// Trabajos de impresión remotos: validación del payload ESC/POS, transiciones
// de estado, hash del sufijo de confirmación (nunca en claro), shapes públicos,
// purga acotada y claim atómico con lease. Lo comparten las rutas de sesión y
// las del agente.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { PrismaClient, PrintJob, PrintJobState } from '@prisma/client'
import { hashToken } from './auth'
import { InputError } from './payment-input'

// Base64 de 128 KB (~96 KB crudos), espejo del tope del agente (server.mjs:268).
export const PAYLOAD_MAX_B64 = 131072
export const MAX_ABIERTOS_POR_EMPRESA = 200
export const MAX_INTENTOS_IMPRESION = 3
export const RETENCION_METADATOS_DIAS = 180
export const PURGA_LOTE_MAX = 200
export const LEASE_MS = 120_000
// El lease solo se extiende dentro de las 5 ventanas posteriores al claim
// (~10 min): una impresión lenta no puede retener el trabajo para siempre.
export const LEASE_MAX_MS = 5 * LEASE_MS
export const MAX_SUFIJO = 8

export const ESTADOS_TRABAJO = ['PENDIENTE', 'RECLAMADO', 'ACEPTADO', 'INCIERTO', 'FALLIDO', 'CONFIRMADO'] as const
export const ESTADOS_ABIERTOS = ['PENDIENTE', 'RECLAMADO'] as const
export const ESTADOS_RESULTADO = ['ACEPTADO', 'INCIERTO', 'FALLIDO'] as const

export type ResultadoAgente = (typeof ESTADOS_RESULTADO)[number]
export type EstadoRequeue = 'PENDIENTE' | 'FALLIDO'

const PAYLOAD_RE = /^[A-Za-z0-9+/=]+$/
const MOTIVO_LEASE_VENCIDO = 'Vencido el plazo de impresión sin respuesta del puente.'

/**
 * Valida el payload ESC/POS en base64. El tope protege la base y la memoria
 * del agente; el formato espeja el del servidor local del agente.
 */
export function validarPayload(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) throw new InputError('El ticket llegó vacío o mal formado.')
  if (valor.length > PAYLOAD_MAX_B64) throw new InputError('El ticket supera el máximo de 128 KB.', 413)
  if (!PAYLOAD_RE.test(valor)) throw new InputError('El ticket llegó vacío o mal formado.')
  return valor
}

export function textoOpcional(valor: unknown, maximo: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : ''
}

export function hashSufijo(sufijo: string): string {
  return hashToken(sufijo)
}

// Comparación en tiempo constante con guarda de longitud (patrón
// email-outbox/route.ts:5-12): el intento jamás se compara en claro ni se
// expone cuánto se acercó al valor esperado.
export function sufijoCoincide(guardado: string, intento: string): boolean {
  const izquierda = Buffer.from(String(guardado))
  const derecha = Buffer.from(String(intento))
  return izquierda.length === derecha.length && timingSafeEqual(izquierda, derecha)
}

/**
 * Estado al que llega un trabajo cuando el dueño vigente del lease reporta un
 * resultado. Solo `RECLAMADO` acepta transición; un reporte repetido o ajeno
 * devuelve null para que la ruta responda con el estado actual (reconciliación).
 */
export function estadoTrasResultado(actual: PrintJobState, resultado: ResultadoAgente): PrintJobState | null {
  return actual === 'RECLAMADO' ? resultado : null
}

/**
 * Decisión pura del requeue por lease vencido: mientras queden intentos vuelve
 * a `PENDIENTE` (mismo id); agotados, queda `FALLIDO` sin auto-reintento.
 */
export function calcularRequeue(attempts: number, leaseExpiresAt: Date | null, ahora: Date = new Date()): EstadoRequeue | null {
  if (!leaseExpiresAt || leaseExpiresAt.getTime() > ahora.getTime()) return null
  return attempts < MAX_INTENTOS_IMPRESION ? 'PENDIENTE' : 'FALLIDO'
}

/**
 * Nuevo vencimiento al extender el lease por latido: 120 s más, sin superar
 * las 5 ventanas desde el claim. Devuelve null cuando ya no hay margen.
 */
export function calcularLeaseExtendido(claimedAt: Date | null, ahora: Date = new Date()): Date | null {
  if (!claimedAt) return null
  const tope = claimedAt.getTime() + LEASE_MAX_MS
  if (tope <= ahora.getTime()) return null
  return new Date(Math.min(ahora.getTime() + LEASE_MS, tope))
}

// Lista blanca del shape público: nunca payload, suffixHash, leaseId, tokenHash
// ni claves internas de idempotencia.
export function shapePublico(job: PrintJob) {
  return {
    id: job.id,
    state: job.state,
    path: job.path,
    kind: job.kind,
    printerId: job.printerId,
    destination: job.destination,
    validation: job.validation,
    reference: job.reference,
    requestedByName: job.requestedByName,
    deviceName: job.deviceName,
    bridgeName: job.bridgeName,
    tokenHint: job.tokenHint,
    mode: job.mode,
    width: job.width,
    copies: job.copies,
    attempts: job.attempts,
    error: job.error,
    payloadBytes: job.payloadBytes,
    createdAt: job.createdAt,
    acceptedAt: job.acceptedAt,
    confirmedAt: job.confirmedAt,
  }
}

export type JobPublico = ReturnType<typeof shapePublico>

// Shape reservado al puente: agrega el payload transitorio y el lease vigente.
// Solo se sirve por el claim autenticado con el token del puente.
export function shapeAgente(job: PrintJob) {
  return {
    id: job.id,
    printerId: job.printerId,
    destination: job.destination,
    kind: job.kind,
    payload: job.payload,
    payloadBytes: job.payloadBytes,
    validation: job.validation,
    reference: job.reference,
    requestedByName: job.requestedByName,
    deviceName: job.deviceName,
    bridgeName: job.bridgeName,
    tokenHint: job.tokenHint,
    mode: job.mode,
    width: job.width,
    copies: job.copies,
    attempts: job.attempts,
    leaseId: job.leaseId,
    leaseExpiresAt: job.leaseExpiresAt,
  }
}

/**
 * Purga oportunista de metadatos terminales con más de 180 días. Lote acotado
 * (≤200) e idempotente: se apoya en `ctid` porque Prisma no expone LIMIT en
 * deleteMany.
 */
export async function purgarMetadatos(db: Pick<PrismaClient, '$executeRaw'>, tenantId: string, ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - RETENCION_METADATOS_DIAS * 24 * 60 * 60 * 1000)
  return db.$executeRaw`
    DELETE FROM "PrintJob" WHERE ctid IN (
      SELECT ctid FROM "PrintJob"
      WHERE "tenantId" = ${tenantId}
        AND state IN ('ACEPTADO', 'INCIERTO', 'FALLIDO', 'CONFIRMADO')
        AND "createdAt" < ${limite}
      LIMIT ${PURGA_LOTE_MAX}
    )
  `
}

/**
 * Reencola los leases vencidos de la empresa: `PENDIENTE` mientras queden
 * intentos, `FALLIDO` al agotarlos. Cada transición se decide con la función
 * pura y se guarda contra un `updateMany` condicionado por estado/vencimiento,
 * de modo que dos claims concurrentes no transicionan el mismo trabajo dos
 * veces. Devuelve los cambios para auditar.
 */
export async function reencolarVencidos(
  db: Pick<PrismaClient, 'printJob'>,
  tenantId: string,
  ahora: Date = new Date(),
): Promise<Array<{ id: string; attempts: number; state: EstadoRequeue }>> {
  const vencidos = await db.printJob.findMany({
    where: { tenantId, state: 'RECLAMADO', leaseExpiresAt: { lt: ahora } },
    select: { id: true, attempts: true, leaseExpiresAt: true },
    orderBy: { leaseExpiresAt: 'asc' },
    take: MAX_ABIERTOS_POR_EMPRESA,
  })
  const cambios: Array<{ id: string; attempts: number; state: EstadoRequeue }> = []
  for (const vencido of vencidos) {
    const destino = calcularRequeue(vencido.attempts, vencido.leaseExpiresAt, ahora)
    if (!destino) continue
    const cambio = await db.printJob.updateMany({
      where: { id: vencido.id, tenantId, state: 'RECLAMADO', leaseExpiresAt: { lt: ahora } },
      data: destino === 'PENDIENTE'
        ? { state: 'PENDIENTE', leaseId: null, leaseExpiresAt: null }
        : { state: 'FALLIDO', leaseId: null, leaseExpiresAt: null, error: MOTIVO_LEASE_VENCIDO },
    })
    if (cambio.count) cambios.push({ id: vencido.id, attempts: vencido.attempts, state: destino })
  }
  return cambios
}

/**
 * Claim atómico: un solo `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP
 * LOCKED)` mueve el trabajo más viejo a `RECLAMADO` con lease e incrementa los
 * intentos. Dos puentes concurrentes nunca obtienen el mismo trabajo.
 * `claimedAt`/`updatedAt` usan el instante JS (no `now()`): las columnas
 * `timestamp` se escriben en UTC desde Prisma y mezclar la hora local del
 * motor rompería la extensión del lease.
 */
export async function reclamarTrabajo(
  db: Pick<PrismaClient, '$queryRaw'>,
  tenantId: string,
  bridgeId: string,
  ahora: Date = new Date(),
): Promise<PrintJob | null> {
  const leaseId = randomBytes(16).toString('hex')
  const vencimiento = new Date(ahora.getTime() + LEASE_MS)
  const filas = await db.$queryRaw<PrintJob[]>`
    UPDATE "PrintJob" SET
      state = 'RECLAMADO',
      "leaseId" = ${leaseId},
      "leaseExpiresAt" = ${vencimiento},
      "claimedAt" = ${ahora},
      attempts = attempts + 1,
      "updatedAt" = ${ahora}
    WHERE id = (
      SELECT id FROM "PrintJob"
      WHERE "tenantId" = ${tenantId} AND state = 'PENDIENTE' AND ("bridgeId" IS NULL OR "bridgeId" = ${bridgeId})
      ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `
  return filas[0] ?? null
}
