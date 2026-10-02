// Modo demo (#192/#201): la marca de la pestaña y el rol elegido.
// #324: la demo cubre los seis roles del sistema (Dueño, Gerente, Vendedor,
// Caja, Técnico y Delivery). El rol guardado se valida contra esa lista; sin
// dato (o inválido) la sesión cae a Vendedor, como antes.
const KEY = 'mobos:demo-session'
export const ROLES_DEMO = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO', 'REPARTIDOR']
export function demoSessionActive() {
  try { return sessionStorage.getItem(KEY) === 'active' } catch { return false }
}
export const isDemoRuntime = typeof window !== 'undefined' &&
  (window.location.pathname === '/demo' || demoSessionActive())
export function demoSessionRole() {
  try {
    const rol = sessionStorage.getItem(`${KEY}:role`)
    return ROLES_DEMO.includes(rol) ? rol : 'VENDEDOR'
  } catch { return 'VENDEDOR' }
}
export function saveDemoSession(role = 'VENDEDOR') {
  const valido = ROLES_DEMO.includes(role) ? role : 'VENDEDOR'
  try {
    sessionStorage.setItem(KEY, 'active')
    sessionStorage.setItem(`${KEY}:role`, valido)
  } catch { /* almacenamiento bloqueado: la sesión no persiste */ }
}
export function clearDemoSession() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(`${KEY}:role`)
  } catch { /* noop */ }
}
