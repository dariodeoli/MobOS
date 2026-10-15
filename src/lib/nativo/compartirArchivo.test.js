import test from 'node:test'
import assert from 'node:assert/strict'
import { compartirArchivoNativo } from './compartirArchivo.js'

const documento = { dataUrl: 'data:image/png;base64,aG9sYQ==', nombre: '../comprobante.png', titulo: 'Comprobante', texto: 'Adjunto' }
function fixture({ escribir, compartir, limpiar } = {}) {
  const eventos = []
  const plugins = {
    Directory: { Cache: 'CACHE' },
    Filesystem: {
      async writeFile(opciones) { eventos.push(['guardar', opciones]); if (escribir) throw escribir; return { uri: 'file:///private/cache/comprobante.png' } },
      async deleteFile(opciones) { eventos.push(['limpiar', opciones]); if (limpiar) throw limpiar },
    },
    Share: { async share(opciones) { eventos.push(['compartir', opciones]); if (compartir) throw compartir } },
  }
  return { eventos, opciones: { ios: true, cargarPlugins: async () => plugins } }
}

test('iOS comparte URI de caché privada y elimina el PNG solo después de cerrar la hoja', async () => {
  const { eventos, opciones } = fixture()
  assert.equal(await compartirArchivoNativo(documento, opciones), 'compartido')
  assert.deepEqual(eventos.map(([tipo]) => tipo), ['guardar', 'compartir', 'limpiar'])
  const archivo = eventos[0][1]
  assert.equal(archivo.data, 'aG9sYQ==')
  assert.equal(archivo.directory, 'CACHE')
  assert.ok(!archivo.path.includes('/'))
  assert.deepEqual(eventos[1][1], { files: ['file:///private/cache/comprobante.png'], title: 'Comprobante', text: 'Adjunto' })
  assert.deepEqual(eventos[2][1], { path: archivo.path, directory: 'CACHE' })
})

test('cancelar la hoja nativa conserva el resultado cancelado y elimina el temporal', async () => {
  const { eventos, opciones } = fixture({ compartir: new Error('Share canceled') })
  assert.equal(await compartirArchivoNativo(documento, opciones), 'cancelado')
  assert.equal(eventos.at(-1)[0], 'limpiar')
})

test('fallo al compartir o escribir limpia el temporal y permite mostrar un error honesto', async (t) => {
  t.mock.method(console, 'error', () => {})
  for (const fallo of ['compartir', 'escribir']) {
    const { eventos, opciones } = fixture({ [fallo]: new Error('fallo nativo') })
    assert.equal(await compartirArchivoNativo(documento, opciones), false)
    assert.equal(eventos.at(-1)[0], 'limpiar')
    if (fallo === 'escribir') assert.ok(!eventos.some(([tipo]) => tipo === 'compartir'))
  }
})

test('sin iOS o sin PNG no carga plugins ni escribe archivos', async () => {
  const cargarPlugins = () => { throw new Error('no debe cargar') }
  assert.equal(await compartirArchivoNativo(documento, { ios: false, cargarPlugins }), false)
  assert.equal(await compartirArchivoNativo({ dataUrl: 'https://ejemplo.test/imagen.png' }, { ios: true, cargarPlugins }), false)
})

test('compartidos consecutivos no reutilizan archivos; limpiar fallido no duplica el envío', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const { eventos, opciones } = fixture({ limpiar: new Error('fallo de limpieza') })
  assert.equal(await compartirArchivoNativo(documento, opciones), 'compartido')
  assert.equal(await compartirArchivoNativo(documento, opciones), 'compartido')
  const escritos = eventos.filter(([tipo]) => tipo === 'guardar')
  assert.notEqual(escritos[0][1].path, escritos[1][1].path)
  assert.equal(eventos.filter(([tipo]) => tipo === 'compartir').length, 2)
})
