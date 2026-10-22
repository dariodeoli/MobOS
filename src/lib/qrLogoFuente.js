// Fuente del logo central de los QR: el de la tienda (el mismo del comprobante
// premium) y, si no hay o no carga, el ícono de MobOS. Se importa una vez en el
// arranque de la app; `qr.js` queda sin dependencias de la app (tests de nodo).
import { getLogoDataUrl } from './tenantLogo'
import { configurarLogoQr } from './qr'

export const LOGO_QR_MOBOS = '/mobos-icon-192.png'

export async function logoParaQr() {
  try {
    const tienda = await getLogoDataUrl('light')
    if (tienda) return tienda
  } catch { /* cae al logo de MobOS */ }
  return LOGO_QR_MOBOS
}

configurarLogoQr({ obtenerLogo: logoParaQr })
