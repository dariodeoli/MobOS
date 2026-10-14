// Logo monocromo para la impresora térmica: convierte una imagen (data URL) al
// mapa de bits 1-bit que consume GS v 0. Se ejecuta en el navegador; en Node
// (tests) devuelve null y el ticket sale sin logo, como antes.
const UMBRAL = 168

// Umbral de Otsu sobre el histograma de luminancia (256 cajas): separa tinta de
// papel según el propio logo, en vez de un corte fijo que pierde los trazos
// finos de un logo claro o ensucia uno oscuro. Acotado para no virar a todo
// negro o todo blanco con logos casi planos.
export function umbralOtsu(histograma = [], { minimo = 96, maximo = 200 } = {}) {
  const total = histograma.reduce((suma, valor) => suma + valor, 0)
  if (!total) return UMBRAL
  let sumaTotal = 0
  for (let i = 0; i < histograma.length; i += 1) sumaTotal += i * histograma[i]
  let pesoFondo = 0
  let sumaFondo = 0
  let mejor = UMBRAL
  let varianzaMax = -1
  for (let i = 0; i < histograma.length; i += 1) {
    pesoFondo += histograma[i]
    if (!pesoFondo) continue
    const pesoFrente = total - pesoFondo
    if (!pesoFrente) break
    sumaFondo += i * histograma[i]
    const diferencia = sumaFondo / pesoFondo - (sumaTotal - sumaFondo) / pesoFrente
    const varianza = pesoFondo * pesoFrente * diferencia * diferencia
    if (varianza > varianzaMax) { varianzaMax = varianza; mejor = i }
  }
  return Math.min(maximo, Math.max(minimo, mejor))
}

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
    contexto.imageSmoothingEnabled = true
    contexto.imageSmoothingQuality = 'high'
    contexto.drawImage(imagen, 0, 0, ancho, alto)
    const { data } = contexto.getImageData(0, 0, ancho, alto)
    const anchoBytes = ancho / 8
    const bytes = new Uint8Array(anchoBytes * alto)
    const grises = new Uint8Array(ancho * alto)
    const histograma = new Array(256).fill(0)
    for (let p = 0; p < grises.length; p += 1) {
      const i = p * 4
      const alfa = data[i + 3] / 255
      const luminancia = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const gris = Math.round(255 - (255 - luminancia) * alfa)
      grises[p] = gris
      histograma[gris] += 1
    }
    const umbral = umbralOtsu(histograma)
    for (let y = 0; y < alto; y += 1) {
      for (let x = 0; x < ancho; x += 1) {
        if (grises[y * ancho + x] < umbral) bytes[y * anchoBytes + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    return { ancho, alto, bytes }
  } catch {
    return null
  }
}
