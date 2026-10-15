// Ticket de prueba (#277): la app usa el modelo de la biblioteca. El corto es
// el predeterminado (título + validación, sin pie ni códigos) y el completo
// conserva la trazabilidad. Acá se verifica el adaptador de la app.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TIPOS_TICKET_PRUEBA, ticketPruebaTipo } from './tickets.js'

const FUENTE = readFileSync(new URL('./tickets.js', import.meta.url), 'utf8')

const texto = (ticket) => ticket.lineas().join('\n')

test('el corto sale solo con el título y la validación', () => {
  const ticket = ticketPruebaTipo('corta')
  const lineas = texto(ticket)

  assert.match(lineas, /PRUEBA DE IMPRESIÓN/)
  assert.match(lineas, new RegExp(`VALIDACIÓN ${ticket.validador}`))
  assert.match(ticket.validador, /^\d{4}-\d$/)
  assert.equal(ticket.corte, true, 'corta el papel')
  assert.match(lineas, /Generado por MobOS/, 'pie premium incluso en prueba corta')
  assert.doesNotMatch(lineas, /Escanear|Acentos|Puente|Trabajo/)
  assert.doesNotMatch(lineas, /Fecha/)
  assert.equal(typeof ticket.base64(), 'string')
})

test('el corto puede incluir la fecha y el completo mantiene la trazabilidad', () => {
  assert.match(texto(ticketPruebaTipo('corta', { incluyeFecha: true })), /Fecha/)

  const completo = ticketPruebaTipo('completa', {
    impresora: 'lan:192.168.1.50:9100',
    nombre: 'Mostrador',
    usuario: 'Ana',
    puente: 'Mac local',
    marca: 'A',
    corte: 'parcial',
  })
  const lineas = texto(completo)
  assert.match(lineas, /Prueba completa/)
  assert.match(lineas, /Comparativa A/)
  assert.match(lineas, /Escanear/)
  assert.match(lineas, /Mostrador/)
  assert.match(lineas, /Puente/)
  assert.match(lineas, /\[CORTE: parcial\]/)
})

test('los tipos de prueba incluyen el corto y el completo', () => {
  assert.equal(TIPOS_TICKET_PRUEBA.corta, 'Prueba corta')
  assert.equal(TIPOS_TICKET_PRUEBA.completa, 'Prueba completa')
  assert.ok(Object.hasOwn(TIPOS_TICKET_PRUEBA, 'venta'))
})

test('el modelo del ticket vive en la biblioteca (adaptador, sin copia local)', () => {
  assert.match(FUENTE, /import \{ TIPOS_PRUEBA, paginaDePrueba \} from 'owncoding-ui'/)
  assert.match(FUENTE, /paginaDePrueba\(\{/, 'la app delega el armado del ticket')
  assert.doesNotMatch(FUENTE, /TICKET DE PRUEBA/, 'la app no vuelve a copiar el modelo del ticket')
})

// #432: un único constructor, identidad premium, diagnóstico y pie antes del corte.
import { fijarEmpresaImpresion, fijarLogoImpresion } from './empresaImpresion.js'
for (const ancho of [58, 80]) test(`prueba premium ${ancho}mm: un ESC@ y un pie antes del corte`, () => {
  fijarEmpresaImpresion({ tenant: { name: 'Tienda QA', ruc: '80012345-6', address: 'Dirección QA', phone: '021000000' }, branch: { name: 'Sucursal QA' } })
  fijarLogoImpresion({ 58: { ancho: 8, alto: 1, bytes: new Uint8Array([255]) }, 80: { ancho: 8, alto: 1, bytes: new Uint8Array([255]) } })
  try {
    for (const tipo of Object.keys(TIPOS_TICKET_PRUEBA)) {
      const ticket = ticketPruebaTipo(tipo, { ancho })
      const bytes = Buffer.from(ticket.base64(), 'base64')
      const starts = [...bytes].filter((value, index) => value === 27 && bytes[index + 1] === 64)
      assert.equal(starts.length, 1, tipo)
      const content = texto(ticket)
      assert.match(content, /Tienda QA/)
      assert.match(content, /RUC 80012345-6/)
      assert.match(content, /Sucursal QA/)
      assert.match(content, /VALIDACIÓN/)
      assert.equal((content.match(/Generado por MobOS/g) || []).length, 1, tipo)
      assert.ok(content.indexOf('Generado por MobOS') < content.lastIndexOf('[CORTE'), tipo)
      assert.ok(bytes.includes(Buffer.from([29, 118, 48])), 'logo raster presente')
    }
  } finally { fijarEmpresaImpresion({ tenant: null, branch: null }); fijarLogoImpresion() }
})
