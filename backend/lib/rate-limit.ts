import { error } from './http'
import { trustedClientIp } from './auth'

// Ventana deslizante en memoria por clave `ip:route`. Cada clave guarda un
// array de timestamps; la limpieza es perezosa (se poda al consultar). Sin IP
// verificada (MOBOS_TRUST_PROXY) no se limita, igual que el rate limit de
// autenticación: un encabezado falsificado no debe elegir el bucket de otro.
const windows = new Map<string, number[]>()

export function resetRateLimitsForTests() {
  windows.clear()
}

/**
 * Aplica el límite si corresponde. Devuelve una respuesta 429 con Retry-After
 * cuando se excedió, o null cuando la solicitud está permitida.
 */
export function enforceRateLimit(request: Request, route: string, max: number, windowMs: number): Response | null {
  const ip = trustedClientIp(request)
  if (!ip) return null
  const key = `${ip}:${route}`
  const now = Date.now()
  const cutoff = now - windowMs
  const hits = windows.get(key) ?? []
  while (hits.length && hits[0] <= cutoff) hits.shift()
  if (hits.length >= max) {
    windows.set(key, hits)
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
    const response = error('Demasiadas solicitudes. Esperá un momento e intentá nuevamente.', 429)
    response.headers.set('Retry-After', String(retryAfterSeconds))
    return response
  }
  hits.push(now)
  windows.set(key, hits)
  return null
}
