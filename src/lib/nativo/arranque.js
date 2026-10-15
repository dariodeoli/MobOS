import { fijarVersionNativa, isNativeIOS } from '../plataforma.js'
import { cargarTokens, limpiarTokens } from '../api/nativo.js'

// Arranque de la app de iPhone: antes del primer render se lee la versión del
// bundle y los tokens del Keychain (el primer pedido ya sale con Bearer), y
// después del render se muestra la UI quitando el splash.

const CLAVE_INSTALADO = 'mobos:instalado'

/**
 * El Keychain sobrevive a desinstalar la app pero localStorage no: si no hay
 * marca de instalación, los tokens que haya son de una instalación anterior y
 * se descartan (nadie queda con sesión «fantasma» tras reinstalar).
 */
export function esPrimeraEjecucion(almacenamiento = globalThis.localStorage) {
  try {
    if (almacenamiento.getItem(CLAVE_INSTALADO)) return false
    almacenamiento.setItem(CLAVE_INSTALADO, '1')
    return true
  } catch { return false }
}

/** Un puente nativo que no responde no puede dejar la app en el splash. */
export function conLimite(promesa, ms = 2500) {
  let timer
  const limite = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), ms) })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer))
}

export async function prepararNativo() {
  if (!isNativeIOS()) return
  try {
    const { App } = await import('@capacitor/app')
    const info = await conLimite(App.getInfo())
    fijarVersionNativa(info?.version)
  } catch (error) {
    console.error('[nativo] no se pudo leer la versión de la app:', error)
  }
  try {
    if (esPrimeraEjecucion()) await conLimite(limpiarTokens())
    else await conLimite(cargarTokens())
  } catch (error) {
    console.error('[nativo] no se pudo abrir el Keychain:', error)
  }
  document.documentElement.classList.add('app-ios')
  await conLimite(sincronizarBarraDeEstado())
  observarTema()
}

// La barra de estado sigue al tema: texto oscuro sobre fondo claro y al revés.
async function sincronizarBarraDeEstado() {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    const oscuro = document.documentElement.classList.contains('dark')
    await StatusBar.setStyle({ style: oscuro ? Style.Dark : Style.Light })
  } catch { /* sin barra de estado controlable */ }
}

function observarTema() {
  try {
    new MutationObserver(() => { sincronizarBarraDeEstado() }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  } catch { /* sin MutationObserver */ }
}

/** Quita el splash cuando React ya pintó la primera pantalla. */
export async function mostrarApp() {
  if (!isNativeIOS()) return
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 200 })
  } catch { /* sin splash */ }
}
