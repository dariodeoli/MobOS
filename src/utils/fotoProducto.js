// #404: fotos de producto. Recorte cuadrado centrado y compresión a WebP en el
// navegador antes de subir (el servidor valida tipo, tamaño y magic bytes).
// La parte pura (validación, recorte, orden) se prueba en Node; el lienzo
// (`prepararFotoProducto`) solo corre en el navegador.

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
export const ACEPTA_FOTO = TIPOS_FOTO.join(',')
export const MAX_FOTO_BYTES = 5 * 1024 * 1024
export const MAX_FOTOS_PRODUCTO = 12
export const LADO_FOTO_PRODUCTO = 800
export const LADO_MINIATURA = 160

/** '' si el archivo sirve; si no, el motivo en español. */
export function validarArchivoFoto(file) {
  if (!file || typeof file !== 'object') return 'Elegí una foto.'
  const tipo = String(file.type || '').toLowerCase()
  if (!TIPOS_FOTO.includes(tipo)) return 'La foto debe ser JPG, PNG o WebP.'
  const peso = Number(file.size)
  if (!Number.isFinite(peso) || peso <= 0) return 'La foto está vacía.'
  if (peso > MAX_FOTO_BYTES) return 'La foto supera el límite de 5 MiB.'
  return ''
}

/** Cuadrado centrado más grande que entra en la foto: { x, y, lado }. */
export function recorteCentrado(ancho, alto) {
  const w = Math.max(0, Number(ancho) || 0)
  const h = Math.max(0, Number(alto) || 0)
  const lado = Math.min(w, h)
  return { x: Math.round((w - lado) / 2), y: Math.round((h - lado) / 2), lado }
}

/** Lado final: nunca agranda una foto chica. */
export function ladoSalida(ladoOrigen, maximo = LADO_FOTO_PRODUCTO) {
  const origen = Math.floor(Number(ladoOrigen) || 0)
  return Math.max(1, Math.min(origen || maximo, maximo))
}

/** «Mi foto.JPG» → «Mi-foto.webp» (nombre seguro para el servidor). */
export function nombreWebP(nombre, sufijo = '') {
  const base = String(nombre || 'foto').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'foto'
  return `${base}${sufijo}.webp`
}

/** Mueve la foto `id` `delta` lugares (−1 sube, +1 baja) sin salirse de la lista. */
export function moverFoto(lista, id, delta) {
  const origen = lista.findIndex((foto) => foto.id === id)
  if (origen < 0) return lista
  const destino = Math.min(lista.length - 1, Math.max(0, origen + delta))
  if (destino === origen) return lista
  const copia = [...lista]
  const [foto] = copia.splice(origen, 1)
  copia.splice(destino, 0, foto)
  return copia
}

/** Lleva `id` a la posición de `haciaId` (arrastrar y soltar). */
export function reubicarFoto(lista, id, haciaId) {
  const origen = lista.findIndex((foto) => foto.id === id)
  const destino = lista.findIndex((foto) => foto.id === haciaId)
  if (origen < 0 || destino < 0 || origen === destino) return lista
  const copia = [...lista]
  const [foto] = copia.splice(origen, 1)
  copia.splice(destino, 0, foto)
  return copia
}

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

function aBlob(lienzo, tipo, calidad) {
  return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad))
}

function dibujarCuadrado(fuente, recorte, lado) {
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('No se pudo preparar la foto.')
  contexto.fillStyle = '#fff'
  contexto.fillRect(0, 0, lado, lado)
  contexto.drawImage(fuente, recorte.x, recorte.y, recorte.lado, recorte.lado, 0, 0, lado, lado)
  return lienzo
}

/**
 * Recorta al cuadrado central y comprime a WebP: devuelve la foto (hasta 800 px)
 * y su miniatura (160 px). Si el navegador no sabe codificar WebP, la foto sale
 * en JPEG y no hay miniatura (el servidor sirve la grande).
 */
export async function prepararFotoProducto(file, { lado = LADO_FOTO_PRODUCTO, calidad = 0.82 } = {}) {
  const motivo = validarArchivoFoto(file)
  if (motivo) throw new Error(motivo)
  const fuente = await fuenteDibujable(file)
  try {
    const ancho = fuente.width || fuente.naturalWidth
    const alto = fuente.height || fuente.naturalHeight
    const recorte = recorteCentrado(ancho, alto)
    if (recorte.lado < 1) throw new Error('La imagen no tiene tamaño.')
    const ladoFoto = ladoSalida(recorte.lado, lado)
    let blob = await aBlob(dibujarCuadrado(fuente, recorte, ladoFoto), 'image/webp', calidad)
    let tipo = 'image/webp'
    if (!blob || blob.type !== 'image/webp') {
      blob = await aBlob(dibujarCuadrado(fuente, recorte, ladoFoto), 'image/jpeg', calidad)
      tipo = 'image/jpeg'
    }
    if (!blob) throw new Error('No se pudo comprimir la foto.')
    const foto = new File([blob], tipo === 'image/webp' ? nombreWebP(file.name) : nombreWebP(file.name).replace(/\.webp$/, '.jpg'), { type: tipo })
    let miniatura = null
    if (tipo === 'image/webp') {
      const mini = await aBlob(dibujarCuadrado(fuente, recorte, ladoSalida(recorte.lado, LADO_MINIATURA)), 'image/webp', 0.7)
      if (mini && mini.type === 'image/webp') miniatura = new File([mini], nombreWebP(file.name, '-mini'), { type: 'image/webp' })
    }
    return { foto, miniatura, ancho: ladoFoto, alto: ladoFoto, previa: URL.createObjectURL(miniatura || foto) }
  } finally { fuente.close?.() }
}
