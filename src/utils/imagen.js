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
