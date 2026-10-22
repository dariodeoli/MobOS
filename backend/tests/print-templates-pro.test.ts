import assert from 'node:assert/strict'
import test from 'node:test'
import { FLOW_KINDS, PRINT_TEMPLATE_KINDS, allBuiltinTemplates, proTemplates, templateDefinition, templateName } from '../lib/print-templates'

const HEADER_FOOTER = ['brand', 'documentTitle', 'documentNumber', 'date', 'nonFiscal', 'qr']

test('Impresión Pro: 3 o 4 diseños por documento y todos son válidos', () => {
  const pro = proTemplates()
  for (const kind of PRINT_TEMPLATE_KINDS) {
    const lista = pro.filter(preset => preset.kind === kind)
    assert.ok(lista.length >= 3 && lista.length <= 4, `${kind}: ${lista.length} diseños`)
  }
  assert.equal(new Set(pro.map(p => `${p.kind}:${p.name}`)).size, pro.length, 'nombres únicos por documento')
  for (const preset of pro) {
    assert.equal(templateName(preset.name), preset.name, `${preset.name}: nombre aceptado al guardarlo como plantilla`)
    assert.equal(preset.pro, true)
  }
})

test('los diseños de documento conservan el encabezado y el pie estándar del comprobante premium', () => {
  for (const preset of proTemplates().filter(p => FLOW_KINDS.includes(p.kind as never))) {
    assert.equal(preset.definition.page.heightMm, null, `${preset.name}: alto continuo`)
    const visibles = new Set(preset.definition.elements.filter(e => e.visible).map(e => e.binding))
    for (const binding of HEADER_FOOTER) assert.ok(visibles.has(binding), `${preset.name} muestra ${binding}`)
    // Ocultar o quitar el encabezado o el pie no se acepta al guardar.
    for (const binding of HEADER_FOOTER) {
      const sin = structuredClone(preset.definition)
      sin.elements = sin.elements.filter(e => e.binding !== binding)
      assert.throws(() => templateDefinition(preset.kind as never, sin), `${preset.name}: no se puede quitar ${binding}`)
      const oculto = structuredClone(preset.definition)
      oculto.elements.find(e => e.binding === binding)!.visible = false
      assert.throws(() => templateDefinition(preset.kind as never, oculto), `${preset.name}: no se puede ocultar ${binding}`)
    }
  }
})

test('cada documento tiene su primer diseño para restablecer y el premium actual sigue primero', () => {
  const todos = allBuiltinTemplates()
  for (const kind of PRINT_TEMPLATE_KINDS) assert.ok(todos.some(p => p.kind === kind), kind)
  assert.equal(todos[0].name, 'Comprobante premium')
  assert.equal(todos.find(p => p.kind === 'comprobante')!.name, 'Comprobante premium')
})

test('ticket, cotización y remito exigen sus datos y rechazan contenido ajeno', () => {
  const ticket = proTemplates().find(p => p.kind === 'ticket')!
  const conCosto = structuredClone(ticket.definition)
  conCosto.elements[0].binding = 'cost'
  assert.throws(() => templateDefinition('ticket', conCosto))
  // Un ticket no es una etiqueta: su definición no vale para etiquetas.
  assert.throws(() => templateDefinition('etiquetas-producto', ticket.definition))
  const remito = proTemplates().find(p => p.kind === 'remito')!
  assert.ok(!remito.definition.elements.some(e => e.binding === 'payments'))
})
