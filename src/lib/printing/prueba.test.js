// Ticket de prueba (#277): la app usa el modelo de la biblioteca. El corto es
// el predeterminado (título + validación, sin pie ni códigos) y el completo
// conserva la trazabilidad. Acá se verifica el adaptador de la app.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TIPOS_TICKET_PRUEBA, ticketPruebaTipo } from './tickets.js'

const FUENTE = readFileSync(new URL('./tickets.js', import.meta.url), 'utf8')

const texto = (ticket) => ticket.lineas().join('\n')

test('el corto sale solo con el título y la validación', () => {
  const ticket = ticketPruebaTipo('corta')
  const lineas = texto(ticket)

  assert.match(lineas, /TICKET DE PRUEBA MobOS/)
  assert.match(lineas, new RegExp(`VALIDACIÓN ${ticket.validador}`))
  assert.match(ticket.validador, /^\d{4}-\d$/)
  assert.equal(ticket.corte, true, 'corta el papel')
  assert.ok(ticket.lineas().length < 12, `el corto no lleva pie ni códigos (${ticket.lineas().length} líneas)`)
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
