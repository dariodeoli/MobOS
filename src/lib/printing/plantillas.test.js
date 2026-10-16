import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESETS_PLANTILLA,
  erroresPlantilla,
  clonarPlantilla,
  nombrePlantillaValido,
} from './plantillas.js'
import { aplicarPerfilPlantilla, erroresPerfil } from './perfiles.js'
import { moverElemento, mmAPuntos, paginaFisica, rotacionElemento } from './geometria.js'
import { renderPlantilla, datosProductoPlantilla } from './renderPlantilla.js'
import { pdfDeJpegPaginas } from './pdfDocumento.js'
const product = () =>
  clonarPlantilla(PRESETS_PLANTILLA.find(p => p.kind === 'etiquetas-producto').definition)
const row = {
  product: 'iPhone 15 <script>alert(1)</script>',
  sku: 'SKU-QA-001',
  barcode: 'SKU-QA-001',
  price: 'Gs 4.850.000',
}
for (const preset of PRESETS_PLANTILLA)
  test(`preset válido: ${preset.kind}`, () =>
    assert.deepEqual(erroresPlantilla(preset.kind, preset.definition), []))
test('papel físico no cambia con orientación y cajas rotadas conservan geometría', () => {
  const d = product()
  d.page.orientation = 90
  assert.deepEqual(paginaFisica(d), { widthMm: 110, heightMm: 60 })
  const e = d.elements[0],
    r = rotacionElemento(e, d.page)
  assert.equal(r.widthMm, e.heightMm)
  assert.equal(r.heightMm, e.widthMm)
  assert.equal(r.rotation, 90)
  assert.equal(moverElemento(d, e.id, 1, -1).elements[0].xMm, 3)
  assert.equal(d.elements[0].xMm, 2)
})
for (const [label, mutate] of [
  [
    'solape',
    d => {
      d.elements[1].yMm = 3
    },
  ],
  [
    'margen',
    d => {
      d.elements[0].xMm = 0
    },
  ],
  [
    'ocultar obligatorio',
    d => {
      d.elements[0].visible = false
    },
  ],
  [
    'borrar obligatorio',
    d => {
      d.elements.pop()
    },
  ],
  [
    'HTML en definición',
    d => {
      d.elements[0].html = '<b>no</b>'
    },
  ],
  [
    'URL',
    d => {
      d.profile.url = 'https://no.example'
    },
  ],
  [
    'medida no finita',
    d => {
      d.page.widthMm = NaN
    },
  ],
  [
    'precisión',
    d => {
      d.elements[0].xMm = 2.001
    },
  ],
  [
    'tipo incorrecto',
    d => {
      d.elements[0].type = 'logo'
    },
  ],
])
  test(`rechaza ${label}`, () => {
    const d = product()
    mutate(d)
    assert.ok(erroresPlantilla('etiquetas-producto', d).length)
  })
test('perfiles provisionales conservan requeridos y caben físicamente', () => {
  for (const preset of PRESETS_PLANTILLA.filter(p => p.kind !== 'comprobante'))
    for (const profile of ['generic', 'brother-ql800', '3nstar-ltt214']) {
      const d = aplicarPerfilPlantilla(preset.definition, profile, preset.kind)
      assert.deepEqual(erroresPlantilla(preset.kind, d), [], `${preset.kind}/${profile}`)
    }
  assert.ok(
    erroresPerfil(
      { widthMm: 11, heightMm: 90 },
      {
        deviceFamily: 'brother-ql800',
        output: 'document',
        dpi: 300,
        printableWidthMm: 9,
        offsetXmm: 1,
        offsetYmm: 0,
      },
    ).length,
  )
  assert.ok(
    erroresPerfil(
      { widthMm: 80, heightMm: 1800 },
      {
        deviceFamily: '3nstar-ltt214',
        output: 'document',
        dpi: 203,
        printableWidthMm: 76,
        offsetXmm: 2,
        offsetYmm: 0,
      },
    ).length,
  )
})
test('nombres y cantidades no aceptan valores ejecutables ni pérdida de copias', () => {
  assert.equal(nombrePlantillaValido('Etiqueta 25 × 90'), true)
  assert.equal(nombrePlantillaValido('<img>'), false)
  const result = datosProductoPlantilla([
    {
      product: {
        name: 'Funda',
        sku: 'FND-1',
        precioPyg: 180000,
        costPyg: 50,
        supplierName: 'PRIVADO',
      },
      cantidad: 2,
    },
  ])
  assert.equal(result.length, 2)
  assert.equal(result[0].qr, 'FND-1')
  assert.equal(result[0].brand, 'MobOS')
  assert.deepEqual(Object.keys(result[0]).sort(), [
    'barcode',
    'brand',
    'price',
    'product',
    'qr',
    'sku',
  ])
  assert.match(result[0].price, /180.000/)
  assert.throws(() => datosProductoPlantilla([{ product: {}, cantidad: 1.5 }]), /cantidad/)
  assert.throws(
    () => datosProductoPlantilla(Array.from({ length: 3 }, () => ({ product: {}, cantidad: 99 }))),
    /200/,
  )
})
test('render único conserva texto completo escapado y una página por copia', async () => {
  const result = await renderPlantilla({
    kind: 'etiquetas-producto',
    definition: product(),
    data: [row, row],
  })
  assert.equal(result.count, 2)
  assert.equal(result.html, result.pages[0].html)
  assert.match(result.html, /&lt;script&gt;alert/)
  assert.doesNotMatch(result.html, /<script>/)
  assert.match(result.html, /@page\{size:110mm 60mm/)
  assert.match(result.html, /Gs 4.850.000/)
  assert.match(result.html, /SKU-QA-001/)
  await assert.rejects(
    renderPlantilla({
      kind: 'etiquetas-producto',
      definition: product(),
      data: [{ ...row, sku: '' }],
    }),
    /obligatorio/,
  )
})
test('código denso se bloquea antes de exportar sin truncarlo', async () => {
  await assert.rejects(
    renderPlantilla({
      kind: 'etiquetas-producto',
      definition: product(),
      data: [{ ...row, barcode: 'SKU'.repeat(60) }],
    }),
    /denso/,
  )
})
test('comprobante delega sin recomputar total/pagos/QR al builder premium', async () => {
  const def = clonarPlantilla(PRESETS_PLANTILLA[0].definition),
    order = { id: 'QA', totalPyg: 1234567, paidPyg: 500000 }
  let received
  const result = await renderPlantilla({
    kind: 'comprobante',
    definition: def,
    data: [order],
    premiumBuilder: async (value, options) => {
      received = { value, options }
      return '<html><head></head><body><p>TOTAL 1.234.567 PAGOS 500.000 QR</p></body></html>'
    },
  })
  assert.equal(received.value, order)
  assert.deepEqual(received.options, { format: 'thermal-80' })
  assert.match(result.html, /TOTAL 1.234.567 PAGOS 500.000 QR/)
  def.elements.find(e => e.binding === 'payments').visible = false
  assert.ok(erroresPlantilla('comprobante', def).length)
})
test('PDF usa MediaBox exacto 110×60, 25×90 y una página por etiqueta', () => {
  for (const [w, h] of [
    [110, 60],
    [25, 90],
  ]) {
    const pdf = new TextDecoder().decode(
      pdfDeJpegPaginas(
        [
          { bytes: new Uint8Array([255, 216, 255, 217]), anchoPx: 110, altoPx: 60 },
          { bytes: new Uint8Array([255, 216, 255, 217]), anchoPx: 110, altoPx: 60 },
        ],
        { anchoPagina: mmAPuntos(w), altoPagina: mmAPuntos(h), margenX: 0, margenY: 0 },
      ),
    )
    assert.ok(pdf.includes(`/MediaBox [0 0 ${mmAPuntos(w).toFixed(2)} ${mmAPuntos(h).toFixed(2)}]`))
    assert.match(pdf, /\/Count 2/)
  }
})
