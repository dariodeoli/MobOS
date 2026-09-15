import { publicUrls } from '../urls.js'

const TIMEOUT_MS = 8_000

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try { return await fetch(url, { cache: 'no-store', ...options, signal: controller.signal }) } finally { window.clearTimeout(timer) }
}

async function jsonCheck(url, options) {
  const response = await request(url, options)
  return { response, body: await response.json().catch(() => null) }
}

const operational = (detail) => ({ state: 'operational', detail })
const configured = (detail) => ({ state: 'configured', detail })
const degraded = (detail) => ({ state: 'degraded', detail })
const restricted = (detail) => ({ state: 'restricted', detail })

export async function checkMobosStatus() {
  const stamp = Date.now()
  const [appResult, healthResult, authResult, reservationResult] = await Promise.allSettled([
    request(`${publicUrls.app}/?status=${stamp}`),
    jsonCheck(`${publicUrls.api}/api/health?status=${stamp}`),
    jsonCheck(`${publicUrls.api}/api/auth/google?status=1`),
    request(`${publicUrls.api}/api/inventory-reservations?status=${stamp}`),
  ])
  const app = appResult.status === 'fulfilled' && appResult.value.ok ? operational('La aplicación respondió HTTP correctamente.') : degraded('La aplicación no respondió a la comprobación pública.')
  const health = healthResult.status === 'fulfilled' ? healthResult.value : null
  const api = health?.response.ok && health.body?.ok && health.body?.services?.api === 'operational' ? operational('El healthcheck del API respondió correctamente.') : degraded('El healthcheck del API no confirmó disponibilidad.')
  const database = health?.response.ok && health.body?.services?.database === 'operational' ? operational('El API confirmó conexión vigente con PostgreSQL.') : degraded('El API no confirmó conexión con PostgreSQL.')
  const auth = authResult.status === 'fulfilled' && authResult.value.response.ok && authResult.value.body?.configured === true ? operational('Google OAuth está configurado en el API.') : degraded('No se confirmó la configuración de Google OAuth.')
  const email = health?.body?.services?.email === 'configured' ? configured('El API confirmó la configuración del correo transaccional; esta comprobación no prueba alcance del relay.') : degraded('El API no confirmó la configuración del correo transaccional.')
  const reservations = reservationResult.status === 'fulfilled' && reservationResult.value.ok ? operational('El endpoint de reservas respondió autenticado.') : reservationResult.status === 'fulfilled' && [401, 403].includes(reservationResult.value.status) ? restricted('El endpoint respondió, pero las reservas se verifican dentro de una sesión autorizada.') : degraded('No se pudo comprobar el endpoint de reservas.')
  return { checkedAt: new Date(), services: { app, api, database, auth, email, reservations } }
}
