// Ventana de recuperación de una empresa archivada.
//
// Archivar conserva todo el historial y deja la empresa fuera de juego; el
// dueño puede restaurarla con correo, contraseña y la confirmación RESTORE
// durante este plazo. Pasado el plazo, la restauración queda en manos de
// soporte (el endpoint responde 409) y la eliminación definitiva sigue
// disponible desde la app.
export const RECOVERY_WINDOW_DAYS = 30

export function recoveryDeadline(now = new Date()) {
  return new Date(now.getTime() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

export function isRecoveryOpen(archivedAt: Date | null, recoverableUntil: Date | null, now = new Date()) {
  if (!archivedAt) return false
  // Sin plazo registrado (empresas archivadas antes de esta ventana) la
  // recuperación sigue abierta: no se castiga a quien ya estaba archivado.
  if (!recoverableUntil) return true
  return recoverableUntil.getTime() > now.getTime()
}
