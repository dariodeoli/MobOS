import assert from 'node:assert/strict'
import test from 'node:test'
import { TIPOS_TICKET_PRUEBA, ticketComprobante, ticketNotaEntrega, ticketProforma, ticketPruebaTipo, ticketReciboInterno, ticketRemision } from './tickets.js'

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

test('el comprobante muestra el total de ítems y destaca el saldo pendiente', () => {
  const order = {
    orderNumber: 'P-100',
    createdAt: new Date('2026-09-19T12:00:00Z').toISOString(),
    totalPyg: 1000000,
    subtotalPyg: 1000000,
    items: [
      { description: 'iPhone 13', quantity: 2, unitPricePyg: 300000, totalPyg: 600000 },
      { description: 'Funda', quantity: 1, unitPricePyg: 400000, totalPyg: 400000 },
    ],
    payments: [{ status: 'CONFIRMED', method: 'CASH', amountPyg: 400000 }],
    fulfillmentStatus: 'PROCESSING',
    customer: { name: 'Cliente' },
  }
  const ticket = ticketComprobante(order, { nivel: 'completo', ancho: 80, link: 'https://app.moboss.online/p/token-vivo' })
  const texto = ticket.lineas().join('')
  assert.match(texto, /Total de ítems\s+3/, 'la suma de cantidades es 3')
  assert.ok(texto.includes('SALDO PENDIENTE'), 'el saldo pendiente se imprime en negrita')
  assert.match(texto, /SALDO PENDIENTE\n\s+Gs 600\.000/, 'el saldo va grande en su propia línea')
  assert.ok(texto.includes('[QR] https://app.moboss.online/p/token-vivo'), 'el QR lleva el enlace del nivel')
})

test('el comprobante imprime el logo de la empresa como raster GS v 0', () => {
  const logo = { ancho: 8, alto: 2, bytes: new Uint8Array([0b10000000, 0b00000001]) }
  const ticket = ticketComprobante({ orderNumber: 'P-1', totalPyg: 0, items: [], payments: [] }, { nivel: 'rapido', ancho: 80, logo })
  assert.ok(ticket.lineas().join('').includes('[LOGO]'), 'la vista previa marca el logo')
  const bytes = Array.from(ticket.bytes())
  const comando = [0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x02, 0x00].join(',')
  const posicion = bytes.findIndex((_, indice) => bytes.slice(indice, indice + 8).join(',') === comando)
  assert.ok(posicion >= 0, 'el encabezado lleva GS v 0 con el tamaño correcto')
})

test('un comprobante sin saldo no imprime la línea de saldo', () => {
  const order = {
    orderNumber: 'P-101',
    totalPyg: 100000,
    subtotalPyg: 100000,
    items: [{ description: 'Producto', quantity: 1, unitPricePyg: 100000, totalPyg: 100000 }],
    payments: [{ status: 'CONFIRMED', method: 'CASH', amountPyg: 100000 }],
  }
  const texto = ticketComprobante(order, { nivel: 'rapido', ancho: 80 }).lineas().join('')
  assert.ok(!texto.includes('SALDO PENDIENTE'))
  assert.ok(texto.includes('Total de ítems'))
})

const PEDIDO = {
  orderNumber: 'MOB-#0042',
  createdAt: new Date('2026-09-19T12:00:00Z').toISOString(),
  fulfillmentStatus: 'READY_TO_SHIP',
  deliveryType: 'Delivery',
  items: [
    { description: 'iPhone 13 128GB', quantity: 2, unitPricePyg: 3000000, totalPyg: 6000000 },
    { description: 'Funda silicona', quantity: 1, unitPricePyg: 150000, totalPyg: 150000 },
  ],
  customer: { name: 'Ana Gómez', document: '1234567' },
  branch: { name: 'Sucursal Central' },
  tenant: { name: 'MobOS Demo' },
}

test('la nota de entrega lista cantidades, receptor y firma con leyenda no fiscal', () => {
  const ticket = ticketNotaEntrega(PEDIDO, { ancho: 80 })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Nota de entrega'))
  assert.ok(texto.includes('MOB-#0042'))
  assert.ok(texto.includes('Ana Gómez'))
  assert.ok(texto.includes('iPhone 13 128GB'))
  assert.ok(texto.includes('Funda silicona'))
  assert.ok(texto.includes('Total de unidades'))
  assert.ok(texto.includes('Receptor'))
  assert.ok(texto.includes('Firma'))
  assert.ok(texto.includes('Documento no fiscal'))
  assert.ok(texto.includes('[CORTE]'))
  assert.ok(ticket.base64().length > 100)
})

test('la remisión informa origen, destino, seriales y las dos firmas', () => {
  const transfer = {
    sourceBranch: { name: 'Central' },
    destinationBranch: { name: 'Shopping' },
    createdAt: new Date('2026-09-19T12:00:00Z').toISOString(),
    aexGuide: 'A003526979',
    createdBy: { name: 'Dario' },
    lines: [{ sourceProduct: { name: 'iPhone 14' }, quantity: 1, serials: ['356789012345678'] }],
  }
  const ticket = ticketRemision(transfer, { ancho: 80 })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Remisión interna'))
  assert.ok(texto.includes('Central -> Shopping'))
  assert.ok(texto.includes('Guía AEX'))
  assert.ok(texto.includes('A003526979'))
  assert.ok(texto.includes('356789012345678'))
  assert.ok(texto.includes('Entrega:'))
  assert.ok(texto.includes('Recepción:'))
  assert.ok(texto.includes('Documento no fiscal'))
  assert.ok(texto.includes('[CORTE]'))
})

test('el recibo interno detalla el cobro, el medio y las firmas', () => {
  const pago = {
    id: 'pay-9876',
    amountPyg: 450000,
    method: 'TRANSFER',
    reference: 'Itaú 000123',
    paidAt: new Date('2026-09-19T12:00:00Z').toISOString(),
  }
  const ticket = ticketReciboInterno(pago, PEDIDO, { ancho: 80 })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Recibo interno'))
  assert.ok(texto.includes('MOB-#0042-9876'))
  assert.ok(texto.includes('Ana Gómez'))
  assert.ok(texto.includes('Transferencia'))
  assert.ok(texto.includes('Itaú 000123'))
  assert.ok(texto.includes('Gs 450.000'))
  assert.ok(texto.includes('Firma de quien recibe'))
  assert.ok(texto.includes('Firma de quien entrega'))
  assert.ok(texto.includes('Documento no fiscal'))
  assert.ok(texto.includes('[CORTE]'))
})

test('la proforma imprime ítems, totales y validez sin validez fiscal', () => {
  const quote = {
    number: 'COT-#0007',
    createdAt: new Date('2026-09-19T12:00:00Z').toISOString(),
    validUntil: new Date('2026-09-30T12:00:00Z').toISOString(),
    customerName: 'Carlos Benítez',
    subtotalPyg: 1000000,
    discountPyg: 100000,
    totalPyg: 900000,
    items: [{ description: 'iPhone 12', quantity: 1, unitPricePyg: 1000000, totalPyg: 1000000 }],
  }
  const ticket = ticketProforma(quote, { ancho: 80 })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Factura proforma'))
  assert.ok(texto.includes('COT-#0007'))
  assert.ok(texto.includes('Carlos Benítez'))
  assert.ok(texto.includes('iPhone 12'))
  assert.ok(texto.includes('Gs 1.000.000'))
  assert.ok(texto.includes('Descuento'))
  assert.ok(texto.includes('Gs 900.000'))
  assert.ok(texto.includes('Documento no fiscal'))
  assert.ok(texto.includes('[CORTE]'))
})

test('los documentos no fiscales entran en 58 mm sin desbordar', () => {
  const tickets = [
    ticketNotaEntrega(PEDIDO, { ancho: 58 }),
    ticketRemision({ sourceBranch: { name: 'Central' }, destinationBranch: { name: 'Shopping' }, lines: [{ sourceProduct: { name: 'iPhone 14 Pro Max' }, quantity: 1, serials: ['356789012345678'] }] }, { ancho: 58 }),
    ticketReciboInterno({ amountPyg: 450000, method: 'CASH', reference: 'Caja 1' }, PEDIDO, { ancho: 58 }),
    ticketProforma({ number: 'COT-#0007', items: [{ description: 'iPhone 12 128GB', quantity: 1, unitPricePyg: 1000000 }], totalPyg: 1000000 }, { ancho: 58 }),
  ]
  for (const ticket of tickets) {
    const texto = ticket.lineas().join('')
    const lineas = texto.split('\n').filter((linea) => !linea.includes('[QR]') && !linea.includes('[BARRA]') && !linea.includes('[LOGO]'))
    for (const linea of lineas) assert.ok(linea.length <= 32, `línea de 58 mm dentro del ancho (${linea.length}): ${linea.slice(0, 40)}`)
    assert.ok(texto.includes('Documento no fiscal'))
  }
})
