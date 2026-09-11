const KEY = 'mobos:demo-session'
export function demoSessionActive() {
  try { return sessionStorage.getItem(KEY) === 'active' } catch { return false }
}
export const isDemoRuntime = typeof window !== 'undefined' &&
  (window.location.pathname === '/demo' || demoSessionActive())
export function saveDemoSession() { sessionStorage.setItem(KEY, 'active') }
export function clearDemoSession() { sessionStorage.removeItem(KEY) }
