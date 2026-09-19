import assert from 'node:assert/strict'
import test from 'node:test'
import { CHECKLISTS } from './servicioChecklist.js'
import { buildServiceIntakeHtml, buildServiceReportHtml, esquemaSvg, ordenParaImpresion, puntosEsquema } from './servicioImpresion.js'

const orden = {
  id: 'os_1',
  serviceNumber: 'OS-#0007',
  customerName: 'Dario De Oliveira',
  device: 'iPhone 17 Pro Max',
  deviceType: 'iPhone',
  serial: '356789012345678',
  reportedIssue: 'No enciende',
  diagnosis: 'Sin alimentación',
  pricePyg: 350000,
  status: 'RECIBIDO',
  receivedAt: '2026-09-17T10:00:00.000Z',
  checklist: { Enciende: true, Pantalla: true },
  estadoFisico: { Enciende: true, 'Batería': false },
  unlockCode: '1234',
  unlockPattern: [1, 2, 5],
}

test('la hoja A4 imprime dos mitades idénticas con la orden y el aviso legal', () => {
  const html = buildServiceIntakeHtml(orden, { empresa: { nombre: 'iPhone Store', telefono: '0991 000 000' } })
  assert.equal(html.match(/class="mitad"/g).length, 2)
  assert.match(html, /OS-#0007/)
  assert.match(html, /VERIFIQUE ATENTAMENTE EL DISEÑO/)
  assert.match(html, /CLIENTE: ___/)
  assert.match(html, /DECLARO HABER ENTREGADO MI DISPOSITIVO/)
})

test('la hoja muestra los puntos del checklist con lo marcado', () => {
  const html = buildServiceIntakeHtml(orden, {})
  assert.match(html, /☑/)
  assert.match(html, /☐/)
  assert.match(html, /Cámara posterior/)
  assert.match(html, /Estado físico/)
})

test('la versión de 80 mm va en una sola mitad', () => {
  const html = buildServiceIntakeHtml(orden, { format: 'thermal' })
  assert.equal(html.match(/class="mitad"/g).length, 1)
  assert.match(html, /@page\{size:80mm auto/)
})

test('el reporte técnico trae los bloques del formulario', () => {
  const html = buildServiceReportHtml(orden, { empresa: { nombre: 'iPhone Store' } })
  for (const texto of ['REPORTE TÉCNICO', 'Información del cliente', 'Información del producto', 'Prob. notificado', 'Prob. constatado', 'Pruebas ejecutadas', 'Solución propuesta']) {
    assert.ok(html.includes(texto), `falta ${texto}`)
  }
})

test('el esquema del equipo sale con el tipo pedido', () => {
  assert.match(esquemaSvg('Apple Watch'), /svg/)
  assert.match(esquemaSvg('iPhone'), /Esquema del equipo/)
})

test('el HTML escapa lo que viene del cliente', () => {
  const html = buildServiceIntakeHtml({ ...orden, customerName: '<script>alert(1)</script>' }, {})
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;/)
})

test('la orden del API se normaliza para imprimir', () => {
  const normalizada = ordenParaImpresion({ serviceName: 'iPad · Cambio de batería', desbloqueo: { pin: '4321', patron: [7, 8, 9] }, checklist: { 'Enciende': true, 'Batería': false, Pantalla: 'raro' } })
  assert.equal(normalizada.deviceType, 'iPad')
  assert.equal(normalizada.unlockCode, '4321')
  assert.deepEqual(normalizada.unlockPattern, [7, 8, 9])
  assert.deepEqual(normalizada.estadoFisico, { 'Enciende': true, 'Batería': false })
})

test('los puntos del esquema numeran el checklist dentro del lienzo', () => {
  const puntos = puntosEsquema('iPhone')
  assert.equal(puntos.length, 8)
  assert.deepEqual(puntos.map((punto) => punto.numero), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(puntos[0].etiqueta, CHECKLISTS.iPhone[0])
  for (const punto of puntos) {
    assert.ok(punto.x > 0 && punto.x < 150 && punto.y > 0 && punto.y < 150, `fuera del lienzo: ${punto.etiqueta}`)
  }
})
