import assert from 'node:assert/strict'
import {
  OTP_MAX_ATTEMPTS,
  codigoValido,
  enmascararEmail,
  enmascararTelefono,
  generarCodigoOtp,
  hashDeCodigo,
  hashDeDestino,
  hashDeSnapshot,
  huellaDeCliente,
  itemsCongelados,
  normalizarFirma,
  snapshotDeCotizacion,
} from '../lib/quote-approval'

// ── Snapshot congelado ─────────────────────────────────────────────────────
const cotizacion = {
  number: 'COT-0001',
  customerName: '  Cliente Demo ',
  customerId: 'cust-1',
  items: [
    { productId: 'p-1', description: 'iPhone 15', quantity: 2, unitPricePyg: 4000000, totalPyg: 8000000 },
    { description: 'Funda', quantity: 1, unitPricePyg: 150000 },
  ],
  subtotalPyg: 8150000,
  discountPyg: 150000,
  totalPyg: 8000000,
  notes: 'Entrega en 48 h',
  validUntil: new Date('2026-10-10T12:00:00.000Z'),
}
const snapshot = snapshotDeCotizacion(cotizacion)
assert.equal(snapshot.customerName, 'Cliente Demo', 'el nombre se normaliza')
assert.equal(snapshot.items.length, 2)
assert.equal(snapshot.items[1].totalPyg, 150000, 'el total de línea se completa si falta')
assert.equal(snapshot.validUntil, '2026-10-10T12:00:00.000Z')
assert.equal(snapshot.totalPyg, 8000000)

assert.deepEqual(itemsCongelados(null), [])
assert.equal(itemsCongelados([{ description: 'x', quantity: 0 }])[0].quantity, 1, 'la cantidad nunca es 0')

// ── Hash de evidencia ──────────────────────────────────────────────────────
const hashA = hashDeSnapshot({ b: 2, a: [1, { z: 1, y: 2 }] })
const hashB = hashDeSnapshot({ a: [1, { y: 2, z: 1 }], b: 2 })
assert.equal(hashA, hashB, 'el hash canónico no depende del orden de claves')
assert.match(hashA, /^[a-f0-9]{64}$/)
assert.notEqual(hashDeSnapshot({ a: 1 }), hashDeSnapshot({ a: 2 }), 'un cambio de contenido cambia el hash')
assert.notEqual(hashDeSnapshot(snapshot), hashDeSnapshot({ ...snapshot, items: [{ ...snapshot.items[0], quantity: 3 }] }))
assert.equal(hashDeSnapshot(snapshot), hashDeSnapshot(JSON.parse(JSON.stringify(snapshot))), 'serializar/deserializar conserva el hash')

// ── OTP ────────────────────────────────────────────────────────────────────
async function main() {
  const codigo = generarCodigoOtp()
  assert.match(codigo, /^\d{6}$/)
  assert.ok(Number(codigo) >= 0 && Number(codigo) < 1000000)
  assert.equal(OTP_MAX_ATTEMPTS, 5)
  const hashed = await hashDeCodigo('123456')
  assert.notEqual(hashed, '123456')
  assert.equal(await codigoValido('123456', hashed), true)
  assert.equal(await codigoValido('654321', hashed), false)
  assert.equal(await codigoValido('12345', hashed), false, 'un código de 5 dígitos no pasa formato')
  assert.equal(await codigoValido('1234567', hashed), false)

  // ── Máscaras y destinos ────────────────────────────────────────────────
  assert.equal(enmascararEmail('juan.perez@dominio.com'), 'j***@d***.com')
  assert.equal(enmascararEmail('sin-arroba'), 's***@***')
  assert.match(enmascararTelefono('595981123456'), /^\+595 98\*\*\* \*\*\* 456$/)
  assert.equal(enmascararTelefono('123'), '***')
  assert.equal(hashDeDestino('EMAIL', 'Juan@Dominio.com'), hashDeDestino('EMAIL', 'juan@dominio.com'), 'el destino no distingue mayúsculas')
  assert.notEqual(hashDeDestino('EMAIL', 'a@b.com'), hashDeDestino('PHONE', 'a@b.com'))

  // ── Evidencia de cliente y firma opcional ──────────────────────────────
  const headers = new Headers({ 'x-forwarded-for': '190.1.2.3, 10.0.0.1', 'user-agent': 'Mobi' })
  const huella = huellaDeCliente(headers)
  assert.match(String(huella.ipHash), /^[a-f0-9]{64}$/)
  assert.notEqual(huella.ipHash, '190.1.2.3')
  assert.equal(huella.userAgent, 'Mobi')
  assert.equal(huellaDeCliente(new Headers()).ipHash, null)

  const firmaValida = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  assert.equal(normalizarFirma(firmaValida), firmaValida)
  assert.equal(normalizarFirma('data:image/jpeg;base64,AAAA'), null, 'solo PNG')
  assert.equal(normalizarFirma('hola'), null)
  assert.equal(normalizarFirma(''), null)
  assert.equal(normalizarFirma(undefined), null)
  const firmaGrande = `data:image/png;base64,${Buffer.alloc(120 * 1024).toString('base64')}`
  assert.equal(normalizarFirma(firmaGrande), null, 'la firma no puede superar 96 KB')

  console.log('quote-approval.test.ts: ok')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
