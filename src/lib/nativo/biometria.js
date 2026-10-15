import { isNativeIOS } from '../plataforma.js'

// Face ID opcional como protección EXTRA al abrir la app (Configuración, solo
// dueño/administrador, apagado por defecto). Nunca reemplaza al PIN: con el
// ajuste activo se pide Face ID primero y después el PIN privado del vendedor
// (ver lib/nativo/bloqueo.js). El ajuste es del equipo, no de la cuenta.
// Si Face ID falla, el plugin ofrece el código del iPhone como respaldo.

const CLAVE_AJUSTE = 'mobos:face-id-al-abrir'

export function faceIdAlAbrir(almacen = globalThis.localStorage) {
  try { return almacen.getItem(CLAVE_AJUSTE) === '1' } catch { return false }
}

export function fijarFaceIdAlAbrir(activo, almacen = globalThis.localStorage) {
  try {
    if (activo) almacen.setItem(CLAVE_AJUSTE, '1')
    else almacen.removeItem(CLAVE_AJUSTE)
  } catch { /* sin almacenamiento: queda apagado */ }
}

// El plugin se devuelve dentro de un objeto: un `await` sobre el proxy de
// Capacitor llamaría a `.then()` y fallaría con «not implemented».
async function plugin() {
  return { p: (await import('@aparajita/capacitor-biometric-auth')).BiometricAuth }
}

/** Qué biometría tiene el equipo: 'faceId' | 'touchId' | null. */
export async function tipoBiometria() {
  if (!isNativeIOS()) return null
  try {
    const info = await (await plugin()).p.checkBiometry()
    if (!info?.isAvailable) return null
    return info.biometryTypes?.includes?.(2) || info.biometryType === 2 ? 'faceId' : 'touchId'
  } catch { return null }
}

export const nombreBiometria = (tipo) => (tipo === 'touchId' ? 'Touch ID' : 'Face ID')

/**
 * Pide Face ID (con el código del iPhone como respaldo del sistema).
 * Devuelve true si se verificó. Cualquier error o cancelación devuelve false.
 */
export async function verificarBiometria(motivo = 'Abrí MobOS') {
  try {
    await (await plugin()).p.authenticate({
      reason: motivo,
      cancelTitle: 'Cancelar',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Usar código del iPhone',
    })
    return true
  } catch { return false }
}
