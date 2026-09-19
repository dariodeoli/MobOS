import assert from 'node:assert/strict'
import test from 'node:test'
import { columnasDeAncho, crearTicket, envolver, repartirLinea } from './escpos.js'

const indiceDeSecuencia = (bytes, secuencia, desde = 0) => {
  for (let indice = desde; indice <= bytes.length - secuencia.length; indice += 1) {
    if (secuencia.every((byte, desplazamiento) => bytes[indice + desplazamiento] === byte)) return indice
  }
  return -1
}

const indiceDeGuardadoQr = (bytes) => bytes.findIndex((byte, indice) => (
  byte === 0x1d
  && bytes[indice + 1] === 0x28
  && bytes[indice + 2] === 0x6b
  && bytes[indice + 5] === 0x31
  && bytes[indice + 6] === 0x50
  && bytes[indice + 7] === 0x30
))

test('el ancho útil es 32 columnas para 58 mm y 48 para 80 mm', () => {
  assert.equal(columnasDeAncho(58), 32)
  assert.equal(columnasDeAncho(80), 48)
  assert.equal(columnasDeAncho(undefined), 32)
})

test('envuelve el texto sin partir palabras y respeta los saltos', () => {
  assert.deepEqual(envolver('uno dos tres', 8), ['uno dos', 'tres'])
  assert.deepEqual(envolver('uno\ndos', 8), ['uno', 'dos'])
  assert.deepEqual(envolver('palabralarguisima', 6), ['palabr', 'alargu', 'isima'])
  assert.deepEqual(envolver('', 8), [''])
})

test('reparte izquierda y derecha en una línea completa', () => {
  assert.equal(repartirLinea('Total', '100', 12), 'Total    100')
  assert.equal(repartirLinea('Producto muy largo', '100', 12), 'Producto 100')
  assert.equal(repartirLinea('Corto', '1', 12).length, 12)
})

test('el ticket arranca con inicialización y página de códigos', () => {
  const ticket = crearTicket({ ancho: 58 })
  const bytes = ticket.iniciar().texto('Hola').bytes()
  assert.deepEqual([...bytes.slice(0, 8)], [0x1b, 0x40, 0x1b, 0x74, 0x02, 0x1b, 0x61, 0x00])
  assert.ok(String.fromCharCode(...bytes.slice(8)).includes('Hola'))
})

test('el padding lateral deja aire a los costados y achica el ancho útil', () => {
  const sinMargen = crearTicket({ ancho: 58, margen: 0 }).texto('x').bytes()
  const conMargen = crearTicket({ ancho: 58, margen: 3 }).texto('x').bytes()
  assert.equal(String.fromCharCode(...sinMargen), 'x\n')
  assert.equal(String.fromCharCode(...conMargen), '   x\n')
  // Con margen 3 el ancho útil baja a 26 columnas.
  assert.equal(crearTicket({ ancho: 58, margen: 3 }).columnas, 26)
  assert.equal(crearTicket({ ancho: 80, margen: 2 }).columnas, 44)
  assert.equal(crearTicket({ ancho: 80 }).columnas, 44)
})

test('los acentos se traducen a CP850', () => {
  const bytes = crearTicket({ ancho: 58, margen: 0 }).texto('ñandú').bytes()
  assert.deepEqual([...bytes.slice(0, 4)], [0xa4, 0x61, 0x6e, 0x64])
  assert.equal(bytes[4], 0xa3)
})

test('par, negrita, doble y corte emiten sus comandos', () => {
  const bytes = crearTicket({ ancho: 58 }).par('Total', 'Gs. 1.000').negrita().doble().corte().bytes()
  const texto = String.fromCharCode(...bytes)
  assert.match(texto, /Total\s+Gs\. 1\.000\n/)
  assert.ok(texto.includes('\x1bE\x01'))
  assert.ok(texto.includes('\x1d!\x11'))
  // Corte ZKP8008: alimentación + GS V 0 (sin `ESC i`, que era un segundo corte).
  assert.ok(texto.endsWith('\x1bd\x04\x1dV\x00'))
  assert.equal(crearTicket().corte().corteEnviado(), true)
})

test('el QR corto emite el largo de parámetros como pL,pH', () => {
  const datos = 'MOBOS:123'
  const bytes = [...crearTicket().qr(datos).bytes()]
  const inicio = bytes.indexOf(0x1d)
  assert.deepEqual(bytes.slice(inicio, inicio + 8), [0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32])
  const inicioGuardado = indiceDeGuardadoQr(bytes)
  assert.notEqual(inicioGuardado, -1)
  assert.deepEqual(bytes.slice(inicioGuardado + 3, inicioGuardado + 5), [datos.length + 3, 0])
})

test('el QR de más de 255 bytes emite el largo de parámetros como pL,pH', () => {
  const datos = 'A'.repeat(253) // 253 bytes de datos + 3 bytes de parámetros = 256
  const bytes = [...crearTicket().qr(datos).bytes()]
  const inicioGuardado = indiceDeGuardadoQr(bytes)
  assert.notEqual(inicioGuardado, -1)
  assert.deepEqual(bytes.slice(inicioGuardado + 3, inicioGuardado + 5), [0, 1])
})

test('la validación imprimible y el corte quedan fuera del largo de guardado del QR', () => {
  const validacion = 'VALIDACION: 1234\n'
  const bytes = [...crearTicket({ margen: 0 }).qr('MOBOS:123').texto(validacion.trimEnd()).corte().bytes()]
  const inicioGuardado = indiceDeGuardadoQr(bytes)
  assert.notEqual(inicioGuardado, -1)

  const largoParametros = bytes[inicioGuardado + 3] + bytes[inicioGuardado + 4] * 256
  const finGuardado = inicioGuardado + 5 + largoParametros
  assert.deepEqual(bytes.slice(finGuardado, finGuardado + 8), [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30])

  const bytesValidacion = [...validacion].map((caracter) => caracter.charCodeAt(0))
  const inicioValidacion = indiceDeSecuencia(bytes, bytesValidacion, finGuardado)
  const bytesCorte = [0x1b, 0x64, 4, 0x1d, 0x56, 0]
  const inicioCorte = indiceDeSecuencia(bytes, bytesCorte, finGuardado)
  assert.ok(inicioValidacion >= finGuardado)
  assert.ok(inicioCorte > inicioValidacion)
})

test('el código de barras CODE128 lleva el largo y el corte se puede omitir', () => {
  const bytes = [...crearTicket().barcode('MOB-1').bytes()]
  assert.deepEqual(bytes.slice(0, 3), [0x1b, 0x61, 0x01]) // centra el código de barras
  assert.ok(bytes.includes(0x1d) && bytes.includes(0x68) && bytes.includes(0x50))
  const marca = bytes.indexOf(0x49)
  assert.equal(bytes[marca + 1], 7) // {B + MOB-1
  assert.equal(String.fromCharCode(...bytes.slice(marca + 2, marca + 9)), '{BMOB-1')
})

test('los caracteres que CP850 no tiene se reemplazan por equivalentes', () => {
  const texto = String.fromCharCode(...crearTicket({ ancho: 58, margen: 0 }).texto('Cliente · A→B ×2 — ok “cita” …').bytes())
  assert.ok(texto.includes('·'.charCodeAt(0) === 0xb7 ? '\u00fa' : '')) // el punto medio sale en CP850
  assert.ok(texto.includes('->'))
  assert.ok(texto.includes('x2'))
  assert.ok(texto.includes('- ok'))
  assert.ok(texto.includes('"cita"'))
  assert.ok(texto.includes('...'))
  assert.ok(!texto.includes('?'))
})

test('base64 devuelve los mismos bytes', () => {
  const ticket = crearTicket().texto('ok')
  const bytes = ticket.bytes()
  const binario = atob(ticket.base64())
  assert.equal(binario.length, bytes.length)
  for (let i = 0; i < bytes.length; i += 1) assert.equal(binario.charCodeAt(i), bytes[i])
})

test('las variantes de corte emiten su secuencia GS V', () => {
  const cola = (variante, largo) => [...crearTicket().corte(variante).bytes()].slice(-largo)
  assert.deepEqual(cola('completo', 6), [0x1b, 0x64, 4, 0x1d, 0x56, 0x00])
  assert.deepEqual(cola('parcial', 6), [0x1b, 0x64, 4, 0x1d, 0x56, 0x01])
  assert.deepEqual(cola('avanza-completo', 7), [0x1b, 0x64, 4, 0x1d, 0x56, 0x41, 0x00])
  assert.deepEqual(cola('avanza-parcial', 7), [0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00])
})
