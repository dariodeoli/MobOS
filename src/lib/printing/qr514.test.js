import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { crearTicket } from './escpos.js'
import { qrPedido } from './qr.js'
// Lector independiente del framing ESC/POS: longitud little endian de parámetros,
// sin buscar un terminador en datos que podrían contener cualquier byte.
function extraerDatosQr(raw) {
  const b = Buffer.from(raw)
  for (let i = 0; i + 8 <= b.length; i++) {
    if (b[i] !== 29 || b[i + 1] !== 40 || b[i + 2] !== 107) continue
    const length = b.readUInt16LE(i + 3)
    if (b[i + 5] === 49 && b[i + 6] === 80 && b[i + 7] === 48) {
      assert.ok(i + 5 + length <= b.length)
      const end = i + 5 + length
      assert.deepEqual([...b.subarray(end, end + 8)], [29, 40, 107, 3, 0, 49, 81, 48])
      return b.subarray(i + 8, end)
    }
  }
  throw Error('QR no encontrado')
}
for (const token of [
  'Abcdefghijklmnopqrstuvwxyz0123_-',
  'a'.repeat(64),
  'Abcdefghijklmnopqrstuvwxyz0123_-ÿ',
]) {
  test(`514 QR sintético conserva el payload, ${token.length} caracteres de entrada`, () => {
    const url = qrPedido(token, 'https://clientes.example.invalid')
    const expected = `https://clientes.example.invalid/pedidos/${encodeURIComponent(token)}`
    assert.equal(url, expected)
    const ticket = crearTicket().iniciar().qr(url).texto('DESPUÉS DEL QR').corte()
    const encoded = JSON.stringify({ data: ticket.base64() })
    const bytes = Buffer.from(JSON.parse(encoded).data, 'base64')
    assert.deepEqual(bytes, Buffer.from(ticket.bytes()))
    assert.deepEqual(extraerDatosQr(bytes), Buffer.from(expected, 'utf8'))
    assert.equal(extraerDatosQr(bytes).includes(255), false, 'no se agrega byte FF')
    assert.equal(
      extraerDatosQr(bytes).toString().endsWith('%C3%BF'),
      token.endsWith('ÿ'),
      'no corrige ni recorta tokens recibidos',
    )
  })
}
test('514 fronteras pL/pH mantienen datos y siguiente comando fuera del QR', () => {
  for (const size of [252, 253, 254, 255, 256, 512]) {
    const value = 'x'.repeat(size)
    assert.equal(extraerDatosQr(crearTicket().qr(value).corte().bytes()).toString(), value)
  }
})
