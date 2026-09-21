// Preferencias del dispositivo por persona: se guardan en el navegador (no en
// la empresa) porque son de la sesión de trabajo: tema, minutos de bloqueo por
// inactividad y si se muestran las notificaciones.
export const BLOQUEOS_MINUTOS = [1, 5, 10, 15, 30]
export const PREFERENCIAS_DEFAULT = { bloqueoMinutos: 10, notificaciones: true }
export const EVENTO_PREFERENCIAS = 'mobos:preferencias'

const clave = (userId) => `mobos:preferencias:${userId || 'anon'}`

function normalizar(valor) {
  const minutos = Number(valor?.bloqueoMinutos)
  return {
    bloqueoMinutos: BLOQUEOS_MINUTOS.includes(minutos) ? minutos : PREFERENCIAS_DEFAULT.bloqueoMinutos,
    notificaciones: valor?.notificaciones !== false,
  }
}

export function leerPreferencias(userId) {
  try {
    return normalizar(JSON.parse(localStorage.getItem(clave(userId)) || 'null'))
  } catch {
    return { ...PREFERENCIAS_DEFAULT }
  }
}

export function guardarPreferencias(userId, cambios) {
  const siguientes = normalizar({ ...leerPreferencias(userId), ...cambios })
  try {
    localStorage.setItem(clave(userId), JSON.stringify(siguientes))
  } catch {
    // Sin persistencia las preferencias valen para esta pestaña.
  }
  return siguientes
}

export function avisarPreferencias() {
  try {
    window.dispatchEvent(new Event(EVENTO_PREFERENCIAS))
  } catch {
    // Entorno sin window (tests puros): no hay nada que avisar.
  }
}
