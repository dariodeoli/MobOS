import assert from 'node:assert/strict'
import test from 'node:test'
import { crearMemoriaImpresion, etiquetaTipoImpresion, TIPOS_DOCUMENTO } from './preferencias.js'

// Storage mínima en memoria: el núcleo es puro y no depende del navegador.
const storageFalso = () => {
  const datos = new Map()
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => { datos.set(clave, String(valor)) },
    _crudo: () => datos,
  }
}

test('recuerda la impresora por tipo de documento (#209)', () => {
  const memoria = crearMemoriaImpresion(storageFalso())
  assert.equal(memoria.impresoraDe('etiqueta'), '', 'sin memoria no hay impresora')
  memoria.recordarImpresora('etiqueta', { destino: 'lan:192.168.1.23:9100', ancho: 58 })
  memoria.recordarImpresora('comprobante', { destino: 'cups:MobOS_LAN', ancho: 80 })
  assert.equal(memoria.impresoraDe('etiqueta'), 'lan:192.168.1.23:9100')
  assert.equal(memoria.impresoraDe('comprobante'), 'cups:MobOS_LAN')
  assert.equal(memoria.impresoraDe('proforma'), '', 'cada tipo tiene su memoria')
  assert.equal(memoria.todas().etiqueta.ancho, 58, 'guarda el ancho para el formato')
})

test('recuerda el formato por tipo y se puede olvidar', () => {
  const memoria = crearMemoriaImpresion(storageFalso())
  memoria.recordarFormato('comprobante', 'thermal-80')
  assert.equal(memoria.formatoDe('comprobante'), 'thermal-80')
  memoria.recordarImpresora('comprobante', { destino: 'lan:10.0.0.9:9100' })
  assert.equal(memoria.formatoDe('comprobante'), 'thermal-80', 'cambiar la impresora no borra el formato')
  memoria.olvidar('comprobante')
  assert.equal(memoria.impresoraDe('comprobante'), '')
  assert.equal(memoria.formatoDe('comprobante'), '', 'olvidar limpia todo el tipo')
})

test('ignora valores vacíos y no rompe con almacenamiento corrupto', () => {
  const storage = storageFalso()
  const memoria = crearMemoriaImpresion(storage)
  memoria.recordarImpresora('', { destino: 'lan:1.1.1.1:9100' })
  memoria.recordarImpresora('etiqueta', {})
  assert.deepEqual(memoria.todas(), {}, 'sin tipo o sin destino no se guarda nada')
  storage.setItem('mobos:impresion:ultimo', 'no-es-json')
  assert.equal(memoria.impresoraDe('etiqueta'), '', 'un valor corrupto se ignora')
  memoria.recordarImpresora('etiqueta', { destino: 'lan:2.2.2.2:9100' })
  assert.equal(memoria.impresoraDe('etiqueta'), 'lan:2.2.2.2:9100', 'se recupera y vuelve a guardar')
})

test('la etiqueta del tipo es legible para la pantalla', () => {
  assert.equal(etiquetaTipoImpresion('nota-entrega'), 'Nota de entrega')
  assert.equal(etiquetaTipoImpresion('cierre-caja'), 'Cierre de caja')
  assert.equal(Object.keys(TIPOS_DOCUMENTO).includes('comprobante'), true)
  // Los tipos reales de etiquetas del taller/inventario se nombran solos en Formatos.
  assert.equal(etiquetaTipoImpresion('etiquetas-stock'), 'Etiquetas de unidades')
  assert.equal(etiquetaTipoImpresion('etiqueta-stock'), 'Etiqueta de unidad')
  assert.equal(etiquetaTipoImpresion('etiquetas-producto'), 'Etiquetas de góndola')
  assert.equal(etiquetaTipoImpresion('etiqueta-ubicacion'), 'Etiqueta de ubicación')
  assert.equal(etiquetaTipoImpresion(''), 'Impresión')
})
