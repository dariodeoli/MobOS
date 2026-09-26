// Recorte cuadrado para fotos de perfil: el cuadrado visible se traduce al
// rectángulo de origen que hay que dibujar en el lienzo. Puro y testeable.

// Escala base para mostrar la foto ENTERA (contain) dentro del cuadrado: la
// dimensión más larga entra justa. El zoom del usuario se multiplica por esta
// base, así al abrir nunca hay recorte automático.
export function escalaAjuste({ ancho, alto, lado = 240 } = {}) {
  const w = Number(ancho) || 0
  const h = Number(alto) || 0
  if (w <= 0 || h <= 0) return 1
  return Math.min(lado / w, lado / h)
}

export function recorteCuadrado({ ancho, alto, escala = 1, desplazamientoX = 0, desplazamientoY = 0, lado = 240 }) {
  const w = Number(ancho) || 0
  const h = Number(alto) || 0
  const factor = Math.max(0.0001, Number(escala) || 1)
  const visible = lado / factor
  // Con la foto entera visible (factor de ajuste) el cuadrado abarca todo el
  // ancho o alto: se centra sobre la imagen, no sobre el borde del recorte.
  const tamano = Math.min(visible, w, h)
  const centroX = w / 2 - Number(desplazamientoX) / factor
  const centroY = h / 2 - Number(desplazamientoY) / factor
  const x = Math.min(Math.max(0, centroX - tamano / 2), Math.max(0, w - tamano))
  const y = Math.min(Math.max(0, centroY - tamano / 2), Math.max(0, h - tamano))
  return { x, y, lado: tamano }
}

export const LADO_FOTO = 512

// Fuente dibujable: createImageBitmap cuando puede y, si el navegador no
// decodifica ahí (pasa con imágenes raras), el <img> clásico que ya la mostró
// en el recortador. Sin este fallback la foto quedaba sin poder guardarse.
async function fuenteDibujable(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* cae al <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolver, rechazar) => {
      const imagen = new Image()
      imagen.onload = () => resolver(imagen)
      imagen.onerror = () => rechazar(new Error('No se pudo leer la imagen.'))
      imagen.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}

// Recorta la imagen a un cuadrado y devuelve un archivo listo para subir.
export async function recortarArchivo(file, { recorte, lado = LADO_FOTO, tipo = 'image/jpeg', calidad = 0.9 } = {}) {
  const bitmap = await fuenteDibujable(file)
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('No se pudo preparar el recorte.')
  contexto.drawImage(bitmap, recorte.x, recorte.y, recorte.lado, recorte.lado, 0, 0, lado, lado)
  bitmap.close?.()
  const blob = await new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad))
  if (!blob) throw new Error('No se pudo recortar la foto.')
  const base = String(file.name || 'foto').replace(/\.[^.]+$/, '')
  return new File([blob], `${base}-recorte.jpg`, { type: tipo, lastModified: file.lastModified })
}
