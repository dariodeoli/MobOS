import bcrypt from 'bcryptjs'
import { prisma } from '../prisma'
import { logInfo } from '../log'
import { largoPinDe, pinValido } from '../pin'
import { PIN_BLOQUEO_MS, PIN_VIGENCIA_HORAS, reservarIntento, type EstadoGuardia } from './pin-reglas'

export type ResultadoPin =
  | { estado: 'ok' }
  | { estado: 'incorrecto'; restantes: number }
  | { estado: 'bloqueado'; segundos: number }

// Hash bcrypt de relleno: si el usuario no existe se compara igual (mismo tiempo).
const HASH_RELLENO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.lSHkAEZPAbM5Ma5n4e9nXc4l5W9S'

/** Largo del PIN del usuario (4 por defecto): la pantalla valida sola al completarlo. */
export async function largoPinDueno(userId: string): Promise<number> {
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { pinLength: true } })
  return largoPinDe(usuario?.pinLength)
}

/** ¿Esta sesión ingresó el PIN hace menos de PIN_VIGENCIA_HORAS? El reloj es el de Postgres. */
export async function pinVigente(sessionId: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    SELECT ("superadminVerifiedAt" IS NOT NULL
            AND "superadminVerifiedAt" > (now() AT TIME ZONE 'UTC') - make_interval(hours => ${PIN_VIGENCIA_HORAS}::int)) AS "ok"
    FROM "Session" WHERE "id" = ${sessionId} AND "revokedAt" IS NULL`
  return filas[0]?.ok === true
}

/**
 * Verifica el PIN personal del dueño (el mismo del vendedor: User.pinHash) y,
 * si coincide, marca ESTA sesión como verificada. El intento se cuenta por
 * usuario (no por IP) y antes de comparar, con la fila bloqueada: pedidos en
 * paralelo no pueden verificar más de 5 PIN por ventana.
 */
export async function verificarPinDueno(userId: string, sessionId: string, pin: unknown): Promise<ResultadoPin> {
  const reserva = await prisma.$transaction(async tx => {
    const [{ ahora }] = await tx.$queryRaw<Array<{ ahora: Date }>>`SELECT (now() AT TIME ZONE 'UTC') AS "ahora"`
    // Las columnas son timestamp sin zona (UTC): se escriben siempre convertidas
    // con AT TIME ZONE 'UTC', nunca como parámetro Date (lo tomaría en hora local).
    await tx.$executeRaw`INSERT INTO "SuperadminPinGuard" ("userId", "failures", "windowStartedAt") VALUES (${userId}, 0, (${ahora.toISOString()}::timestamptz AT TIME ZONE 'UTC')) ON CONFLICT ("userId") DO NOTHING`
    const [estado] = await tx.$queryRaw<EstadoGuardia[]>`SELECT "failures", "windowStartedAt", "lockedUntil" FROM "SuperadminPinGuard" WHERE "userId" = ${userId} FOR UPDATE`
    const decision = reservarIntento(estado ?? null, ahora)
    if (decision.permitido) {
      const s = decision.siguiente
      const ventana = s.windowStartedAt.toISOString()
      const bloqueo = s.lockedUntil ? s.lockedUntil.toISOString() : null
      await tx.$executeRaw`UPDATE "SuperadminPinGuard" SET "failures" = ${s.failures}, "windowStartedAt" = (${ventana}::timestamptz AT TIME ZONE 'UTC'), "lockedUntil" = (${bloqueo}::timestamptz AT TIME ZONE 'UTC') WHERE "userId" = ${userId}`
    }
    return decision
  })
  if (!reserva.permitido) {
    logInfo('superadmin_pin_bloqueado', { motivo: 'bloqueo_activo' })
    return { estado: 'bloqueado', segundos: reserva.segundos }
  }

  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true, pinLength: true } })
  const largo = largoPinDe(usuario?.pinLength)
  const formatoOk = pinValido(pin) && pin.length === largo
  // bcrypt corre siempre (también con formato inválido) y compara en tiempo constante.
  const hashOk = await bcrypt.compare(formatoOk ? pin : '0'.repeat(largo), usuario?.pinHash ?? HASH_RELLENO).catch(() => false)

  if (!(formatoOk && hashOk && usuario)) {
    logInfo('superadmin_pin_incorrecto', { restantes: reserva.restantes })
    return reserva.siguiente.lockedUntil
      ? { estado: 'bloqueado', segundos: PIN_BLOQUEO_MS / 1000 }
      : { estado: 'incorrecto', restantes: reserva.restantes }
  }

  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Session" SET "superadminVerifiedAt" = (now() AT TIME ZONE 'UTC') WHERE "id" = ${sessionId} AND "revokedAt" IS NULL`,
    prisma.$executeRaw`DELETE FROM "SuperadminPinGuard" WHERE "userId" = ${userId}`,
  ])
  logInfo('superadmin_pin_ok', {})
  return { estado: 'ok' }
}
