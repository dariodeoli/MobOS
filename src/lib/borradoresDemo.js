// Borradores (ventas suspendidas) en modo demo (#148 §20): viven en el
// navegador, con el mismo payload que arma el POS para el servidor. Permiten
// mostrar el flujo completo (crear, listar) sin tocar el API real.
const CLAVE = 'mobos:demo-borradores:v1'

export function listarBorradoresDemo() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    const filas = crudo ? JSON.parse(crudo) : []
    return Array.isArray(filas) ? filas : []
  } catch {
    return []
  }
}

export function guardarBorradorDemo(borrador) {
  if (!borrador?.id) return false
  try {
    localStorage.setItem(CLAVE, JSON.stringify([borrador, ...listarBorradoresDemo()].slice(0, 50)))
    return true
  } catch {
    return false
  }
}

export function borrarBorradorDemo(id) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(listarBorradoresDemo().filter(fila => fila.id !== id)))
    return true
  } catch {
    return false
  }
}

// #279 A2: retomar un borrador no lo borra: queda marcado con quién lo retomó y
// cuándo, con la misma forma que el servidor, para que la lista lo refleje.
export function marcarBorradorRetomadoDemo(id, user = null) {
  try {
    const filas = listarBorradoresDemo().map(fila => fila.id === id
      ? { ...fila, resumedAt: fila.resumedAt || new Date().toISOString(), resumedBy: fila.resumedBy || (user ? { id: user.id, name: user.name } : null) }
      : fila)
    localStorage.setItem(CLAVE, JSON.stringify(filas))
    return true
  } catch {
    return false
  }
}
