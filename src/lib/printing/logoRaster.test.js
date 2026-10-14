import assert from 'node:assert/strict'
import test from 'node:test'
import { logoRasterDesdeDataUrl, umbralOtsu } from './logoRaster.js'

test('Otsu separa tinta y papel según el logo y queda acotado', () => {
  const histograma = new Array(256).fill(0)
  histograma[30] = 400
  histograma[240] = 600
  const umbral = umbralOtsu(histograma)
  assert.ok(umbral >= 96 && umbral <= 200, 'dentro de los límites')
  assert.equal(umbralOtsu([]), 168, 'sin datos, el umbral fijo de siempre')
})

test('en Node (sin canvas) el logo raster devuelve null y el ticket sale sin logo', async () => {
  assert.equal(await logoRasterDesdeDataUrl('data:image/png;base64,AAAA'), null)
})
