import assert from 'node:assert/strict'
import test from 'node:test'
import { ERROR_SELECCION_VACIA, EtiquetasStockError, etiquetasDeFilasStock, htmlVistaPreviaEtiquetas, itemsEtiquetasStock, vistaPreviaEtiquetasPdf } from './etiquetasStock.js'

const BASE = 'https://app.moboss.online'
const unidad = (serial) => ({ serial, costPyg: 4321987, condition: 'NEW', product: { name: 'iPhone 15', model: 'iPhone 15', costPyg: 4321987 } })
const accesorio = { sku: 'FUNDA-01', name: 'Funda silicona', pricePyg: 85000, costPyg: 4321987, cost: 4321987, qty: 40, copies: 3 }
const textoDe = (trabajos) => trabajos.map((t) => t.ticket.lineas().join('\n')).join('\n')
const barras = (trabajos) => trabajos.flatMap((t) => t.ticket.lineas()).filter((l) => l.includes('[BARRA]')).length

test('N unidades seleccionadas dan exactamente N etiquetas de unidad', () => {
  const { trabajos, total } = etiquetasDeFilasStock([unidad('351111111111111'), unidad('352222222222222'), unidad('353333333333333')], { base: BASE })
  assert.equal(total, 3)
  assert.equal(trabajos.length, 1)
  assert.equal(trabajos[0].tipo, 'unidad')
  assert.equal(trabajos[0].etiquetas, 3)
  assert.equal(trabajos[0].ticket.lineas().filter((l) => l.includes('ETIQUETA DE UNIDAD')).length, 3)
})

test('accesorio con copies=k imprime k etiquetas SKU + precio en guaraníes completos', () => {
  const { trabajos, total } = etiquetasDeFilasStock([accesorio])
  assert.equal(total, 3)
  assert.equal(trabajos[0].tipo, 'producto')
  const texto = textoDe(trabajos)
  assert.equal(texto.split('ETIQUETA DE PRODUCTO').length - 1, 3)
  assert.ok(texto.includes('Gs 85.000'))
  assert.ok(texto.includes('FUNDA-01'))
  assert.equal(barras(trabajos), 3)
})

test('selección mixta: un trabajo de unidades y otro de accesorios', () => {
  const { trabajos, total } = etiquetasDeFilasStock([unidad('351111111111111'), { ...accesorio, copies: 2 }, unidad('352222222222222')], { base: BASE })
  assert.equal(total, 4)
  assert.deepEqual(trabajos.map((t) => [t.tipo, t.etiquetas]), [['unidad', 2], ['producto', 2]])
})

test('copies ausente o inválido cuenta como 1 y se limita a 99', () => {
  assert.equal(etiquetasDeFilasStock([{ ...accesorio, copies: undefined }]).total, 1)
  assert.equal(etiquetasDeFilasStock([{ ...accesorio, copies: 500 }]).total, 99)
})

test('selección vacía no genera trabajo y lanza un error claro', () => {
  for (const vacia of [[], null, undefined, [null, {}]]) {
    assert.throws(() => etiquetasDeFilasStock(vacia), (error) => error instanceof EtiquetasStockError && error.message === ERROR_SELECCION_VACIA)
  }
})

test('nunca aparece el costo en la etiqueta, ni en ESC/POS ni en la vista previa', () => {
  const filas = [unidad('351111111111111'), accesorio]
  const { trabajos, items } = etiquetasDeFilasStock(filas, { base: BASE })
  const html = htmlVistaPreviaEtiquetas(items)
  for (const salida of [textoDe(trabajos), html, JSON.stringify(items)]) {
    assert.ok(!salida.includes('4321987') && !salida.includes('4.321.987'), 'sin costo')
    assert.ok(!/costPyg|cost\b|costo/i.test(salida), 'sin campo de costo')
  }
})

test('vista previa y ESC/POS comparten los mismos items', async () => {
  const filas = [unidad('351111111111111'), accesorio]
  const seleccion = itemsEtiquetasStock(filas, { base: BASE })
  const { trabajos } = etiquetasDeFilasStock(filas, { base: BASE })
  let htmlRecibido = ''
  const { pdf, total } = await vistaPreviaEtiquetasPdf(filas, { base: BASE, generarPdf: async (html) => { htmlRecibido = html; return 'PDF' } })
  assert.equal(pdf, 'PDF')
  assert.equal(total, seleccion.total)
  assert.equal(htmlRecibido.split('class="etiqueta"').length - 1, trabajos.reduce((s, t) => s + t.etiquetas, 0))
  assert.ok(htmlRecibido.includes('351111111111111') && htmlRecibido.includes('FUNDA-01') && htmlRecibido.includes('Gs 85.000'))
  assert.ok(textoDe(trabajos).includes('351111111111111'))
})

test('la vista previa vacía también falla con el error claro', async () => {
  await assert.rejects(vistaPreviaEtiquetasPdf([]), EtiquetasStockError)
})

test('#400: la etiqueta de unidad imprime la sigla del proveedor y jamás su nombre', () => {
  const fila = { ...unidad('354444444444444'), supplierName: 'Mayorista Secreto Norte', supplier: { id: 's1', name: 'Mayorista Secreto Norte', code: 'MSN' } }
  const { trabajos } = etiquetasDeFilasStock([fila], { base: BASE })
  const texto = textoDe(trabajos)
  assert.match(texto, /MSN/)
  assert.doesNotMatch(texto, /Mayorista|Secreto/)
  // Fila del listado unificado: llega la sigla en supplierCode, no el nombre.
  const deListado = { ...unidad('355555555555555'), supplierName: 'Mayorista Secreto Norte', supplierCode: 'S/S' }
  const impreso = textoDe(etiquetasDeFilasStock([deListado], { base: BASE }).trabajos)
  assert.match(impreso, /S\/S/)
  assert.doesNotMatch(impreso, /Mayorista|Secreto/)
})
