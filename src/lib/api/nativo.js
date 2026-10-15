import { clienteNativo, isNativeIOS } from '../plataforma.js'

// Sesión del cliente nativo (app de iPhone). El navegador sigue usando cookies
// HttpOnly; la app, que no comparte cookies con el API, manda un Bearer. Los
// tokens viven SOLO en el Keychain de iOS (plugin de almacenamiento seguro) y
// en memoria: nunca en localStorage ni en sessionStorage.

const CLAVE_TOKEN = 'mobos.token'
const CLAVE_VENDEDOR = 'mobos.sellerToken'
const CLAVE_VENCE = 'mobos.expiresAt'

// Serializar escritura y limpieza impide que una escritura lenta termine
// después del logout y vuelva a colocar credenciales en el Keychain.
let colaEscrituras = Promise.resolve()
function persistir(operacion) {
  const resultado = colaEscrituras.then(operacion)
  colaEscrituras = resultado.catch(() => {})
  return resultado
}
let almacenInyectado = null
let memoria = { token: null, sellerToken: null, expiresAt: null }
let revisionMemoria = 0

/** Solo para tests: reemplaza el Keychain por un almacén en memoria. */
export function usarAlmacen(almacen) {
  almacenInyectado = almacen
  revisionMemoria++
  memoria = { token: null, sellerToken: null, expiresAt: null }
}

async function almacen() {
  if (almacenInyectado) return almacenInyectado
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage')
  // Sin sincronizar con iCloud y sin migrar a otro dispositivo.
  await SecureStorage.setSynchronize(false).catch(() => {})
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly).catch(() => {})
  almacenInyectado = {
    get: async (clave) => (await SecureStorage.getItem(clave).catch(() => null)) ?? null,
    set: (clave, valor) => SecureStorage.setItem(clave, valor),
    remove: (clave) => SecureStorage.removeItem(clave).catch(() => {}),
  }
  return almacenInyectado
}

/** Lee los tokens del Keychain al arrancar la app. */
export async function cargarTokens() {
  const revision = revisionMemoria
  await colaEscrituras
  const a = await almacen()
  const [token, sellerToken, expiresAt] = await Promise.all([a.get(CLAVE_TOKEN), a.get(CLAVE_VENDEDOR), a.get(CLAVE_VENCE)])
  if (revision !== revisionMemoria) return { ...memoria }
  memoria = { token: token || null, sellerToken: sellerToken || null, expiresAt: expiresAt || null }
  return { ...memoria }
}

/**
 * Guarda los tokens que el API devuelve en el cuerpo de login/PIN/Google/Apple
 * a los clientes nativos: `{ token, sellerToken?, expiresAt }`. Un campo que no
 * viene conserva el anterior (el PIN trae sellerToken sin repetir token).
 */
export async function guardarTokens(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') return
  const siguiente = {
    token: typeof cuerpo.token === 'string' && cuerpo.token ? cuerpo.token : memoria.token,
    sellerToken: typeof cuerpo.sellerToken === 'string' && cuerpo.sellerToken ? cuerpo.sellerToken : memoria.sellerToken,
    expiresAt: cuerpo.expiresAt ? String(cuerpo.expiresAt) : memoria.expiresAt,
  }
  if (siguiente.token === memoria.token && siguiente.sellerToken === memoria.sellerToken && siguiente.expiresAt === memoria.expiresAt) return
  revisionMemoria++
  memoria = siguiente
  return persistir(async () => {
  const a = await almacen()
  await Promise.all([
    siguiente.token ? a.set(CLAVE_TOKEN, siguiente.token) : a.remove(CLAVE_TOKEN),
    siguiente.sellerToken ? a.set(CLAVE_VENDEDOR, siguiente.sellerToken) : a.remove(CLAVE_VENDEDOR),
    siguiente.expiresAt ? a.set(CLAVE_VENCE, siguiente.expiresAt) : a.remove(CLAVE_VENCE),
  ])
  })
}

/** Borra los tokens (logout, 401 de sesión): memoria primero, después Keychain. */
export async function limpiarTokens() {
  revisionMemoria++
  memoria = { token: null, sellerToken: null, expiresAt: null }
  return persistir(async () => {
  const a = await almacen()
  await Promise.all([a.remove(CLAVE_TOKEN), a.remove(CLAVE_VENDEDOR), a.remove(CLAVE_VENCE)])
  })
}

export function hayTokens() {
  return Boolean(memoria.token || memoria.sellerToken)
}

export function expiracion() {
  return memoria.expiresAt
}

/**
 * Encabezados de un pedido nativo. El PIN se autentica con el token de la
 * empresa (todavía no hay vendedor); el resto, con el del vendedor si existe.
 */
export function cabecerasNativas(ruta = '') {
  const cabeceras = { 'X-MobOS-Client': clienteNativo() }
  const esPin = /\/api\/auth\/pin(\?|$)/.test(String(ruta))
  const token = esPin ? (memoria.token || memoria.sellerToken) : (memoria.sellerToken || memoria.token)
  if (token) cabeceras.Authorization = `Bearer ${token}`
  return cabeceras
}

/** ¿Este pedido sale desde la app nativa? (cookies fuera, Bearer adentro). */
export function esModoNativo(capacitor) {
  return isNativeIOS(capacitor)
}

/** Opciones de `fetch` según el modo: web con cookies, nativo sin ellas. */
export function opcionesDeSesion(ruta, capacitor) {
  if (!esModoNativo(capacitor)) return { credentials: 'include', headers: {} }
  return { credentials: 'omit', headers: cabecerasNativas(ruta) }
}
