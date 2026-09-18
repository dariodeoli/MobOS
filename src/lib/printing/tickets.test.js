import assert from 'node:assert/strict'
import test from 'node:test'
import { TIPOS_TICKET_PRUEBA, ticketPruebaTipo } from './tickets.js'

const opciones = { ancho: 80, impresora: 'lan:192.168.1.23:9100', nombre: 'ZKP8008', equipo: 'mac-puente', copias: 1 }

test('los cinco tipos de prueba arman un ticket con trazabilidad completa', () => {
  for (const tipo of Object.keys(TIPOS_TICKET_PRUEBA)) {
    const ticket = ticketPruebaTipo(tipo, opciones)
    const texto = ticket.lineas().join('')
    assert.match(ticket.ref, /^TEST-/, `ref del tipo ${tipo}`)
    assert.match(ticket.validacion, /^\d{4}$/, `validación de 4 dígitos en ${tipo}`)
    assert.ok(texto.includes('TICKET DE PRUEBA'), `encabezado en ${tipo}`)
    assert.ok(texto.includes(TIPOS_TICKET_PRUEBA[tipo]), `etiqueta del tipo en ${tipo}`)
    assert.ok(texto.includes('Impresora                        ZKP8008') || texto.includes('ZKP8008'), `nombre de impresora en ${tipo}`)
    assert.ok(texto.includes('Método'), `método en ${tipo}`)
    assert.ok(texto.includes('lan:192.168.1.23:9100'), `destino en ${tipo}`)
    assert.ok(texto.includes('80 mm'), `ancho en ${tipo}`)
    assert.ok(texto.includes('Copias'), `copias en ${tipo}`)
    assert.ok(texto.includes('mac-puente'), `equipo en ${tipo}`)
    assert.ok(texto.includes(ticket.ref), `id de trabajo en ${tipo}`)
    assert.ok(texto.includes(ticket.validacion), `número de validación en ${tipo}`)
    assert.ok(ticket.base64().length > 100, `bytes en ${tipo}`)
  }
})

test('el ticket de venta incluye comercio, IVA, QR y código de barras', () => {
  const ticket = ticketPruebaTipo('venta', opciones)
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('SUCURSAL CENTRAL'))
  assert.ok(texto.includes('IVA 10%'))
  assert.ok(texto.includes('Total'))
  assert.ok(texto.includes('Medio de pago'))
  assert.ok(texto.includes('[QR:'))
  assert.ok(texto.includes('[BARRA]'))
})

test('el ticket de caracteres ejercita acentos, negrita y doble alto', () => {
  const ticket = ticketPruebaTipo('caracteres', opciones)
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('á é í ó ú ü ñ'))
  assert.ok(texto.includes('Negrita'))
  assert.ok(texto.includes('DOBLE'))
  assert.ok(texto.includes('Columna izquierda'))
})

test('cada ejecución genera un número de validación nuevo', () => {
  const primero = ticketPruebaTipo('corta', opciones)
  const segundo = ticketPruebaTipo('corta', opciones)
  assert.notEqual(primero.ref, segundo.ref)
})

test('una cola usb: se informa como CUPS, no como cable USB', () => {
  const ticket = ticketPruebaTipo('corta', { ...opciones, impresora: 'usb:ZKP8008' })
  assert.ok(ticket.lineas().join('').includes('CUPS'))
  const explicito = ticketPruebaTipo('corta', { ...opciones, impresora: 'usb:ZKP8008', metodo: 'CUPS · sale por red' })
  assert.ok(explicito.lineas().join('').includes('CUPS · sale por red'))
})

test('todos los tipos confirman que el comando de corte fue enviado', () => {
  for (const tipo of Object.keys(TIPOS_TICKET_PRUEBA)) {
    const ticket = ticketPruebaTipo(tipo, opciones)
    assert.equal(ticket.corte, true, `corte enviado en ${tipo}`)
    assert.ok(ticket.lineas().join('').includes('[CORTE]'), `marca de corte en la vista previa de ${tipo}`)
  }
})

test('la prueba de corte explica la verificación física', () => {
  const ticket = ticketPruebaTipo('corte', opciones)
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Corte físico'))
  assert.ok(texto.includes('Cutter Enable: YES'))
  assert.ok(texto.includes('GS V 0'))
})
