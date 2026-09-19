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
    assert.match(ticket.sufijo, /^\d$/, `sufijo secreto de 1 dígito en ${tipo}`)
    assert.equal(ticket.validador, `${ticket.validacion}-${ticket.sufijo}`)
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
  assert.ok(texto.includes('[QR]'))
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

test('la vista previa no se desborda ni pega líneas (todas las líneas caben)', () => {
  for (const tipo of Object.keys(TIPOS_TICKET_PRUEBA)) {
    const ticket = ticketPruebaTipo(tipo, opciones)
    const lineas = ticket.lineas().join('').split('\n')
    for (const linea of lineas) {
      assert.ok(linea.length <= 48, `línea de ${tipo} dentro del ancho (${linea.length}): ${linea.slice(0, 60)}`)
    }
  }
})

test('la trazabilidad incluye puente, token enmascarado, usuario y conexión', () => {
  const ticket = ticketPruebaTipo('corta', { ...opciones, puente: 'Mac mostrador', tokenPista: '1f75…5a8c', usuario: 'Dario', conexion: 'usb' })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Puente'), 'puente')
  assert.ok(texto.includes('Mac mostrador'), 'nombre del puente')
  assert.ok(texto.includes('1f75…5a8c'), 'token enmascarado')
  assert.ok(texto.includes('Usuario'), 'usuario')
  assert.ok(texto.includes('Dario'), 'usuario autenticado')
  assert.ok(texto.includes('Cola CUPS local'), 'conexión honesta')
  assert.ok(texto.includes('VALIDACIÓN'), 'validación destacada')
  assert.ok(texto.includes('[CORTE]'), 'corte en la vista previa')
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

test('el validador va grande arriba y repetido en el pie', () => {
  const ticket = ticketPruebaTipo('corta', opciones)
  const texto = ticket.lineas().join('')
  const primera = texto.indexOf(`VALIDACIÓN ${ticket.validador}`)
  const ultima = texto.lastIndexOf(`VALIDACIÓN ${ticket.validador}`)
  assert.notEqual(primera, -1, 'validador en el header')
  assert.ok(primera < texto.indexOf('[QR]'), 'el header sale antes del QR')
  assert.ok(ultima > texto.indexOf('[BARRA]'), 'el pie repite el validador después del código de barras')
})
