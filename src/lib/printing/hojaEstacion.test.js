import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStationSheetHtml } from './hojaEstacion.js'

// #240 §4: hoja de estación imprimible (impresión en serie del taller).

test('lista los equipos con estado, ubicación y total', () => {
  const html = buildStationSheetHtml([
    { serial: 'AUR001', status: 'AVAILABLE', product: { name: 'iPhone 15' }, location: { name: 'Piso de venta' } },
    { serial: 'AUR002', status: 'AVAILABLE', product: { name: 'Samsung S24' }, lastVerifiedAt: '2026-09-22T10:00:00Z' },
  ], { estacion: 'Por verificar', fecha: new Date('2026-09-22T12:00:00Z') })
  assert.match(html, /AUR001/)
  assert.match(html, /iPhone 15/)
  assert.match(html, /Piso de venta/)
  assert.match(html, /Total: 2 equipo/)
  assert.match(html, /Por verificar/)
  assert.match(html, /class="imei"/)
  assert.match(html, /Disponible/)
})

test('muestra grado y batería cuando la inspección existe (#240)', () => {
  const html = buildStationSheetHtml([
    { serial: 'AUR003', status: 'AVAILABLE', product: { name: 'iPhone 14' }, inspection: { grado: 'B', bateriaSalud: 88, puntaje: 80 } },
  ])
  assert.match(html, /Grado B/)
  assert.match(html, /88% batería/)
})

test('escapa el texto y avisa cuando no hay equipos', () => {
  const html = buildStationSheetHtml([{ serial: '<script>alert(1)</script>', product: { name: '<b>Equipo</b>' } }])
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
  assert.match(buildStationSheetHtml([]), /Sin equipos en esta estación/)
})
