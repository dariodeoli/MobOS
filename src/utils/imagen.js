// Compresión de imágenes antes de subir: reduce el peso sin cambiar el tipo
// (JPEG/PNG/WebP) y cae al archivo original ante cualquier problema, así que
// nunca bloquea una subida que hoy funciona.

export function dimensionesComprimidas(ancho, alto, maxLado = 1600) {
  const mayor = Math.max(Number(ancho), Number(alto))
  if (!Number.isFinite(mayor) || mayor <= 0) return { ancho, alto }
  if (mayor <= maxLado) return { ancho, alto }
  const factor = maxLado / mayor
  return { ancho: Math.max(1, Math.round(Number(ancho) * factor)), alto: Math.max(1, Math.round(Number(alto) * factor)) }
}

export async function comprimirImagen(file, { maxLado = 1600, calidad = 0.82 } = {}) {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file
    const bitmap = await createImageBitmap(file)
    const { ancho, alto } = dimensionesComprimidas(bitmap.width, bitmap.height, maxLado)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const contexto = lienzo.getContext('2d')
    if (!contexto) { bitmap.close?.(); return file }
    contexto.drawImage(bitmap, 0, 0, ancho, alto)
    bitmap.close?.()
    const tipo = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
    const blob = await new Promise((resolver) => lienzo.toBlob(resolver, tipo, tipo === 'image/png' ? undefined : calidad))
    if (!blob || blob.size >= file.size) return file
    const nombre = file.name || 'imagen'
    const extension = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg'
    const base = nombre.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.${extension}`, { type: tipo, lastModified: file.lastModified })
  } catch {
    return file
  }
}

// #303: foto del comparador lista para guardar como data URL. Se reescala al
// lado máximo y se codifica liviana; si el navegador no puede, cae al archivo
// original leído directo (nunca rompe la carga por una foto).
export async function procesarImagenComparador(file, { maxLado = 900, calidad = 0.85 } = {}) {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return leerArchivoComoDataUrl(file)
    const bitmap = await createImageBitmap(file)
    const { ancho, alto } = dimensionesComprimidas(bitmap.width, bitmap.height, maxLado)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const contexto = lienzo.getContext('2d')
    if (!contexto) { bitmap.close?.(); return leerArchivoComoDataUrl(file) }
    // Fondo blanco: las fotos con transparencia no quedan negras al pasar a JPEG.
    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, ancho, alto)
    contexto.drawImage(bitmap, 0, 0, ancho, alto)
    bitmap.close?.()
    const tipo = String(file.type || '').includes('png') ? 'image/png' : 'image/jpeg'
    return lienzo.toDataURL(tipo, tipo === 'image/jpeg' ? calidad : undefined)
  } catch {
    return leerArchivoComoDataUrl(file)
  }
}

export function leerArchivoComoDataUrl(file) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result || ''))
    lector.onerror = () => rechazar(new Error('No se pudo leer la imagen.'))
    lector.readAsDataURL(file)
  })
}
