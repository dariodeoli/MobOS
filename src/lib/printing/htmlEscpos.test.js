import test from 'node:test'
import assert from 'node:assert/strict'
import { perfilRaster, ticketDeRaster, MAX_BYTES_RASTER } from './htmlEscpos.js'
import { htmlConAreaTermica, areaTermica } from './papelTermico.js'
test('513 papel físico conserva203dpi/8dotsmm, área útil y márgenes sin escalado', () => {
  assert.deepEqual(areaTermica(80), {
    papelMm: 80,
    utilMm: 72,
    margenMm: 4,
    dots: 576,
    papelDots: 640,
    css: (80 * 96) / 25.4,
  })
  assert.equal(areaTermica(58).dots, 384)
  for (const model of ['QL-800', 'LTT214', 'TSP143IIIW', ''])
    assert.throws(() => perfilRaster({ modelo: model, ancho: 80 }), /ZKP8008/)
  assert.equal(perfilRaster({ modelo: 'ZKP-8008', ancho: 80 }).dots, 576)
  assert.throws(() => perfilRaster({ modelo: 'ZKP8008', ancho: 110 }), /80 mm/)
  assert.equal(htmlConAreaTermica('A4', 'a4'), 'A4')
  assert.match(htmlConAreaTermica('<head></head>', 'thermal-80'), /width:72mm/)
})
test('513 raster válido emite cada fila una vez y corta solo tras la imagen completa', () => {
  const image = { ancho: 384, alto: 600, bytes: new Uint8Array(48 * 600).fill(0xaa) }
  const b = ticketDeRaster(image).bytes()
  let rows = 0,
    cuts = 0
  for (let i = 0; i < b.length;) {
    if (b[i] === 29 && b[i + 1] === 118 && b[i + 2] === 48) {
      const w = b[i + 4] + 256 * b[i + 5],
        h = b[i + 6] + 256 * b[i + 7]
      assert.equal(w, 48)
      rows += h
      assert.ok(h <= 256)
      i += 8 + w * h
    } else {
      if (b[i] === 29 && b[i + 1] === 86) cuts++
      i++
    }
  }
  assert.equal(rows, 600)
  assert.equal(cuts, 1)
  assert.throws(() => ticketDeRaster({ ...image, bytes: new Uint8Array(1) }), /inválida/)
  assert.throws(
    () => ticketDeRaster({ ancho: 576, alto: 6000, bytes: new Uint8Array(72 * 6000) }),
    /límite/,
  )
  assert.equal(MAX_BYTES_RASTER, 393216)
})
