// QR compartido (#240): opciones por defecto, valor vacío y overrides.
import test from 'node:test'
import assert from 'node:assert/strict'

const { QR_OPCIONES, qrDataUrl } = await import('./qr.js')

test('un valor genera un data URL de imagen y el vacío no genera nada', async () => {
  const imagen = await qrDataUrl('https://moboss.online/u/DEMO0001')
  assert.match(imagen, /^data:image\/png;base64,/)
  assert.equal(await qrDataUrl(''), '')
  assert.equal(await qrDataUrl('   '), '')
  assert.equal(await qrDataUrl(null), '')
  assert.equal(await qrDataUrl(undefined), '')
})

test('las opciones por defecto son las de la app y se pueden pisar', async () => {
  assert.deepEqual(QR_OPCIONES, { nivel: 'M', margen: 1, ancho: 220 })
  const chico = await qrDataUrl('https://moboss.online/u/DEMO0001', { ancho: 120 })
  const grande = await qrDataUrl('https://moboss.online/u/DEMO0001', { ancho: 320, nivel: 'H', margen: 2 })
  assert.match(chico, /^data:image\/png;base64,/)
  assert.match(grande, /^data:image\/png;base64,/)
  assert.ok(grande.length > chico.length, 'más ancho y más corrección = imagen más grande')
})
