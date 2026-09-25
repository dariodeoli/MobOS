// Compartir un documento imprimible como imagen (#240/#220): toma el mismo
// HTML que sale por «Descargar PDF» (A4/80/58), lo rasteriza a PNG con
// `html-to-image` y ofrece compartir (Web Share, el camino de WhatsApp),
// descargar o copiar al portapapeles. Un solo lugar para el patrón; las
// pantallas no repiten iframe/canvas/navigator.
//
// El HTML se renderiza en un iframe oculto con el ancho del papel: los builders
// ya traen todo inline (QR y logo en data URI, tipografía del sistema), así que
// la imagen sale sin depender de la pantalla donde se generó. Las piezas puras
// reciben el entorno inyectable (como `portapapeles.js`/`descargarArchivo.js`)
// para poder testearlas sin navegador.
import { toPng } from 'html-to-image'

// Ancho de papel en píxeles CSS (96 dpi) por formato de impresión.
export const ANCHOS_IMAGEN = Object.freeze({
  a4: 794,
  'thermal-80': 302,
  'thermal-58': 219,
})

export const anchoImagen = (formato = 'a4') => ANCHOS_IMAGEN[formato] || ANCHOS_IMAGEN.a4

// Nombre de archivo seguro: sin acentos, espacios ni barras. La referencia
// (serial, identificador, cantidad) entra recortada para no armar nombres
// kilométricos.
export function nombreImagenDocumento(documento = 'documento', referencia = '') {
  const normalizar = (valor) => String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = normalizar(documento).toLowerCase() || 'documento'
  const sufijo = normalizar(referencia).slice(0, 48)
  return `${base}${sufijo ? `-${sufijo}` : ''}.png`
}

// ¿El navegador puede compartir archivos? Web Share con `files` no existe en
// todos (escritorio viejo); el que llama decide el respaldo.
export function puedeCompartirArchivo(entorno, archivo) {
  const nav = entorno?.navigator
  if (!nav?.share || !nav?.canShare) return false
  try { return Boolean(nav.canShare({ files: [archivo] })) } catch { return false }
}

// Comparte el archivo. Devuelve 'compartido', 'cancelado' (el usuario cerró el
// diálogo: no es un error) o false (no se pudo).
export async function compartirArchivo(entorno, { archivo, titulo = '', texto = '' } = {}) {
  const nav = entorno?.navigator
  if (!archivo || !nav?.share) return false
  try {
    if (nav.canShare && !nav.canShare({ files: [archivo] })) return false
    await nav.share({ files: [archivo], title: titulo, text: texto })
    return 'compartido'
  } catch (cause) {
    return cause?.name === 'AbortError' ? 'cancelado' : false
  }
}

// Copia la imagen al portapapeles (ClipboardItem). Sin soporte o sin permiso
// devuelve false: la pantalla elige el aviso.
export async function copiarImagen(blob, entorno = globalThis) {
  const nav = entorno?.navigator
  const ClipboardItemCtor = entorno?.ClipboardItem
  if (!blob?.size || !ClipboardItemCtor || !nav?.clipboard?.write) return false
  try {
    await nav.clipboard.write([new ClipboardItemCtor({ [blob.type || 'image/png']: blob })])
    return true
  } catch {
    return false
  }
}

const esperarRecursos = async (doc, timeout) => {
  const ventana = doc.defaultView
  const esperas = []
  try { if (doc.fonts?.ready) esperas.push(doc.fonts.ready) } catch { /* sin FontFaceSet */ }
  for (const imagen of Array.from(doc.images || [])) {
    if (imagen.complete) continue
    esperas.push(new Promise((resolver) => { imagen.onload = resolver; imagen.onerror = resolver }))
  }
  if (ventana?.requestAnimationFrame) esperas.push(new Promise((resolver) => ventana.requestAnimationFrame(() => resolver())))
  await Promise.race([
    Promise.all(esperas),
    new Promise((resolver) => setTimeout(resolver, Math.max(0, Number(timeout) || 0))),
  ])
}

/**
 * Rasteriza un HTML de documento a PNG.
 *
 * @param {string} html mismo HTML que usa «Descargar PDF».
 * @param {object} [opciones]
 * @param {number|string} [opciones.ancho] ancho de papel en px o formato (`a4`, `thermal-80`…).
 * @param {number} [opciones.pixelRatio] densidad (2 por defecto).
 * @param {string} [opciones.fondo] color de fondo del PNG.
 * @param {object} [opciones.entorno] inyectable para tests.
 * @param {Function} [opciones.renderizar] inyectable para tests (`toPng` por defecto).
 * @returns {Promise<{ dataUrl: string, blob: Blob } | null>}
 */
export async function documentoAPng(html, { ancho = 'a4', pixelRatio = 2, fondo = '#ffffff', timeout = 15_000, entorno = globalThis, renderizar = toPng } = {}) {
  const doc = entorno?.document
  const fetchFn = entorno?.fetch
  const anchoPapel = typeof ancho === 'string' ? anchoImagen(ancho) : Math.max(1, Number(ancho) || ANCHOS_IMAGEN.a4)
  if (!html || !doc?.createElement || !doc?.body || typeof renderizar !== 'function' || typeof fetchFn !== 'function') return null

  const marco = doc.createElement('iframe')
  // Atributo propio: los e2e de impresión buscan `iframe[aria-hidden]` para el
  // respaldo del diálogo y este marco no debe confundirse con ese.
  marco.setAttribute('data-png-documento', '1')
  marco.style.cssText = `position:fixed;left:-10000px;top:0;width:${anchoPapel}px;height:600px;border:0;visibility:hidden`
  doc.body.appendChild(marco)
  try {
    const marcoDoc = marco.contentDocument
    if (!marcoDoc) return null
    marcoDoc.open()
    marcoDoc.write(String(html))
    marcoDoc.close()
    await esperarRecursos(marcoDoc, timeout)
    const cuerpo = marcoDoc.body
    const dataUrl = await renderizar(cuerpo, {
      pixelRatio: Math.max(1, Number(pixelRatio) || 2),
      backgroundColor: fondo,
      width: Math.max(1, cuerpo.scrollWidth || anchoPapel),
      height: Math.max(1, cuerpo.scrollHeight || 600),
      style: { margin: '0 auto' },
    })
    if (!dataUrl) return null
    const blob = await (await fetchFn(dataUrl)).blob()
    return { dataUrl, blob }
  } catch {
    return null
  } finally {
    marco.remove()
  }
}
