import { api } from './api/client'

const MAX_MESSAGE_CHARS = 500
const MAX_URL_CHARS = 200
const MAX_STACK_LINES = 20
const MAX_STACK_CHARS = 2000
const DEDUP_WINDOW_MS = 60 * 1000
const LIMIT_WINDOW_MS = 5 * 60 * 1000
const LIMIT_MAX_SENDS = 10

const recentKeys = new Map()
const sendTimes = []

function truncate(value, max) {
  if (typeof value !== 'string' || !value) return ''
  return value.length > max ? value.slice(0, max) : value
}

// Solo líneas de código propio: descarta frames de bundles, node_modules y CDNs.
function scrubStack(stack) {
  if (typeof stack !== 'string' || !stack) return ''
  const lines = stack.split('\n')
  const own = lines.filter(
    (line) =>
      !line.includes('node_modules') &&
      !line.includes('webpack') &&
      !line.includes('vite') &&
      !line.includes('cdn.'),
  )
  const selected = (own.length > 0 ? own : lines).slice(0, MAX_STACK_LINES)
  return truncate(selected.join('\n'), MAX_STACK_CHARS)
}

function allowed(key) {
  const now = Date.now()
  const last = recentKeys.get(key)
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return false

  while (sendTimes.length > 0 && now - sendTimes[0] > LIMIT_WINDOW_MS) sendTimes.shift()
  if (sendTimes.length >= LIMIT_MAX_SENDS) return false

  recentKeys.set(key, now)
  sendTimes.push(now)

  // Poda ocasional para que el mapa de dedup no crezca sin límite.
  if (recentKeys.size > 200) {
    for (const [entryKey, entryTime] of recentKeys) {
      if (now - entryTime >= DEDUP_WINDOW_MS) recentKeys.delete(entryKey)
    }
  }
  return true
}

function report(error, kind) {
  try {
    const message = truncate(error?.message || String(error ?? ''), MAX_MESSAGE_CHARS)
    const url = truncate(window.location.pathname, MAX_URL_CHARS)
    if (!message || !allowed(`${message}\u0000${url}`)) return
    const body = {
      message,
      url,
      stack: scrubStack(error?.stack),
      kind,
    }
    api.post('/api/errors', body).catch(() => {})
  } catch {
    // El tracker nunca debe romper la app ni reenviarse a sí mismo.
  }
}

export function installErrorTracking() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    report(event.error || event.message, 'unhandled')
  })

  window.addEventListener('unhandledrejection', (event) => {
    report(event.reason, 'rejection')
  })
}
