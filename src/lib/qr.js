// QR de la app (#240, informe público): un solo lugar para generar la imagen.
// Antes cada pantalla llamaba a `qrcode` con sus propias opciones (nivel M/H,
// margen 1/2, ancho 200/220/320); acá viven las opciones por defecto y el
// helper que usan tanto las pantallas como los impresos (HTML autónomo).
//
// Logo al centro («más pro»): cuando la app registró una fuente de logo
// (`configurarLogoQr`, ver `qrLogoFuente.js`) el QR sale con corrección de
// error ALTA (H) y un cuadrado blanco redondeado en el centro con el logo de
// la tienda (o el de MobOS). El contenido codificado NO cambia (docs/TOKENS.md):
// solo se pinta encima. Si algo falla (sin lienzo, logo que no carga, texto muy
// largo, tamaño chico) se devuelve el QR liso: nunca se rompe una impresión.
// El comando QR nativo de ESC/POS lo dibuja la impresora y no admite logo.
import QRCode from 'qrcode'

export const QR_OPCIONES = { nivel: 'M', margen: 1, ancho: 220 }

// Reglas del logo. La caja ocupa ≤ 20 % del lado de la imagen (el nivel H
// tolera ~30 % de área dañada; la caja tapa ~4 %).
export const QR_LOGO = {
  proporcion: 0.2,
  relleno: 0.12, // aire blanco dentro de la caja, sobre su lado
  radio: 0.18,   // esquinas redondeadas, sobre el lado de la caja
  anchoMinPx: 140, // por debajo los módulos quedan muy chicos
  mmMin: 25,       // etiquetas físicas más chicas salen sin logo
  largoMax: 180,   // textos largos = QR denso: sin logo
}

let fuente = { obtenerLogo: null, componer: null }

/** Registra de dónde sale el logo y (opcional) cómo se compone sobre el QR. */
export function configurarLogoQr({ obtenerLogo = null, componer = null } = {}) {
  fuente = { obtenerLogo, componer }
}

/** Geometría de la caja central (px) para una imagen cuadrada de `ancho`. */
export function cajaLogoQr(ancho) {
  const lado = Math.max(2, Math.round(ancho * QR_LOGO.proporcion))
  const x = Math.round((ancho - lado) / 2)
  const relleno = Math.round(lado * QR_LOGO.relleno)
  return { lado, x, y: x, relleno, interior: lado - relleno * 2, radio: Math.round(lado * QR_LOGO.radio) }
}

const imagenes = new Map()
function cargarImagen(src) {
  if (!imagenes.has(src)) {
    const promesa = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('imagen'))
      img.src = src
    })
    promesa.catch(() => imagenes.delete(src))
    if (imagenes.size > 6) imagenes.delete(imagenes.keys().next().value)
    imagenes.set(src, promesa)
  }
  return imagenes.get(src)
}

/** Compositor por defecto: lienzo del navegador. Devuelve `''` si no hay DOM. */
export async function componerEnNavegador({ qrUrl, logoUrl }) {
  if (typeof document === 'undefined') return ''
  const [qr, logo] = await Promise.all([cargarImagen(qrUrl), cargarImagen(logoUrl)])
  const ancho = qr.naturalWidth || qr.width
  const caja = cajaLogoQr(ancho)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = qr.naturalHeight || qr.height
  const ctx = lienzo.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(qr, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  const { x, y, lado, radio } = caja
  ctx.moveTo(x + radio, y)
  ctx.arcTo(x + lado, y, x + lado, y + lado, radio)
  ctx.arcTo(x + lado, y + lado, x, y + lado, radio)
  ctx.arcTo(x, y + lado, x, y, radio)
  ctx.arcTo(x, y, x + lado, y, radio)
  ctx.closePath()
  ctx.fill()
  // El logo entra completo (contain), centrado en el interior de la caja.
  const lw = logo.naturalWidth || logo.width
  const lh = logo.naturalHeight || logo.height
  if (!lw || !lh) return ''
  const escala = Math.min(caja.interior / lw, caja.interior / lh)
  const w = lw * escala
  const h = lh * escala
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(logo, x + (lado - w) / 2, y + (lado - h) / 2, w, h)
  return lienzo.toDataURL('image/png')
}

/**
 * Data URL del QR, o `''` si no hay valor o el generador falla (nunca lanza).
 * `logo: false` lo desactiva; `mm` es el lado impreso (si es < 25 mm, sin logo).
 */
export async function qrDataUrl(valor, { ancho = QR_OPCIONES.ancho, nivel = QR_OPCIONES.nivel, margen = QR_OPCIONES.margen, logo = true, mm = null } = {}) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''
  const quiereLogo = logo !== false
    && typeof fuente.obtenerLogo === 'function'
    && ancho >= QR_LOGO.anchoMinPx
    && texto.length <= QR_LOGO.largoMax
    && (mm == null || Number(mm) >= QR_LOGO.mmMin)
  try {
    const base = await QRCode.toDataURL(texto, { errorCorrectionLevel: quiereLogo ? 'H' : nivel, margin: margen, width: ancho })
    if (!quiereLogo) return base
    try {
      const logoUrl = await fuente.obtenerLogo()
      if (!logoUrl) return base
      const compuesto = await (fuente.componer || componerEnNavegador)({ qrUrl: base, logoUrl, ancho, caja: cajaLogoQr(ancho) })
      return compuesto || base
    } catch {
      return base
    }
  } catch {
    return ''
  }
}
