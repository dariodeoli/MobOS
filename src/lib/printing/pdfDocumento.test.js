import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALTO_CONTENIDO_A4, PAGINA_A4, nombrePdfDocumento, paginasDeImagen, pdfDeJpegPaginas } from './pdfDocumento.js'

// JPEG mínimo válido a nivel de bytes (SOI + APP0 + EOI): al envoltorio PDF solo
// le importa el largo y que viaje tal cual con /DCTDecode.
const jpeg = (largo = 32) => {
  const bytes = new Uint8Array(Math.max(4, largo))
  bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff; bytes[3] = 0xd9
  return bytes
}
const texto = (bytes) => String.fromCharCode(...bytes)

test('paginasDeImagen corta la imagen larga en páginas A4 y no inventa cortes', () => {
  assert.deepEqual(paginasDeImagen({ altoPx: 300 }), [{ y: 0, alto: 300 }])
  const paginas = paginasDeImagen({ altoPx: ALTO_CONTENIDO_A4 * 2 + 120 })
  assert.equal(paginas.length, 3)
  assert.deepEqual(paginas[0], { y: 0, alto: ALTO_CONTENIDO_A4 })
  assert.deepEqual(paginas[2], { y: ALTO_CONTENIDO_A4 * 2, alto: 120 })
  assert.deepEqual(paginasDeImagen({}), [{ y: 0, alto: 1 }])
})

test('el envoltorio PDF arma una página por imagen con sus objetos', () => {
  const bytes = pdfDeJpegPaginas([
    { bytes: jpeg(40), anchoPx: 1344, altoPx: 1970 },
    { bytes: jpeg(24), anchoPx: 1344, altoPx: 600 },
  ])
  const pdf = texto(bytes)
  assert.match(pdf, /^%PDF-1\.4/)
  assert.match(pdf, /\/Type \/Catalog/)
  assert.match(pdf, /\/Type \/Pages .*\/Count 2/)
  assert.match(pdf, /\/MediaBox \[0 0 595\.28 841\.89\]/)
  assert.equal((pdf.match(/\/Filter \/DCTDecode/g) || []).length, 2)
  assert.match(pdf, /\/Width 1344 \/Height 1970/)
  assert.match(pdf, /\/Length 40 >>\nstream\n/)
  assert.match(pdf, /\/Length 24 >>\nstream\n/)
  assert.match(pdf, /xref\n0 9\n/)
  assert.match(pdf, /trailer\n<< \/Size 9 \/Root 1 0 R >>/)
  assert.match(pdf, /%%EOF\n$/)
  // Los JPEG viajan completos: el PDF es más grande que la suma de las partes.
  assert.equal(bytes.length > 40 + 24, true)
  assert.equal(pdf.includes(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9)), true)
})

test('el rollo sale en una página del ancho real, sin márgenes', () => {
  const bytes = pdfDeJpegPaginas([{ bytes: jpeg(20), anchoPx: 604, altoPx: 4000 }], { anchoPagina: (80 * 72) / 25.4, altoPagina: ((80 * 72) / 25.4) * (4000 / 604), margenX: 0, margenY: 0 })
  const pdf = texto(bytes)
  assert.match(pdf, /\/Count 1/)
  assert.match(pdf, /\/MediaBox \[0 0 226\.77 /)
  assert.match(pdf, /q 226\.77 0 0 1501\.\d\d 0\.00 0\.00 cm \/Im0 Do Q/)
})

test('una lista vacía no rompe el envoltorio', () => {
  const pdf = texto(pdfDeJpegPaginas([], { anchoPagina: PAGINA_A4.ancho, altoPagina: PAGINA_A4.alto }))
  assert.match(pdf, /\/Count 0/)
  assert.match(pdf, /%%EOF/)
})

test('el nombre del PDF es seguro y con la referencia', () => {
  assert.equal(nombrePdfDocumento('cotizacion', 'COT-0007'), 'cotizacion-COT-0007.pdf')
  assert.equal(nombrePdfDocumento('Cotización Cliente', 'PV-12 / Juan'), 'cotizacion-cliente-PV-12-Juan.pdf')
  assert.equal(nombrePdfDocumento('', ''), 'documento.pdf')
})
