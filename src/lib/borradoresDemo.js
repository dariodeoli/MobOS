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
