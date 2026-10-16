import assert from 'node:assert/strict'
import { builtinTemplates, templateDefinition, templateInput, templateKind, templateName, templateRevision } from '../lib/print-templates'
import fixtures from './fixtures/print-templates-507.json'
const presets = builtinTemplates()
assert.deepEqual(presets, fixtures)
let checks = 1
const reject = (edit: (d: any) => void) => { const d = structuredClone(presets[1].definition); edit(d); assert.throws(() => templateDefinition('etiquetas-producto', d)); checks++ }
for (const kind of ['script', '', 1, null]) { assert.throws(() => templateKind(kind)); checks++ }
for (const name of ['<script>', 'https://secret.test', 'X@Y', '', 'x'.repeat(81)]) { assert.throws(() => templateName(name)); checks++ }
for (const rev of [0, -1, 1.1, '1', null]) { assert.throws(() => templateRevision(rev)); checks++ }
assert.equal(templateName('  Producto nuevo  '), 'Producto nuevo'); checks++
assert.throws(() => templateInput({ kind: 'comprobante', tenantId: 'foreign' })); checks++
reject(d => { d.html = '<p>private</p>' })
reject(d => { d.elements[0].text = 'Nombre cliente real' })
reject(d => { d.profile.logoUrl = 'https://private' })
reject(d => { d.page.widthMm = '110' })
reject(d => { d.page.widthMm = Infinity })
reject(d => { d.page.widthMm = 110.001 })
reject(d => { d.page.heightMm = null })
reject(d => { d.page.orientation = 45 })
reject(d => { d.page.margins.left = 110 })
reject(d => { d.profile.printableWidthMm = 110 })
reject(d => { d.profile.output = 'escpos' })
reject(d => { d.profile.dpi = 300 })
reject(d => { d.elements[0].binding = 'cost' })
reject(d => { d.elements[0].type = 'qr' })
reject(d => { d.elements[0].visible = false })
reject(d => { d.elements = [] })
reject(d => { d.elements[0].xMm = 0 })
reject(d => { d.elements[0].yMm = 59 })
reject(d => { d.elements[0].fontSizePt = 1 })
reject(d => { d.elements[1].id = d.elements[0].id })
reject(d => { d.elements[1].binding = d.elements[0].binding })
reject(d => { d.elements[1].yMm = 4 })
reject(d => { d.elements[3].widthMm = 10 })
reject(d => { d.elements[0].rotation = 12 })
reject(d => { d.page.heightMm = 1800 })
reject(d => { d.profile.deviceFamily = 'star-tsp143iiiw' })
for (const orientation of [0, 90] as const) { const d: ReturnType<typeof templateDefinition> = structuredClone(presets[1].definition); d.page.orientation = orientation; assert.equal(templateDefinition('etiquetas-producto', d).page.widthMm, 110); checks++ }
const brother = structuredClone(presets[1].definition); brother.page.widthMm = 25; brother.page.heightMm = 90; brother.profile = { deviceFamily: 'brother-ql800', output: 'document', dpi: 300, printableWidthMm: 23, offsetXmm: 1, offsetYmm: 0 }; brother.elements.forEach(e => { e.widthMm = 21 })
assert.equal(templateDefinition('etiquetas-producto', brother).page.widthMm, 25); checks++
for (const element of presets[0].definition.elements) {
  const d = structuredClone(presets[0].definition)
  d.elements = d.elements.filter(e => e.binding !== element.binding)
  assert.throws(() => templateDefinition('comprobante', d), element.binding + ' cannot be removed'); checks++
  const hidden = structuredClone(presets[0].definition)
  hidden.elements.find(e => e.binding === element.binding)!.visible = false
  assert.throws(() => templateDefinition('comprobante', hidden), element.binding + ' cannot be hidden'); checks++
}
console.log(`print-templates: ${checks} checks PASS`)
