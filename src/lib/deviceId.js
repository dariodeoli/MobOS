// Identificador estable de este dispositivo/navegador. Se usa al registrar la
// empresa, entrar y aceptar invitaciones para que el servidor pueda listar y
// revocar sesiones por dispositivo (docs/PLANTILLA-OBJETOS.md §7). Si el
// navegador no permite persistir, devuelve un id efímero en vez de romper el
// flujo. El entorno es inyectable para los tests.

const CLAVE = 'mobos:device-id'

export function deviceId(entorno = globalThis) {
  try {
    const existente = entorno?.localStorage?.getItem(CLAVE)
    if (existente) return existente
    const nuevo = generarId(entorno)
    entorno?.localStorage?.setItem(CLAVE, nuevo)
    return nuevo
  } catch {
    return generarId(entorno)
  }
}

function generarId(entorno) {
  try {
    if (entorno?.crypto?.randomUUID) return entorno.crypto.randomUUID()
  } catch { /* sin crypto */ }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
