import assert from 'node:assert/strict'
import test from 'node:test'
import { TIPOS_TICKET_PRUEBA, ticketCertificado, ticketComprobante, ticketEtiquetaProducto, ticketEtiquetasProducto, ticketEtiquetaUnidad, ticketInformeDispositivo, ticketNotaEntrega, ticketProforma, ticketPruebaTipo, ticketReciboInterno, ticketRemision, ticketVerificacionImei } from './tickets.js'
import { datosInformeDispositivo } from './informeDispositivo.js'
import { datosCertificado } from './certificado.js'
import { digitoVerificadorEan, esEan13, formatoDeCodigo } from './codigos.js'

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
  assert.ok(texto.includes('Recibí conforme:'))
  assert.ok(texto.includes('Aclaración:'))
  assert.ok(texto.includes('Observaciones:'))
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
  assert.ok(texto.includes('Entregué (despacho):'))
  assert.ok(texto.includes('Recibí conforme (recepción):'))
  assert.ok(texto.includes('Aclaración:'))
  assert.ok(texto.includes('Observaciones:'))
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
  assert.ok(texto.includes('Entregué / cobré:'))
  assert.ok(texto.includes('Recibí conforme:'))
  assert.ok(texto.includes('Observaciones:'))
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

const productoEtiqueta = { name: "Cable USB-C E2E", sku: "E2E-CABLE", pricePyg: 45000 }

test("la etiqueta de producto imprime nombre, SKU, precio y código de barras", () => {
  const texto = ticketEtiquetaProducto(productoEtiqueta, { ancho: 80 }).lineas().join("")
  assert.ok(texto.includes("Cable USB-C E2E"), "nombre")
  assert.ok(texto.includes("SKU"), "rótulo SKU")
  assert.ok(texto.includes("E2E-CABLE"), "SKU impreso")
  assert.ok(texto.includes("Gs 45.000"), "precio de venta")
  assert.ok(texto.includes("[BARRA] E2E-CABLE"), "código de barras sobre el SKU")
  assert.ok(texto.includes("CODE128"), "formato por defecto")
})

test("la etiqueta respeta el precio pasado por lista o escalón", () => {
  const texto = ticketEtiquetaProducto(productoEtiqueta, { ancho: 80, precioPyg: 39000, lista: "Mayorista" }).lineas().join("")
  assert.ok(texto.includes("Gs 39.000"), "precio de la lista")
  assert.ok(!texto.includes("Gs 45.000"), "no imprime el pricePyg si vino otro precio")
  assert.ok(texto.includes("Lista: Mayorista"), "origen del precio")
})

test("un SKU EAN-13 válido sale como EAN-13 y la cantidad repite las etiquetas", () => {
  const ean = "7791234567898"
  assert.equal(digitoVerificadorEan(ean.slice(0, 12)), ean[12])
  assert.equal(esEan13(ean), true)
  assert.equal(formatoDeCodigo(ean), "ean13")
  const ticket = ticketEtiquetaProducto({ name: "Producto EAN", sku: ean, pricePyg: 10000 }, { ancho: 58, cantidad: 3 })
  const texto = ticket.lineas().join("")
  assert.equal(ticket.lineas().filter((linea) => linea.includes("[BARRA]")).length, 3)
  assert.ok(texto.includes("EAN-13"), "rótulo EAN-13")
  assert.ok(texto.includes("2 de 3"), "numeración de copias")
  const bytes = Array.from(ticket.bytes())
  const comando = [0x1d, 0x6b, 0x43, 0x0c].join(",")
  assert.ok(bytes.some((_, indice) => bytes.slice(indice, indice + 4).join(",") === comando), "usa GS k 67 (EAN-13)")
})

test("un SKU que no es EAN válido cae a CODE128", () => {
  const ticket = ticketEtiquetaProducto({ name: "Producto", sku: "7791234567890", pricePyg: 0 }, { ancho: 80 })
  const texto = ticket.lineas().join("")
  assert.equal(formatoDeCodigo("7791234567890"), "code128")
  assert.ok(texto.includes("CODE128"))
  assert.ok(texto.includes("Gs 0") || texto.includes("—"), "sin precio, guion")
})

test("el lote de etiquetas imprime la cantidad pedida por producto", () => {
  const ticket = ticketEtiquetasProducto([
    { product: productoEtiqueta, cantidad: 1 },
    { product: { name: "Funda E2E", sku: "E2E-FUNDA", pricePyg: 80000 }, cantidad: 2 },
  ], { ancho: 80 })
  const texto = ticket.lineas().join("")
  assert.equal(ticket.lineas().filter((linea) => linea.includes("[BARRA]")).length, 3)
  assert.ok(texto.includes("E2E-FUNDA"))
  assert.ok(texto.includes("Gs 80.000"))
})

// #206: los documentos firmables reservan espacio real de firma (rol +
// aclaración + CI + fecha + observaciones) y el diseño de 58 mm no es el de
// 80 escalado: las etiquetas van en líneas cortas.
test('los documentos firmables reservan firma y observaciones en 58 y 80 mm', () => {
  const nota80 = ticketNotaEntrega(PEDIDO, { ancho: 80 }).lineas().join('\n')
  assert.ok(nota80.includes('Recibí conforme:'), 'rol de firma')
  assert.ok(nota80.includes('Aclaración:'), 'aclaración para escribir')
  assert.ok(nota80.includes('CI:'), 'CI')
  assert.ok(/Fecha: ___\/___\/______/.test(nota80), 'fecha para completar')
  assert.ok(nota80.includes('Observaciones:'), 'área de observaciones')

  const lineas58 = ticketNotaEntrega(PEDIDO, { ancho: 58 }).lineas()
  const nota58 = lineas58.join('\n')
  assert.ok(nota58.includes('Fecha: ____/____/_________'), 'en 58 mm la fecha va en su propia línea corta')
  assert.ok(!nota58.includes('CI: __________________  Fecha:'), 'el diseño de 58 mm no reusa el de 80')
  for (const linea of lineas58) assert.ok(linea.length <= 33, `sin desborde en 58 mm: "${linea}"`)

  const remision = ticketRemision({ lines: [] }, { ancho: 80 }).lineas().join('\n')
  assert.ok(remision.includes('Entregué (despacho):') && remision.includes('Recibí conforme (recepción):'), 'dos firmas en la remisión')
  const recibo = ticketReciboInterno({ amountPyg: 1000, method: 'CASH' }, {}, { ancho: 58 }).lineas().join('\n')
  assert.ok(recibo.includes('Recibí conforme:') && recibo.includes('Observaciones:'), 'firma y observaciones en el recibo')
  const proforma = ticketProforma({ number: 'C-9', items: [] }, { ancho: 80 }).lineas().join('\n')
  assert.ok(proforma.includes('Aceptación del cliente:'), 'aceptación en la proforma')
})

// #206: la firma térmica no puede quedar a un renglón de los campos (no entra
// la mano). Cada rol reserva 3 avances (~12 mm) + la línea ancha antes de la
// aclaración, en 58 y en 80.
test('la firma térmica reserva altura real para escribir a mano', () => {
  for (const ancho of [58, 80]) {
    const lineas = ticketNotaEntrega(PEDIDO, { ancho }).lineas()
    const rol = lineas.findIndex((linea) => linea.includes('Recibí conforme:'))
    assert.ok(rol >= 0, `rol de firma en ${ancho} mm`)
    assert.equal(lineas[rol + 1], '\n\n\n', `3 avances de firma en ${ancho} mm`)
    assert.match(lineas[rol + 2], /^\s*-+\n$/, `línea ancha de firma en ${ancho} mm`)
    assert.match(lineas[rol + 3], /^\s*Aclaración:/, `aclaración después de la línea en ${ancho} mm`)
  }

  const remision58 = ticketRemision({ lines: [] }, { ancho: 58 }).lineas()
  const roles = ['Entregué (despacho):', 'Recibí conforme (recepción):']
  for (const textoRol of roles) {
    const i = remision58.findIndex((linea) => linea.includes(textoRol))
    assert.ok(i >= 0, `rol presente: ${textoRol}`)
    assert.equal(remision58[i + 1], '\n\n\n', `espacio de firma para ${textoRol}`)
    assert.match(remision58[i + 2], /^\s*-+\n$/, `línea de firma para ${textoRol}`)
  }
})

// #203: el comprobante de verificación de IMEI imprime la info mínima y
// honesta (estado, fecha y fuente), avisa si es simulado y no expone datos
// internos. La térmica corta el rollo como el resto de los comprobantes.
test('el comprobante de verificación de IMEI imprime la info mínima y honesta', () => {
  const ticket = ticketVerificacionImei({
    imei: '•••••••••••1234',
    etiqueta: 'Verificado',
    detalle: 'IMEI verificado: sin reportes al 21/09/2026',
    fechaTexto: '21/09/2026, 15:04',
    fuente: 'IMEIcheck.net',
    simulado: true,
    cliente: 'Juan Pérez',
    campos: [{ etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' }],
  }, { ancho: 80 })
  const texto = ticket.lineas().join('')
  assert.ok(texto.includes('Verificación de IMEI'), 'título claro')
  assert.ok(texto.includes('(simulada)'), 'avisa cuando el resultado es ficticio')
  assert.ok(texto.includes('•••••••••••1234'), 'el IMEI va enmascarado')
  assert.ok(texto.includes('IMEI verificado: sin reportes al 21/09/2026'), 'estado y fecha')
  assert.ok(texto.includes('IMEIcheck.net'), 'fuente visible')
  assert.ok(texto.includes('Juan Pérez'), 'cliente en el comprobante')
  assert.ok(texto.includes('Comprobante informativo'), 'aclaración honesta')
  assert.ok(texto.includes('Documento no fiscal'), 'leyenda no fiscal (igual que el A4)')
  assert.ok(!/costo|price|provider|raw/i.test(texto), 'sin datos internos')
  assert.equal(ticket.corteEnviado(), true, 'envía el corte')
  assert.ok(texto.includes('[CORTE]'), 'marca de corte en la vista previa')
})

// #220: la etiqueta de unidad lleva modelo, identificador, IMEI/serial completo
// legible, QR y barras en bloques separados (no pegados): el operador tiene que
// saber qué código escanear.
test('la etiqueta de unidad separa modelo, identificador, IMEI, QR y barras (#220)', () => {
  const unit = {
    serial: '356789012345678',
    condition: 'USED',
    batteryHealth: 89,
    supplierName: 'Proveedor XYZ',
    location: { code: 'D2', name: 'Depósito 2' },
    product: { model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio' },
  }
  const lineas = ticketEtiquetaUnidad(unit, { ancho: 58, base: 'https://app.moboss.online' }).lineas()
  const texto = lineas.join('\n')
  // El modelo puede envolverse en 58 mm: se compara con espacios normalizados.
  assert.ok(texto.replace(/\s+/g, ' ').includes('iPhone 15 Pro · 256GB · Titanio'), 'modelo')
  assert.ok(texto.includes('IDENTIFICADOR'), 'rótulo del identificador')
  assert.ok(texto.includes('5678'), 'identificador corto')
  assert.ok(texto.includes('IMEI / SERIAL'), 'rótulo del serial')
  assert.ok(texto.includes('356789012345678'), 'serial completo legible')
  assert.ok(lineas.some((linea) => linea.trim() === '356789012345678'), 'el serial va completo en una línea')
  assert.ok(texto.includes('CÓDIGO QR'), 'rótulo del QR')
  assert.ok(texto.includes('[QR]'), 'el QR va en el ticket')
  assert.ok(texto.includes('CÓDIGO DE UNIDAD'), 'rótulo del código de unidad')
  assert.ok(texto.includes('MOBOS:356789012345678'), 'código de unidad como texto')

  // Los payloads completos viajan en los bytes (la vista previa recorta):
  // el QR con la URL de la unidad y las barras con el código MOBOS.
  const bytes = atob(ticketEtiquetaUnidad(unit, { ancho: 58, base: 'https://app.moboss.online' }).base64())
  assert.ok(bytes.includes('https://app.moboss.online/u/356789012345678'), 'el QR lleva la URL completa')
  assert.ok(bytes.includes('MOBOS:356789012345678'), 'las barras llevan el código completo')

  // Jerarquía: entre el QR y las barras hay una línea divisoria (no van pegados).
  const iQr = lineas.findIndex((linea) => linea.includes('[QR]'))
  const iBarra = lineas.findIndex((linea) => linea.includes('[BARRA]'))
  assert.ok(iQr >= 0 && iBarra > iQr, 'QR antes que barras')
  assert.ok(lineas.slice(iQr, iBarra).some((linea) => /^\s*-+\s*$/.test(linea)), 'divisoria entre QR y barras')

  // En 80 mm el serial gana tamaño (doble ancho) sin cortarse.
  const ancho80 = ticketEtiquetaUnidad(unit, { ancho: 80, base: 'https://app.moboss.online' }).lineas().join('\n')
  assert.ok(ancho80.includes('356789012345678'), 'serial completo en 80 mm')
})

// #240: el informe de dispositivo imprime equipo, IMEI enmascarado,
// verificación IMEI, inspección física, garantía y el QR al informe público.
test('el informe de dispositivo imprime el equipo, el IMEI y el QR público (#240)', () => {
  const datos = datosInformeDispositivo({
    serial: '356789102345673',
    condition: 'USED',
    batteryHealth: 89,
    location: { code: 'D2', name: 'Depósito 2' },
    lastVerifiedBy: { name: 'Lucía' },
    lastVerifiedAt: '2026-09-21T15:04:00Z',
    verificationCount: 3,
    warrantyUntil: '2026-10-21T00:00:00Z',
    grade: 'A',
    inspection: { puntaje: 92, aprobados: 8, total: 8 },
    product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio' },
  }, {
    base: 'https://app.moboss.online',
    emisor: 'Móvil Center',
    ahora: new Date('2026-09-22T10:00:00Z'),
    consulta: { imei: '356789102345673', status: 'verificado', resolvedAt: '2026-09-21T15:04:00Z', normalized: [{ clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' }] },
  })
  const ticket = ticketInformeDispositivo(datos, { ancho: 80 })
  const texto = ticket.lineas().join('\n')
  assert.ok(texto.includes('INFORME DE DISPOSITIVO'), 'título')
  assert.ok(texto.includes('iPhone 15 Pro · 256GB · Titanio'), 'modelo')
  assert.ok(texto.includes('•••••••••••5673'), 'IMEI enmascarado')
  assert.ok(!texto.includes('Serial'), 'un IMEI no imprime la fila Serial en claro')
  assert.ok(texto.includes('Verificación IMEI') && texto.includes('Blacklist actual'), 'verificación IMEI')
  assert.ok(texto.includes('Inspección física') && texto.includes('Lucía'), 'quién verificó')
  assert.ok(texto.includes('Grado') && texto.includes('A'), 'grado (contrato INV)')
  assert.ok(texto.includes('8/8'), 'checklist (contrato INV)')
  assert.ok(texto.includes('Garantía vigente'), 'garantía de la tienda')
  assert.ok(texto.includes('[QR]') && texto.includes('INFORME DEL DISPOSITIVO'), 'QR del informe público')
  const bytes = atob(ticket.base64())
  assert.ok(bytes.includes('https://app.moboss.online/u/356789102345673'), 'el QR lleva la URL completa')
  assert.ok(!/USD|0\.06|provider|raw/i.test(texto), 'sin costos ni datos internos')
  assert.equal(ticket.corteEnviado(), true, 'envía el corte')
})

// #240 · certificado de inspección (contrato de INV `docs/PHONECHECK-INFORME.md`).
const CERTIFICADO_UNIDAD = {
  id: 'u1',
  serial: 'AUR00017518',
  condition: 'USED',
  product: { name: 'iPhone 15', model: 'iPhone 15', capacity: '128GB' },
  branch: { name: 'Casa Central' },
  inspection: {
    items: { pantalla: { estado: 'ok' }, audio: { estado: 'observacion', nota: 'Crujido al máximo' }, camaras: { estado: 'na' }, carcasa: { estado: 'falla', nota: 'Golpe en la esquina' } },
    cosmetico: 'marcas de uso',
    bateriaPct: '89',
    bateriaCiclos: '310',
    grado: 'B',
    puntaje: 67,
    inspeccionadoAt: '2026-09-21T23:09:00.000Z',
    inspeccionadoPor: 'Lucía Fernández',
  },
}
const CERTIFICADO_PUBLICO = {
  titulo: 'Certificado PhoneCheck',
  grado: 'A',
  puntaje: 100,
  serial: '•••••••7518',
  bateria: { porcentaje: '89', ciclos: '310' },
  controles: [{ clave: 'icloud', label: 'iCloud / Find My', ok: true, estado: 'libre' }, { clave: 'esn', label: 'ESN / lista negra', ok: false, estado: 'activo', valor: 'Reportado' }],
  items: [
    { grupo: 'Pantalla', label: 'Pantalla / táctil', estado: 'ok', nota: '' },
    { grupo: 'Audio', label: 'Altavoces y micrófono', estado: 'observacion', nota: 'Crujido al máximo' },
  ],
  verificado: '2026-09-21T23:09:00.000Z',
  enlace: 'https://app.moboss.online/informe/abc123',
  aviso: 'iCloud/US Block clean no equivalen a blacklist mundial.',
}

test('el certificado de inspección imprime grado, controles, checklist y el QR (#240)', () => {
  const datos = datosCertificado(CERTIFICADO_UNIDAD, { informe: CERTIFICADO_PUBLICO, emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') })
  const ticket = ticketCertificado(datos, { ancho: 80 })
  const texto = ticket.lineas().join('\n')
  assert.ok(texto.includes('CERTIFICADO PHONECHECK'), 'título del contrato de INV (rollo en mayúsculas)')
  assert.ok(ticket.lineas().some((linea) => linea.trim() === 'A'), 'el grado va grande')
  assert.ok(texto.includes('Puntaje 100/100 · 1/2 conformes'), 'puntaje y conformes')
  assert.ok(texto.includes('iCloud / Find My') && texto.includes('ESN / lista negra') && texto.includes('Activo'), 'semáforo de controles con los rótulos compartidos')
  assert.ok(texto.includes('Pantalla / táctil') && texto.includes('Crujido al máximo'), 'checklist con notas')
  assert.ok(texto.includes('Lucía Fernández'), 'quién verificó')
  assert.ok(texto.includes('INFORME PÚBLICO') && texto.includes('[BARRA]'), 'QR + código en barras')
  const plano = ticket.lineas().join(' ').replace(/\s+/g, ' ')
  assert.ok(plano.includes('iCloud/US Block clean no equivalen a blacklist mundial.'), 'aviso obligatorio')
  assert.ok(!texto.includes('AUR00017518'), 'el serial completo no viaja al papel')
  assert.ok(texto.includes('•••••••7518'), 'serial enmascarado')
  const bytes = atob(ticket.base64())
  assert.ok(bytes.includes('https://app.moboss.online/informe/abc123'), 'el QR lleva el informe público')
  assert.ok(bytes.includes('CERT|'), 'el código interno viaja en barras')
  assert.equal(ticket.corteEnviado(), true)
})

test('el certificado sin inspección sale «pendiente» y honesto (#240)', () => {
  const datos = datosCertificado({ serial: 'AUR00017518', product: { name: 'iPhone 15' } }, { base: 'https://app.moboss.online', ahora: new Date('2026-09-22T10:00:00Z') })
  const texto = ticketCertificado(datos, { ancho: 80 }).lineas().join('\n')
  assert.ok(texto.includes('Pendiente de inspección'))
  assert.ok(texto.includes('CERTIFICADO DE INSPECCIÓN'), 'sin contrato de INV el título es neutro')
  assert.ok(texto.includes('/u/AUR00017518'), 'el QR cae a la ficha pública de la unidad')
})

test('en 58 mm el checklist del certificado no se corta (#240)', () => {
  const datos = datosCertificado(CERTIFICADO_UNIDAD, { informe: CERTIFICADO_PUBLICO, ahora: new Date('2026-09-22T10:00:00Z') })
  const texto = ticketCertificado(datos, { ancho: 58 }).lineas().join('\n')
  for (const marca of ['Altavoces y micrófono', 'Obs.', 'ESN / lista negra', 'Reportado', 'Crujido al máximo']) {
    assert.ok(texto.includes(marca), `no se corta «${marca}»`)
  }
})

test('el informe imprime el checklist PhoneCheck con sus fallas y el aviso (#240)', () => {
  const unit = {
    serial: '356789102345673',
    condition: 'USED',
    batteryHealth: 89,
    product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio' },
    lastVerifiedBy: { name: 'Lucía' },
    lastVerifiedAt: '2026-09-21T15:04:00Z',
    inspection: { items: { pantalla: { estado: 'ok' }, audio: { estado: 'falla', nota: 'Micrófono bajo' } }, cosmetico: 'buen estado', bateriaCiclos: '310' },
  }
  const datos = datosInformeDispositivo(unit, { ahora: new Date('2026-09-22T10:00:00Z'), base: 'https://app.moboss.online' })
  const ticket = ticketInformeDispositivo(datos, { ancho: 80 })
  const texto = ticket.lineas().join('\n')
  assert.ok(texto.includes('Inspección física'), 'bloque de inspección')
  assert.ok(texto.includes('Cosmético') && texto.includes('buen estado'), 'cosmético')
  assert.ok(texto.includes('Batería') && texto.includes('310 ciclos'), 'ciclos de batería')
  assert.ok(texto.includes('Puntaje') && texto.includes('50/100'), 'puntaje calculado (ok + falla)')
  assert.ok(texto.includes('Pantalla / táctil') && texto.includes('Bien'), 'ítems con el rótulo compartido')
  assert.ok(texto.includes('Micrófono bajo'), 'nota de la falla')
  const plano = ticket.lineas().join(' ').replace(/\s+/g, ' ')
  assert.ok(plano.includes('iCloud/US Block clean no equivalen a blacklist mundial.'), 'aviso')
  const lineaDelImei = ticket.lineas().find((linea) => linea.trim().startsWith('IMEI')) || ''
  assert.ok(!lineaDelImei.includes('356789102345673'), 'la fila del IMEI va enmascarada')
})

test('en 58 mm el checklist del informe no se corta (#240)', () => {
  const unit = { serial: '356789102345673', product: { name: 'iPhone 15', model: 'iPhone 15' }, inspection: { items: { audio: { estado: 'observacion', nota: 'Crujido al máximo' }, camaras: { estado: 'na' } }, cosmetico: 'marcas de uso' } }
  const datos = datosInformeDispositivo(unit, { ahora: new Date('2026-09-22T10:00:00Z') })
  const texto = ticketInformeDispositivo(datos, { ancho: 58 }).lineas().join('\n')
  for (const marca of ['Altavoces y micrófono', 'Obs.', 'Cámaras', 'N/A', 'Crujido al máximo']) {
    assert.ok(texto.includes(marca), `no se corta «${marca}»`)
  }
})
