// Recorte cuadrado para fotos de perfil: el cuadrado visible se traduce al
// rectángulo de origen que hay que dibujar en el lienzo. Puro y testeable.

export function recorteCuadrado({ ancho, alto, escala = 1, desplazamientoX = 0, desplazamientoY = 0, lado = 240 }) {
  const factor = Math.max(1, Number(escala) || 1)
  const visible = lado / factor
  const centroX = Number(ancho) / 2 - Number(desplazamientoX) / factor
  const centroY = Number(alto) / 2 - Number(desplazamientoY) / factor
  const x = Math.min(Math.max(0, centroX - visible / 2), Math.max(0, Number(ancho) - visible))
  const y = Math.min(Math.max(0, centroY - visible / 2), Math.max(0, Number(alto) - visible))
  return { x, y, lado: Math.min(visible, Number(ancho), Number(alto)) }
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
