import assert from 'node:assert/strict'
import test from 'node:test'
import { descargarArchivo, descargarCsvCliente } from './descargarArchivo.js'

function entornoFalso() {
  const eventos = { urls: [], revocadas: [], clicks: 0 }
  class BlobFalso {
    constructor(partes, opciones = {}) {
      this.partes = partes
      this.type = opciones.type
    }
  }
  const doc = {
    createElement: () => ({
      href: '', download: '', click() { eventos.clicks += 1 }, remove() { eventos.removido = true },
    }),
    body: { appendChild: () => { eventos.agregado = true } },
  }
  const URL = {
    createObjectURL: (blob) => { eventos.urls.push(blob); return `blob:${eventos.urls.length}` },
    revokeObjectURL: (url) => eventos.revocadas.push(url),
  }
  return { entorno: { document: doc, URL, Blob: BlobFalso, setTimeout: (fn) => fn() }, eventos }
}

test('descarga un texto con tipo y BOM opcional', () => {
  const { entorno, eventos } = entornoFalso()
  assert.equal(descargarArchivo('datos.csv', 'a,b\n1,2', { tipo: 'text/csv;charset=utf-8', bom: true, entorno }), true)
  const blob = eventos.urls[0]
  assert.deepEqual(blob.partes, ['\ufeff', 'a,b\n1,2'])
  assert.equal(blob.type, 'text/csv;charset=utf-8')
  assert.deepEqual(eventos.revocadas, ['blob:1'])
  assert.equal(eventos.clicks, 1)
})

test('descargarCsvCliente usa el tipo CSV con BOM', () => {
  const { entorno, eventos } = entornoFalso()
  assert.equal(descargarCsvCliente('x.csv', 'hola', entorno), true)
  assert.equal(eventos.urls[0].type, 'text/csv;charset=utf-8')
  assert.deepEqual(eventos.urls[0].partes, ['\ufeff', 'hola'])
})

test('un Blob se descarga tal cual, sin envolver', () => {
  const { entorno, eventos } = entornoFalso()
  const blob = new entorno.Blob(['pdf'], { type: 'application/pdf' })
  assert.equal(descargarArchivo('comprobante.pdf', blob, { entorno }), true)
  assert.equal(eventos.urls[0], blob)
})

test('sin entorno de navegador devuelve false y no lanza', () => {
  assert.equal(descargarArchivo('x.csv', 'a', {}), false)
  assert.equal(descargarCsvCliente('x.csv', 'a', {}), false)
})
