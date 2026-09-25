import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  anchoImagen,
  compartirArchivo,
  copiarImagen,
  documentoAPng,
  nombreImagenDocumento,
  puedeCompartirArchivo,
} from './compartirDocumento.js'

test('el nombre del PNG sale seguro y con la referencia recortada', () => {
  assert.equal(nombreImagenDocumento('certificado-phonecheck', 'AUR0001'), 'certificado-phonecheck-AUR0001.png')
  assert.equal(nombreImagenDocumento('Etiquetas de Unidad', '3 equipos / D1'), 'etiquetas-de-unidad-3-equipos-D1.png')
  assert.equal(nombreImagenDocumento(''), 'documento.png')
  assert.equal(nombreImagenDocumento('certificado', ''), 'certificado.png')
  assert.equal(nombreImagenDocumento('etiquetas', 'x'.repeat(120)).length < 70, true)
})

test('anchoImagen mapea los formatos de papel y cae a A4', () => {
  assert.equal(anchoImagen('thermal-80'), 302)
  assert.equal(anchoImagen('thermal-58'), 219)
  assert.equal(anchoImagen('a4'), 794)
  assert.equal(anchoImagen('otro'), 794)
  assert.equal(anchoImagen(), 794)
})

test('puedeCompartirArchivo depende de canShare y no rompe si falla', () => {
  assert.equal(puedeCompartirArchivo({}, {}), false)
  assert.equal(puedeCompartirArchivo({ navigator: { share() {} } }, {}), false)
  assert.equal(puedeCompartirArchivo({ navigator: { share() {}, canShare: () => true } }, {}), true)
  assert.equal(puedeCompartirArchivo({ navigator: { share() {}, canShare: () => false } }, {}), false)
  assert.equal(puedeCompartirArchivo({ navigator: { share() {}, canShare: () => { throw new Error('no') } } }, {}), false)
})

test('compartirArchivo distingue compartido, cancelado y fallo', async () => {
  const archivo = { name: 'a.png' }
  assert.equal(await compartirArchivo({}, { archivo }), false)

  const visto = []
  const entorno = { navigator: { canShare: () => true, share: async (datos) => { visto.push(datos) } } }
  assert.equal(await compartirArchivo(entorno, { archivo, titulo: 'Certificado', texto: 'Adjunto' }), 'compartido')
  assert.equal(visto[0].files[0], archivo)
  assert.equal(visto[0].title, 'Certificado')

  const cancelado = { navigator: { canShare: () => true, share: async () => { const error = new Error('cerró'); error.name = 'AbortError'; throw error } } }
  assert.equal(await compartirArchivo(cancelado, { archivo }), 'cancelado')

  const roto = { navigator: { canShare: () => true, share: async () => { throw new Error('sin red') } } }
  assert.equal(await compartirArchivo(roto, { archivo }), false)

  const bloqueado = { navigator: { canShare: () => false, share: async () => { visto.push('no') } } }
  assert.equal(await compartirArchivo(bloqueado, { archivo }), false)
  assert.equal(visto.length, 1)
})

test('copiarImagen escribe el ClipboardItem y no rompe sin soporte', async () => {
  assert.equal(await copiarImagen({ size: 10, type: 'image/png' }, {}), false)
  assert.equal(await copiarImagen(null, { navigator: { clipboard: { write: async () => {} } }, ClipboardItem: class {} }), false)

  const escritos = []
  const entorno = {
    navigator: { clipboard: { write: async (items) => { escritos.push(items) } } },
    ClipboardItem: class { constructor(datos) { this.datos = datos } },
  }
  assert.equal(await copiarImagen({ size: 10, type: 'image/png' }, entorno), true)
  assert.equal(escritos[0][0].datos['image/png'].size, 10)

  const roto = { navigator: { clipboard: { write: async () => { throw new Error('permiso') } } }, ClipboardItem: class { constructor() {} } }
  assert.equal(await copiarImagen({ size: 10, type: 'image/png' }, roto), false)
})

// Entorno mínimo con un iframe falso: valida el cableado (marco oculto, espera
// de recursos, tamaño del cuerpo y blob final) sin abrir un navegador.
function entornoDeMarco() {
  const cuerpo = { scrollWidth: 302, scrollHeight: 900, images: [], fonts: { ready: Promise.resolve() } }
  const marcoDoc = {
    body: cuerpo,
    images: [],
    fonts: cuerpo.fonts,
    defaultView: { requestAnimationFrame: (callback) => callback() },
    open() {},
    write() {},
    close() {},
  }
  const marco = {
    style: {},
    removido: false,
    setAttribute() {},
    contentDocument: marcoDoc,
    remove() { marco.removido = true },
  }
  return {
    document: { createElement: () => marco, body: { appendChild() {} } },
    fetch: async () => ({ blob: async () => ({ size: 12, type: 'image/png' }) }),
    marco,
    cuerpo,
  }
}

test('documentoAPng renderiza el cuerpo del marco y devuelve dataUrl + blob', async () => {
  const entorno = entornoDeMarco()
  const llamadas = []
  const resultado = await documentoAPng('<html><body>x</body></html>', {
    ancho: 'thermal-80',
    entorno,
    renderizar: async (nodo, opciones) => { llamadas.push({ nodo, opciones }); return 'data:image/png;base64,AAA' },
  })
  assert.equal(resultado.dataUrl, 'data:image/png;base64,AAA')
  assert.equal(resultado.blob.size, 12)
  assert.equal(llamadas[0].nodo, entorno.cuerpo)
  assert.equal(llamadas[0].opciones.width, 302)
  assert.equal(llamadas[0].opciones.height, 900)
  assert.equal(llamadas[0].opciones.pixelRatio, 2)
  assert.equal(entorno.marco.removido, true)
})

test('documentoAPng devuelve null sin HTML, sin documento o si el render falla', async () => {
  const entorno = entornoDeMarco()
  assert.equal(await documentoAPng('', { entorno }), null)
  assert.equal(await documentoAPng('<html></html>', { entorno: {}, renderizar: async () => 'x' }), null)
  assert.equal(await documentoAPng('<html></html>', { entorno, renderizar: async () => { throw new Error('boom') } }), null)
  assert.equal(await documentoAPng('<html></html>', { entorno, renderizar: async () => '' }), null)
  assert.equal(entorno.marco.removido, true)
})
