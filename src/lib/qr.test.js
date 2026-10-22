// QR compartido (#240): opciones por defecto, valor vacío y overrides.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const { QR_OPCIONES, qrDataUrl, configurarLogoQr, cajaLogoQr, QR_LOGO } = await import('./qr.js')
const { default: jsQR } = await import('jsqr')
const { PNG } = await import('pngjs')

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

// ---- Logo al centro: el QR sigue leyéndose y degrada sin romper ----
const ENLACE = 'https://moboss.online/u/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function leer(dataUrl) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  return { png, texto: jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data }
}

// Compositor de prueba con pngjs: misma geometría que el del navegador
// (caja blanca centrada + logo) para verificar que el resultado se decodifica.
function componerPng({ qrUrl, caja }) {
  const png = PNG.sync.read(Buffer.from(qrUrl.split(',')[1], 'base64'))
  for (let y = caja.y; y < caja.y + caja.lado; y++) {
    for (let x = caja.x; x < caja.x + caja.lado; x++) {
      const interior = x >= caja.x + caja.relleno && x < caja.x + caja.lado - caja.relleno
        && y >= caja.y + caja.relleno && y < caja.y + caja.lado - caja.relleno
      const i = (y * png.width + x) * 4
      const v = interior ? 30 : 255 // logo oscuro dentro del recuadro blanco
      png.data[i] = png.data[i + 1] = png.data[i + 2] = v
      png.data[i + 3] = 255
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

test('con logo el QR se sigue decodificando al mismo texto a 3 tamaños', async () => {
  let llamadas = 0
  configurarLogoQr({ obtenerLogo: async () => 'data:image/png;base64,AAAA', componer: (datos) => { llamadas++; return componerPng(datos) } })
  try {
    for (const ancho of [200, 320, 480]) {
      const { png, texto } = leer(await qrDataUrl(ENLACE, { ancho, margen: 2 }))
      assert.equal(png.width, ancho)
      assert.equal(texto, ENLACE, `ancho ${ancho}`)
      // El centro realmente quedó tapado por el logo.
      const c = Math.floor(ancho / 2)
      assert.equal(png.data[(c * png.width + c) * 4], 30)
    }
    assert.equal(llamadas, 3)
  } finally {
    configurarLogoQr({})
  }
})

test('la caja del logo no pasa del 22 % del lado y queda centrada', () => {
  for (const ancho of [140, 220, 320, 480]) {
    const caja = cajaLogoQr(ancho)
    assert.ok(caja.lado / ancho <= 0.22)
    assert.ok(Math.abs(caja.x * 2 + caja.lado - ancho) <= 1)
    assert.ok(caja.interior > 0 && caja.interior < caja.lado)
  }
  assert.equal(QR_LOGO.proporcion, 0.2)
})

test('sin logo disponible, con falla o en tamaños chicos el QR sale liso y legible', async () => {
  assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 320 })).texto, ENLACE) // sin fuente registrada

  let llamadas = 0
  const componer = (d) => { llamadas++; return componerPng(d) }
  const casos = [
    ['fuente sin logo', async () => '', componer],
    ['fuente que falla', async () => { throw new Error('red') }, componer],
    ['compositor que falla', async () => 'data:image/png;base64,AAAA', () => { throw new Error('lienzo') }],
    ['compositor sin resultado', async () => 'data:image/png;base64,AAAA', async () => ''],
  ]
  for (const [nombre, obtenerLogo, comp] of casos) {
    configurarLogoQr({ obtenerLogo, componer: comp })
    assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 320 })).texto, ENLACE, nombre)
  }

  configurarLogoQr({ obtenerLogo: async () => 'data:image/png;base64,AAAA', componer })
  try {
    llamadas = 0
    assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 120 })).texto, ENLACE) // muy chico
    assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 320, mm: 20 })).texto, ENLACE) // etiqueta < 25 mm
    assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 320, logo: false })).texto, ENLACE)
    assert.equal(leer(await qrDataUrl('x'.repeat(300), { ancho: 480, nivel: 'L' })).texto, 'x'.repeat(300)) // denso
    assert.equal(llamadas, 0, 'ninguno de esos casos compone logo')
    assert.equal(leer(await qrDataUrl(ENLACE, { ancho: 320, mm: 26 })).texto, ENLACE)
    assert.equal(llamadas, 1)
  } finally {
    configurarLogoQr({})
  }
})
