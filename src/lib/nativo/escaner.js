import { isNativeIOS } from '../plataforma.js'

// Escáner nativo de IMEI, QR y códigos de barras (ML Kit). Reemplaza al
// `BarcodeDetector` del navegador dentro de la app de iPhone: abre la cámara
// del sistema a pantalla completa y devuelve el valor leído. Fuera de la app,
// `CameraScan` conserva su camino web.

const FORMATOS = ['QrCode', 'Code128', 'Code39', 'Ean13', 'UpcA', 'Ean8', 'Itf']

/** El plugin cancela con un error cuando la persona cierra el escáner. */
export function esCancelacion(error) {
  return /cancel/i.test(String(error?.message || error || ''))
}

async function plugin() {
  return import('@capacitor-mlkit/barcode-scanning')
}

/** Pide el permiso de cámara si hace falta. Devuelve true si quedó concedido. */
export async function permisoDeCamara() {
  const { BarcodeScanner } = await plugin()
  let estado = (await BarcodeScanner.checkPermissions()).camera
  if (estado !== 'granted' && estado !== 'limited') estado = (await BarcodeScanner.requestPermissions()).camera
  return estado === 'granted' || estado === 'limited'
}

/** Lee un código. Devuelve el texto, o null si la persona cerró el escáner. */
export async function leerCodigoNativo() {
  const { BarcodeScanner, BarcodeFormat } = await plugin()
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: FORMATOS.map((f) => BarcodeFormat[f]).filter(Boolean) })
    return barcodes?.[0]?.rawValue || null
  } catch (error) {
    if (esCancelacion(error)) return null
    throw error
  }
}

/**
 * Lazo de escaneo para `CameraScan`. En modo continuo vuelve a abrir el
 * escáner tras cada lectura (ignorando el mismo código durante 1,5 s); en modo
 * simple se cierra al primer código. Devuelve la función para cancelar.
 */
export function iniciarEscaneoNativo({ continuous, onDetected, onClose, setMessage }) {
  if (!isNativeIOS()) return () => {}
  let detenido = false
  ;(async () => {
    try {
      if (!(await permisoDeCamara())) {
        setMessage?.('Sin permiso de cámara. Habilitala en Ajustes › MobOS › Cámara.')
        return
      }
      let ultimo = ''
      let ultimoEn = 0
      while (!detenido) {
        const valor = await leerCodigoNativo()
        if (detenido) return
        if (!valor) { onClose?.(); return }
        const ahora = Date.now()
        if (continuous && valor === ultimo && ahora - ultimoEn < 1500) continue
        ultimo = valor
        ultimoEn = ahora
        onDetected(valor)
        if (!continuous) { onClose?.(); return }
      }
    } catch (error) {
      console.error('[escaner] falló el escáner nativo:', error)
      setMessage?.('No se pudo abrir la cámara. Probá de nuevo o ingresá el código a mano.')
    }
  })()
  return () => { detenido = true }
}
