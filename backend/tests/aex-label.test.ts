import assert from 'node:assert/strict'
import { AEX_LABEL_FORMATS, aexLabel, aexLabelFormatValido } from '../lib/aex'

// Los formatos válidos son los de la lista de la doc API v1.5.4.
for (const formato of AEX_LABEL_FORMATS) assert.equal(aexLabelFormatValido(formato), true)
assert.equal(aexLabelFormatValido('etiqueta9x9'), false)
assert.equal(aexLabelFormatValido(''), false)
assert.equal(aexLabelFormatValido(null), false)

const originalFetch = globalThis.fetch
const conCredenciales = () => {
  process.env.MOBOS_AEX_PUBLIC_KEY = 'clave-publica-test'
  process.env.MOBOS_AEX_PRIVATE_KEY = 'clave-privada-test'
  process.env.MOBOS_AEX_API_URL = 'https://sandbox.aex.test/api/v1'
}
const sinCredenciales = () => {
  delete process.env.MOBOS_AEX_PUBLIC_KEY
  delete process.env.MOBOS_AEX_PRIVATE_KEY
}
const autorizacion = () => new Response(JSON.stringify({ codigo: '0', codigo_autorizacion: 'token-de-prueba' }), { headers: { 'Content-Type': 'application/json' } })

async function main() {
  // Sin credenciales no se llama a AEX: la interfaz cae al enlace web.
  sinCredenciales()
  let llamadas = 0
  globalThis.fetch = async () => { llamadas += 1; throw new Error('no debe llamarse') }
  assert.deepEqual(await aexLabel('A123', 'etiqueta8x6'), { ok: false, motivo: 'unconfigured' })
  assert.equal(llamadas, 0)

  // Con credenciales: autoriza y pide el PDF en el formato elegido.
  conCredenciales()
  const cuerpos: string[] = []
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const destino = String(url)
    if (destino.endsWith('/autorizacion-acceso/generar')) return autorizacion()
    if (destino.endsWith('/envios/imprimir')) {
      cuerpos.push(String(init?.body || ''))
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { 'Content-Type': 'application/pdf' } })
    }
    throw new Error(`ruta inesperada: ${destino}`)
  }
  const ok = await aexLabel('A123', 'etiqueta65x45', true)
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.pdf.byteLength, 4)
  assert.equal(cuerpos.length, 1)
  const enviado = JSON.parse(cuerpos[0])
  assert.equal(enviado.guia, 'A123')
  assert.equal(enviado.formato, 'etiqueta65x45')
  assert.equal(enviado.imprimir_partida, true)

  // AEX responde JSON de error (guía inexistente): no se inventa el PDF.
  globalThis.fetch = async (url: string | URL | Request) => {
    const destino = String(url)
    if (destino.endsWith('/autorizacion-acceso/generar')) return autorizacion()
    return new Response(JSON.stringify({ codigo: '9', mensaje: 'Guía inexistente' }), { headers: { 'Content-Type': 'application/json' } })
  }
  assert.deepEqual(await aexLabel('A404', 'guia'), { ok: false, motivo: 'unavailable' })

  // Respuesta PDF vacía: tampoco.
  globalThis.fetch = async (url: string | URL | Request) => {
    const destino = String(url)
    if (destino.endsWith('/autorizacion-acceso/generar')) return autorizacion()
    return new Response(new Uint8Array([]), { headers: { 'Content-Type': 'application/pdf' } })
  }
  assert.deepEqual(await aexLabel('A123', 'guia_A4'), { ok: false, motivo: 'unavailable' })

  // Falla de red.
  globalThis.fetch = async () => { throw new Error('sin red') }
  assert.deepEqual(await aexLabel('A123', 'guia_A4'), { ok: false, motivo: 'unavailable' })

  globalThis.fetch = originalFetch
  sinCredenciales()
  delete process.env.MOBOS_AEX_API_URL
  console.log('aex-label: formatos, descarga y errores OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
