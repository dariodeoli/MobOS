// Reglas puras del segundo factor del panel de plataforma (PIN del dueño).
// Sin base de datos: pin.ts trae el estado y el reloj de Postgres y esta
// función decide. Cada intento se cuenta ANTES de verificar el PIN.
export const PIN_INTENTOS_MAX = 5
export const PIN_VENTANA_MS = 15 * 60_000
export const PIN_BLOQUEO_MS = 15 * 60_000
export const PIN_VIGENCIA_HORAS = 12

export type EstadoGuardia = { failures: number; windowStartedAt: Date; lockedUntil: Date | null }

export type ReservaIntento =
  | { permitido: false; segundos: number }
  | { permitido: true; siguiente: EstadoGuardia; restantes: number }

/** Reserva un intento: bloqueado devuelve los segundos que faltan; si no, el estado nuevo. */
export function reservarIntento(estado: EstadoGuardia | null, ahora: Date): ReservaIntento {
  if (estado?.lockedUntil && estado.lockedUntil.getTime() > ahora.getTime()) {
    return { permitido: false, segundos: Math.max(1, Math.ceil((estado.lockedUntil.getTime() - ahora.getTime()) / 1000)) }
  }
  const reinicia = !estado || estado.lockedUntil !== null || ahora.getTime() - estado.windowStartedAt.getTime() >= PIN_VENTANA_MS
  const failures = reinicia || !estado ? 1 : estado.failures + 1
  const windowStartedAt = reinicia || !estado ? ahora : estado.windowStartedAt
  const lockedUntil = failures >= PIN_INTENTOS_MAX ? new Date(ahora.getTime() + PIN_BLOQUEO_MS) : null
  return { permitido: true, siguiente: { failures, windowStartedAt, lockedUntil }, restantes: Math.max(0, PIN_INTENTOS_MAX - failures) }
}
