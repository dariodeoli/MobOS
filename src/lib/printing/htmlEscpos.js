// La salida raster usa el HTML de la vista previa, no el formatter de texto.
import { toCanvas } from 'html-to-image'
import { documentoImagen } from './compartirDocumento.js'
import { crearTicket } from './escpos.js'
import { areaTermica } from './papelTermico.js'
export const MAX_BYTES_RASTER = 393216 // tope remoto base64 512 KiB
export function perfilRaster(impresora = {}) {
  const modelo = String(impresora?.modelo || impresora?.model || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
  if (modelo !== 'ZKP8008')
    throw Error(
      'Esta salida requiere una ZKP8008 ESC/POS identificada. Usá el PDF o el diálogo con el mismo diseño; no se envía el formato anterior.',
    )
  const ancho = Number(impresora.ancho)
  if (ancho !== 80)
    throw Error('La ZKP8008 declarada usa 80 mm; hay distinto papel. Usá PDF/diálogo para 58 mm u otro medio hasta validar ese perfil.')
  return { ancho, ...areaTermica(ancho) }
}
export function ticketDeRaster({ bytes, ancho, alto }, { corte = true } = {}) {
  if (
    !Number.isInteger(ancho) ||
    ancho % 8 ||
    !Number.isInteger(alto) ||
    alto < 1 ||
    bytes.length !== (ancho / 8) * alto
  )
    throw Error('Imagen de impresión inválida.')
  const ticket = crearTicket({ margen: 0 }).iniciar()
  // Tiras de 256 filas: no depende del buffer de imagen completo del firmware.
  for (let y = 0; y < alto; y += 256) {
    const rows = Math.min(256, alto - y)
    ticket.imagenRaster(bytes.slice((y * ancho) / 8, ((y + rows) * ancho) / 8), {
      ancho,
      alto: rows,
    })
  }
  ticket.avanza(2)
  if (corte) ticket.corte()
  if (ticket.bytes().length > MAX_BYTES_RASTER)
    throw Error(
      'El documento supera el límite del puente. Descargá el PDF o imprimí con diálogo; no se envía un diseño anterior.',
    )
  ticket.rasterVersion = 1
  return ticket
}
export function bitsDeCanvas(canvas) {
  const ancho = canvas.width,
    alto = canvas.height
  const data = canvas.getContext('2d').getImageData(0, 0, ancho, alto).data
  const bytes = new Uint8Array((ancho / 8) * alto)
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4,
        a = data[i + 3] / 255
      const gris = 255 - (255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])) * a
      if (gris < 168) bytes[(y * ancho) / 8 + (x >> 3)] |= 0x80 >> (x & 7)
    }
  return { bytes, ancho, alto }
}
export async function ticketsDesdeHtml(html, { impresora, formato, etiquetas = false } = {}) {
  const perfil = perfilRaster(impresora)
  if (formato !== `thermal-${perfil.ancho}`)
    throw Error(
      'La vista previa y la impresora tienen distinto papel. Elegí el mismo ancho o usá PDF/diálogo; no se cambia el diseño al enviar.',
    )
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const labels = etiquetas ? [...doc.querySelectorAll('.etiqueta, .label')] : []
  if (labels.length > 50) throw Error('Dividí el lote en hasta 50 etiquetas o descargá el PDF.')
  const documentos = labels.length
    ? labels.map(label => {
        const copy = doc.cloneNode(true)
        copy.body.replaceChildren(label.cloneNode(true))
        return '<!doctype html>' + copy.documentElement.outerHTML
      })
    : [html]
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html))),
  ]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20)
  const tickets = []
  let pixels = 0
  for (const page of documentos) {
    let raster, preparationError
    const result = await documentoImagen(page, {
      ancho: perfil.css,
      pixelRatio: 1,
      renderizar: async node => {
        try {
          const root = node.ownerDocument.documentElement
          const height = Math.ceil(Math.max(node.scrollHeight, node.getBoundingClientRect().bottom))
          const dotsHigh = Math.ceil((height * perfil.papelDots) / perfil.css)
          pixels += perfil.dots * dotsHigh
          if (pixels > 32000000 || (dotsHigh * perfil.dots) / 8 > MAX_BYTES_RASTER - 1024)
            throw Error(
              'El documento supera el límite del puente. Usá PDF/diálogo con el mismo diseño.',
            )
          if (root.scrollWidth > Math.ceil(perfil.css) + 1)
            throw Error('El contenido excede el ancho del papel; no se recorta.')
          const canvas = await toCanvas(root, {
            backgroundColor: '#fff',
            width: perfil.css,
            height,
            canvasWidth: perfil.papelDots,
            canvasHeight: dotsHigh,
            pixelRatio: 1,
          })
          // Recortar solo los márgenes de papel NO imprimibles, comprobados blancos.
          const offset = (perfil.papelDots - perfil.dots) / 2
          const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++) {
              if (x >= offset && x < canvas.width - offset) continue
              const i = (y * canvas.width + x) * 4
              if (rgba[i + 3] && Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) < 168)
                throw Error('Hay contenido fuera del área imprimible; no se recorta.')
            }
          const cropped = document.createElement('canvas')
          cropped.width = perfil.dots
          cropped.height = canvas.height
          cropped
            .getContext('2d')
            .drawImage(
              canvas,
              offset,
              0,
              perfil.dots,
              canvas.height,
              0,
              0,
              perfil.dots,
              canvas.height,
            )
          raster = bitsDeCanvas(cropped)
          return cropped.toDataURL('image/png')
        } catch (cause) {
          preparationError = cause
          throw cause
        }
      },
    })
    if (!result || !raster)
      throw (
        preparationError ||
        Error('No se pudo preparar el diseño completo. Usá PDF/diálogo; no se envió nada.')
      )
    const ticket = ticketDeRaster(raster, { corte: impresora.corte !== false })
    ticket.rasterReference = `raster-${digest}`
    tickets.push(ticket)
  }
  const all = tickets.map(ticket => ticket.bytes())
  const total = all.reduce((sum, bytes) => sum + bytes.length, 0)
  if (total > MAX_BYTES_RASTER) throw Error('El lote completo supera el límite del puente. Usá PDF/diálogo; no se envió ninguna etiqueta.')
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of all) { bytes.set(part, offset); offset += part.length }
  return [{ rasterVersion: 1, rasterReference: `raster-${digest}`, bytes: () => bytes.slice(), base64: () => {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  } }]
}
