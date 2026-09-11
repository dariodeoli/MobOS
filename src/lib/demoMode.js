const KEY = 'mobos:demo-session'
export function demoSessionActive() {
  try { return sessionStorage.getItem(KEY) === 'active' } catch { return false }
}
export const isDemoRuntime = typeof window !== 'undefined' &&
  (window.location.pathname === '/demo' || demoSessionActive())
export function demoSessionRole() { return sessionStorage.getItem(`${KEY}:role`) === 'ADMIN' ? 'ADMIN' : 'VENDEDOR' }
export function saveDemoSession(role = 'VENDEDOR') { sessionStorage.setItem(KEY, 'active'); sessionStorage.setItem(`${KEY}:role`, role === 'ADMIN' ? 'ADMIN' : 'VENDEDOR') }
export function clearDemoSession() { sessionStorage.removeItem(KEY); sessionStorage.removeItem(`${KEY}:role`) }
