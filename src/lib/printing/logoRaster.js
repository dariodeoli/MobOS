// Logo monocromo para la impresora térmica: convierte una imagen (data URL) al
// mapa de bits 1-bit que consume GS v 0. Se ejecuta en el navegador; en Node
// (tests) devuelve null y el ticket sale sin logo, como antes.
const UMBRAL = 168

export async function logoRasterDesdeDataUrl(dataUrl, { anchoMax = 384 } = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !String(dataUrl || '').startsWith('data:image/')) return null
  try {
    const imagen = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo cargar el logo.'))
      img.src = dataUrl
    })
    const natural = Number(imagen.naturalWidth) || 0
    if (!natural) return null
    const escala = Math.min(1, Math.max(8, Number(anchoMax) || 384) / natural)
    const ancho = Math.max(8, Math.round((natural * escala) / 8) * 8)
    const alto = Math.max(1, Math.round((Number(imagen.naturalHeight) || 1) * escala))
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const contexto = lienzo.getContext('2d')
    if (!contexto) return null
    // El papel es blanco: el fondo transparente se compone sobre blanco.
    contexto.fillStyle = '#fff'
    contexto.fillRect(0, 0, ancho, alto)
    contexto.drawImage(imagen, 0, 0, ancho, alto)
    const { data } = contexto.getImageData(0, 0, ancho, alto)
    const anchoBytes = ancho / 8
    const bytes = new Uint8Array(anchoBytes * alto)
    for (let y = 0; y < alto; y += 1) {
      for (let x = 0; x < ancho; x += 1) {
        const i = (y * ancho + x) * 4
        const alfa = data[i + 3] / 255
        const luminancia = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const gris = 255 - (255 - luminancia) * alfa
        if (gris < UMBRAL) bytes[y * anchoBytes + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    return { ancho, alto, bytes }
  } catch {
    return null
  }
}
