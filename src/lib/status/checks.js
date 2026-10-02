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
const degraded = (detail) => ({ state: 'degraded', detail })
const restricted = (detail) => ({ state: 'restricted', detail })
const unverifiable = (detail) => ({ state: 'unverifiable', detail })

// #295: estados públicos honestos. `restricted` (requiere sesión) y
// `unverifiable` (no comprobable sin sesión o sin depender del proveedor) NO
// cuentan como degradación: la página pública no puede anunciar una caída que
// solo existe porque el chequeo no tenía permisos para mirar.
export const ESTADOS_PUBLICOS = ['operational', 'degraded', 'restricted', 'unverifiable']

/**
 * Resumen del estado público a partir de los servicios comprobados.
 * `degradado` es la ÚNICA señal que amerita el aviso de degradación; los
 * servicios que requieren sesión o no son verificables públicamente se
 * informan aparte. Los servicios externos no cuentan (tienen su propia fuente).
 */
export function resumenEstadoPublico(services = {}) {
  const lista = Object.values(services || {}).filter((servicio) => servicio && ESTADOS_PUBLICOS.includes(servicio.state))
  const contar = (estado) => lista.filter((servicio) => servicio.state === estado).length
  return {
    total: lista.length,
    operativos: contar('operational'),
    degradados: contar('degraded'),
    restringidos: contar('restricted'),
    noVerificables: contar('unverifiable'),
    degradado: lista.some((servicio) => servicio.state === 'degraded'),
  }
}

export async function checkMobosStatus() {
  const stamp = Date.now()
  const [appResult, healthResult, authResult, reservationResult] = await Promise.allSettled([
    // #295: el sitio de la app no autoriza CORS a `moboss.online` (comprobado en
    // producción), así que un fetch normal se bloquea y parecía una caída.
    // `no-cors` responde opaco y solo falla si el host no contesta de verdad.
    request(`${publicUrls.app}/?status=${stamp}`, { mode: 'no-cors' }),
    jsonCheck(`${publicUrls.api}/api/health?status=${stamp}`),
    jsonCheck(`${publicUrls.api}/api/auth/google?status=1&stamp=${stamp}`),
    request(`${publicUrls.api}/api/inventory-reservations?status=${stamp}`),
  ])
  const app = appResult.status === 'fulfilled'
    ? operational('La aplicación respondió a la comprobación de red.')
    : unverifiable('La aplicación no respondió a la comprobación pública desde este navegador.')
  const health = healthResult.status === 'fulfilled' ? healthResult.value : null
  // #295: el API puede estar operativo aunque la base no responda (health 503).
  // Se evalúa servicio por servicio y no se arrastra la caída de la base.
  const api = !health?.response
    ? unverifiable('No se pudo consultar el healthcheck del API desde este navegador.')
    : health.body?.services?.api === 'operational'
      ? operational(health.response.ok ? 'El healthcheck del API respondió correctamente.' : 'El API respondió el healthcheck; la base de datos no confirmó disponibilidad.')
      : unverifiable('El API respondió sin un healthcheck reconocible.')
  const database = !health?.response
    ? unverifiable('El API no respondió, así que no se puede verificar la base de datos.')
    : health.body?.services?.database === 'operational'
      ? operational('El API confirmó conexión vigente con PostgreSQL.')
      : health.body?.services?.database === 'unavailable'
        ? degraded('El API no logró conectar con PostgreSQL.')
        : unverifiable('El API respondió sin confirmar el estado de la base de datos.')
  const auth = authResult.status !== 'fulfilled'
    ? unverifiable('No se pudo verificar Google OAuth desde esta comprobación pública.')
    : authResult.value.response.ok && authResult.value.body?.configured === true
      ? operational('Google OAuth está configurado en el API.')
      : authResult.value.response.status === 503
        ? degraded('El API respondió que Google OAuth no está configurado.')
        : degraded('No se confirmó la configuración de Google OAuth.')
  // #295: la configuración del correo se puede leer, pero el envío real no se
  // verifica sin una sesión: se informa como no verificable públicamente.
  const email = health?.body?.services?.email === 'configured'
    ? unverifiable('El API confirmó la configuración del correo transaccional; el envío real no es verificable públicamente.')
    : health?.body?.services?.email === 'unconfigured'
      ? degraded('El API confirmó que el correo transaccional no está configurado.')
      : unverifiable('No se pudo leer la configuración del correo desde la comprobación pública.')
  const reservations = reservationResult.status !== 'fulfilled'
    ? unverifiable('No se pudo comprobar el endpoint de reservas desde este navegador.')
    : reservationResult.value.ok
      ? operational('El endpoint de reservas respondió públicamente.')
      : [401, 403].includes(reservationResult.value.status)
        ? restricted('Las reservas solo se verifican dentro de una sesión autorizada; el endpoint respondió y no está caído.')
        : degraded('El endpoint de reservas respondió con un error.')
  return { checkedAt: new Date(), services: { app, api, database, auth, email, reservations } }
}
