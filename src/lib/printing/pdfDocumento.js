// PDF para compartir (#250/POS · cotizaciones): el mismo HTML de «Descargar
// PDF» se rasteriza y se envuelve en un **PDF real** (A4 paginado o rollo),
// listo para adjuntar por WhatsApp/correo con el share sheet del sistema. Sin
// dependencias nuevas: `html-to-image` para el render y un envoltorio PDF
// mínimo (una imagen JPEG por página, /DCTDecode).
//
// - `documentoAPdf(html, { formato })` → Blob `application/pdf`.
// - `pdfDeJpegPaginas(paginas)` → bytes (puro, testeable).
// - `paginasDeImagen({ altoPx })` → cortes por página (puro, testeable).
import { toJpeg } from 'html-to-image'
import { documentoImagen, nombreDocumento } from './compartirDocumento.js'

// A4 en puntos (72 dpi) con los márgenes del impreso (18 mm arriba/abajo, 16 mm
// a los costados) — los mismos del `@page` de los builders.
export const PAGINA_A4 = Object.freeze({ ancho: 595.28, alto: 841.89, margenX: 45.35, margenY: 51.02 })
// El cuerpo de los builders A4 usa 178 mm de ancho (672 px a 96 dpi).
export const ANCHO_CONTENIDO_A4 = 672
const PX_POR_PT = 96 / 72

/** Alto útil de una página A4 en píxeles CSS (96 dpi). */
export const ALTO_CONTENIDO_A4 = Math.floor((PAGINA_A4.alto - PAGINA_A4.margenY * 2) * PX_POR_PT)

/**
 * Cortes de una imagen larga en páginas: `[{ y, alto }]` en px. La última
 * página puede ser más corta; si entra en una sola, devuelve un corte.
 */
export function paginasDeImagen({ altoPx, altoContenidoPx = ALTO_CONTENIDO_A4 } = {}) {
  const alto = Math.max(1, Math.round(Number(altoPx) || 0))
  const contenido = Math.max(1, Math.round(Number(altoContenidoPx) || ALTO_CONTENIDO_A4))
  const paginas = []
  for (let y = 0; y < alto; y += contenido) paginas.push({ y, alto: Math.min(contenido, alto - y) })
  return paginas.length ? paginas : [{ y: 0, alto }]
}

const bytesDeTexto = (texto) => {
  const bytes = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i) & 0xff
  return bytes
}

const numero = (valor) => Number(valor).toFixed(2)

/**
 * Envoltorio PDF mínimo: una página por imagen JPEG (`{ bytes, anchoPx, altoPx }`).
 * Devuelve los bytes del PDF (el llamador los envuelve en un Blob).
 */
export function pdfDeJpegPaginas(paginas = [], { anchoPagina = PAGINA_A4.ancho, altoPagina = PAGINA_A4.alto, margenX = PAGINA_A4.margenX, margenY = PAGINA_A4.margenY } = {}) {
  const partes = []
  let offset = 0
  const offsets = []
  const escribir = (datos) => {
    const bytes = typeof datos === 'string' ? bytesDeTexto(datos) : datos
    partes.push(bytes)
    offset += bytes.length
  }
  const objeto = (id, contenido, binario = null) => {
    offsets[id] = offset
    escribir(`${id} 0 obj\n<< ${contenido} >>\n`)
    if (binario) {
      escribir('stream\n')
      escribir(binario)
      escribir('\nendstream\n')
    }
    escribir('endobj\n')
  }

  escribir('%PDF-1.4\n')
  objeto(1, '/Type /Catalog /Pages 2 0 R')
  const idsPaginas = []
  paginas.forEach((_, indice) => idsPaginas.push(3 + indice * 3))
  objeto(2, `/Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length}`)

  const anchoContenido = anchoPagina - margenX * 2
  const altoContenido = altoPagina - margenY * 2

  paginas.forEach((pagina, indice) => {
    const idPagina = 3 + indice * 3
    const idImagen = idPagina + 1
    const idContenido = idPagina + 2
    const anchoPx = Math.max(1, Number(pagina.anchoPx) || 1)
    const altoPx = Math.max(1, Number(pagina.altoPx) || 1)
    // Se dibuja a lo ancho del contenido, proporcional; nunca se agranda más
    // que el alto útil (una página = un corte).
    const anchoDibujo = anchoContenido
    const altoDibujo = Math.min(altoContenido, (anchoContenido * altoPx) / anchoPx)
    // En PDF el origen está abajo: se ancla arriba de la caja de contenido.
    const y = margenY + (altoContenido - altoDibujo)
    const contenido = `q ${numero(anchoDibujo)} 0 0 ${numero(altoDibujo)} ${numero(margenX)} ${numero(y)} cm /Im0 Do Q`
    objeto(idPagina, `/Type /Page /Parent 2 0 R /MediaBox [0 0 ${numero(anchoPagina)} ${numero(altoPagina)}] /Resources << /XObject << /Im0 ${idImagen} 0 R >> >> /Contents ${idContenido} 0 R`)
    objeto(idImagen, `/Type /XObject /Subtype /Image /Width ${anchoPx} /Height ${altoPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pagina.bytes.length}`, pagina.bytes)
    objeto(idContenido, `/Length ${bytesDeTexto(contenido).length}`, bytesDeTexto(contenido))
  })

  const total = 3 + paginas.length * 3
  const inicioXref = offset
  escribir(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let id = 1; id < total; id += 1) escribir(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`)
  escribir(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`)

  const totalBytes = partes.reduce((suma, parte) => suma + parte.length, 0)
  const salida = new Uint8Array(totalBytes)
  let cursor = 0
  for (const parte of partes) { salida.set(parte, cursor); cursor += parte.length }
  return salida
}

const bytesDeDataUrl = (dataUrl = '') => {
  const base64 = String(dataUrl).split(',')[1] || ''
  if (!base64) return null
  const binario = typeof atob === 'function' ? atob(base64) : ''
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return bytes.length ? bytes : null
}

/**
 * PDF del documento: rasteriza el HTML (mismo camino que el PNG) y lo pagina
 * en A4 (o una página del ancho del rollo).
 *
 * @param {string} html mismo HTML que «Descargar PDF».
 * @param {object} [opciones]
 * @param {string} [opciones.formato] `a4` (por defecto) o `thermal-80`/`58`.
 * @param {number} [opciones.pixelRatio] densidad del render (2 por defecto).
 * @param {number} [opciones.calidad] calidad JPEG (0.92 por defecto).
 * @returns {Promise<Blob | null>}
 */
export async function documentoAPdf(html, { formato = 'a4', pixelRatio = 2, calidad = 0.92, entorno = globalThis, renderizar = toJpeg } = {}) {
  const doc = entorno?.document
  const canvasDe = () => doc?.createElement?.('canvas')
  if (!html || typeof canvasDe()?.getContext !== 'function') {
    return null
  }
  const esA4 = formato === 'a4'
  const resultado = await documentoImagen(html, {
    ancho: esA4 ? ANCHO_CONTENIDO_A4 : formato,
    pixelRatio,
    entorno,
    renderizar,
  })
  if (!resultado?.dataUrl) return null

  try {
    const escala = Math.max(1, Number(pixelRatio) || 2)
    const lienzo = doc.createElement('canvas')
    const contexto = lienzo.getContext('2d')
    if (!contexto) return null
    const imagen = new entorno.Image()
    await new Promise((resolver, rechazar) => {
      imagen.onload = resolver
      imagen.onerror = rechazar
      imagen.src = resultado.dataUrl
    })
    const anchoTotal = imagen.width || Math.round(resultado.anchoPx * escala)
    const altoTotal = imagen.height || Math.round(resultado.altoPx * escala)
    const altoPaginaPx = esA4 ? ALTO_CONTENIDO_A4 * escala : altoTotal

    const paginas = []
    for (const corte of paginasDeImagen({ altoPx: altoTotal, altoContenidoPx: altoPaginaPx })) {
      lienzo.width = anchoTotal
      lienzo.height = corte.alto
      contexto.clearRect(0, 0, anchoTotal, corte.alto)
      contexto.drawImage(imagen, 0, -corte.y)
      const bytes = bytesDeDataUrl(lienzo.toDataURL('image/jpeg', calidad))
      if (bytes) paginas.push({ bytes, anchoPx: anchoTotal, altoPx: corte.alto })
    }
    if (!paginas.length) return null

    // El rollo sale en una sola página continua del ancho real (sin márgenes
    // extra: el builder ya trae los suyos).
    const mm = Number(String(formato).replace('thermal-', '')) || 80
    const anchoPagina = esA4 ? PAGINA_A4.ancho : (mm * 72) / 25.4
    const opcionesPagina = esA4 ? {} : { anchoPagina, altoPagina: anchoPagina * (altoTotal / anchoTotal), margenX: 0, margenY: 0 }
    const bytes = pdfDeJpegPaginas(paginas, opcionesPagina)
    return new entorno.Blob([bytes], { type: 'application/pdf' })
  } catch {
    return null
  }
}

export function nombrePdfDocumento(documento = 'documento', referencia = '') {
  return nombreDocumento(documento, referencia, 'pdf')
}
