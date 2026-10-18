const MENSAJES_GENERALES_403 = new Set(['no autorizado.', 'forbidden', 'la api respondió con 403.'])

/** Explica el 403 de políticas como un límite de rol, sin sugerir que venció la sesión. */
export function mensajeErrorPoliticas(error, accion = 'leer') {
  const mensaje = typeof error?.message === 'string' ? error.message.trim() : ''
  if (Number(error?.status) === 403) {
    const verbo = accion === 'guardar' ? 'guardar' : 'ver'
    if (!mensaje || MENSAJES_GENERALES_403.has(mensaje.toLowerCase())) {
      return `Solo el dueño de esta empresa puede ${verbo} las políticas completas. Tu sesión sigue activa; cambiá al perfil de dueño o pedí acceso.`
    }
    if (/^solo el dueño puede/i.test(mensaje)) {
      return `${mensaje} Tu sesión sigue activa; cambiá al perfil de dueño o pedí acceso.`
    }
  }
  return mensaje || (accion === 'guardar' ? 'No se pudo guardar la política.' : 'No se pudieron cargar las políticas.')
}
