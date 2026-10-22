import assert from 'node:assert/strict'
import test from 'node:test'
import { MODULO_IMPRESION_PRO, moduloActivoImpresionPro } from '../impresionPro.js'
import { aplicarDisenoPredeterminado, cargarDisenosPro, cssDeDiseno, fijarDisenosPro, htmlConDiseno } from './disenoPro.js'
import { disenosPro } from './plantillas.js'
import { renderPlantilla } from './renderPlantilla.js'

const HTML = '<!doctype html><html><head><title>x</title><style>body{margin:0}</style></head><body><div class="brand"><h1 class="tipo">Cotización</h1><div class="num">COT-1</div></div><div class="pie-doc"><div class="condiciones">No fiscal</div></div></body></html>'
const diseno = (kind, nombre) => disenosPro(kind).find(p => p.name === nombre).definition

test('Impresión Pro: demo = activo, cuentas = activo por defecto y solo se apaga a mano', () => {
  assert.equal(MODULO_IMPRESION_PRO, 'impresion-pro')
  assert.equal(moduloActivoImpresionPro(null, { esDemo: true }), true)
  assert.equal(moduloActivoImpresionPro({ modules: { 'impresion-pro': { enabled: false } } }, { esDemo: true }), true)
  assert.equal(moduloActivoImpresionPro(null), true)
  assert.equal(moduloActivoImpresionPro({ modules: {} }), true)
  assert.equal(moduloActivoImpresionPro({ modules: { 'impresion-pro': { enabled: true } } }), true)
  assert.equal(moduloActivoImpresionPro({ modules: { 'impresion-pro': { enabled: false } } }), false)
})

test('el diseño traduce tamaños y alineación a las clases del comprobante premium', () => {
  const css = cssDeDiseno(diseno('cotizacion', 'Cotización Centrada'))
  assert.match(css, /\.brand \.tipo\{font-size:11pt!important;text-align:center!important\}/)
  assert.match(css, /\.brand \.num\{font-size:22pt!important;text-align:center!important\}/)
  assert.match(css, /\.totals tr\.total td\{font-size:18pt!important\}\.totals\{margin-left:auto\}/)
  assert.match(css, /\.qr\{width:28mm!important;height:28mm!important\}/)
  assert.equal(cssDeDiseno(null), '')
})

test('con papel de rollo el diseño no cambia el ancho: el ESC/POS de 58 y 80 mm sigue entrando', () => {
  for (const nombre of ['Ticket Clásico', 'Ticket Compacto 58', 'Ticket Grande']) {
    const css = cssDeDiseno(diseno('ticket', nombre))
    assert.doesNotMatch(css, /@page|html,body\{|padding/, nombre)
    const html = htmlConDiseno(HTML, diseno('ticket', nombre))
    assert.ok(html.includes('data-diseno-pro') && html.indexOf('data-diseno-pro') < html.indexOf('</head>'))
  }
  // Solo el PDF de plantilla fija el papel.
  assert.match(cssDeDiseno(diseno('comprobante', 'Comprobante Compacto'), { pagina: true }), /@page\{size:58mm auto;margin:0\}/)
})

test('con el módulo apagado (o sin predeterminado) se imprime el premium normal', () => {
  const definition = diseno('cotizacion', 'Cotización Destacada')
  fijarDisenosPro({ activo: true, disenos: { cotizacion: definition } })
  assert.notEqual(aplicarDisenoPredeterminado('cotizacion', HTML), HTML)
  assert.equal(aplicarDisenoPredeterminado('remito', HTML), HTML, 'sin predeterminado de remito')
  assert.equal(aplicarDisenoPredeterminado('comprobante', HTML), HTML, 'el comprobante va por su plantilla')
  fijarDisenosPro({ activo: false, disenos: { cotizacion: definition } })
  assert.equal(aplicarDisenoPredeterminado('cotizacion', HTML), HTML)
  fijarDisenosPro({})
})

test('cargarDisenosPro elige el predeterminado de cada documento y se apaga con el módulo', async () => {
  const plantilla = { id: 't1', kind: 'remito', definition: diseno('remito', 'Remito Compacto') }
  await cargarDisenosPro(async () => ({ activo: true, effective: { remito: { templateId: 't1' }, ticket: { templateId: null } }, templates: [plantilla] }))
  assert.notEqual(aplicarDisenoPredeterminado('remito', HTML), HTML)
  assert.equal(aplicarDisenoPredeterminado('ticket', HTML), HTML)
  await cargarDisenosPro(async () => ({ activo: false }))
  assert.equal(aplicarDisenoPredeterminado('remito', HTML), HTML)
  await cargarDisenosPro(async () => { throw new Error('sin red') })
  assert.equal(aplicarDisenoPredeterminado('remito', HTML), HTML)
})

test('la galería renderiza ticket, cotización y remito con el encabezado y pie estándar del builder', async () => {
  const builder = async () => HTML
  for (const kind of ['ticket', 'cotizacion', 'remito', 'comprobante']) {
    for (const preset of disenosPro(kind)) {
      const resultado = await renderPlantilla({ kind, definition: preset.definition, data: [{}], premiumBuilder: builder })
      assert.equal(resultado.count, 1, preset.name)
      assert.match(resultado.html, /class="brand"/)
      assert.match(resultado.html, /class="pie-doc"/)
      assert.match(resultado.html, /data-diseno-pro/)
    }
  }
  const ticket = disenosPro('ticket')[0]
  await assert.rejects(() => renderPlantilla({ kind: 'ticket', definition: ticket.definition, data: [{}] }), /armado premium/)
})
