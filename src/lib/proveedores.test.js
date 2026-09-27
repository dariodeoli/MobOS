import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_PROVEEDORES_RECIENTES,
  coincideExacto,
  etiquetaProveedor,
  filtrarProveedores,
  leerProveedoresRecientes,
  normalizarProveedor,
  olvidarProveedoresRecientes,
  ordenarConRecientes,
  recordarProveedorReciente,
  sugerenciasDeProveedores,
} from './proveedores.js'

// En Node no hay almacenamiento: el módulo cae a un stub para poder probar la
// persistencia del «último usado» con el mismo contrato que el navegador.
const almacen = new Map()
globalThis.localStorage = {
  getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
  setItem: (clave, valor) => { almacen.set(clave, String(valor)) },
  removeItem: (clave) => { almacen.delete(clave) },
}

const PROVEEDORES = [
  { id: 'p1', name: 'Importadora Tecnológica S.A.', code: 'IMPTEC' },
  { id: 'p2', name: 'Distribuidora del Este', code: 'DISTE' },
  { id: 'p3', name: 'Mayorista Apple Paraguay', code: null },
]

test('la normalización ignora acentos y mayúsculas', () => {
  assert.equal(normalizarProveedor('Importadora TECNOLÓGICA'), 'importadora tecnologica')
  assert.equal(normalizarProveedor('  Diste  '), 'diste')
  assert.equal(normalizarProveedor(null), '')
})

test('el filtro encuentra por nombre o por abreviatura, parcial y sin acentos', () => {
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'tecnologica').map((p) => p.id), ['p1'])
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'IMPTEC').map((p) => p.id), ['p1'])
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'imptec').map((p) => p.id), ['p1'])
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'diste').map((p) => p.id), ['p2'])
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'apple').map((p) => p.id), ['p3'])
  assert.deepEqual(filtrarProveedores(PROVEEDORES, '').length, 3)
  assert.deepEqual(filtrarProveedores(PROVEEDORES, 'no existe'), [])
})

test('la etiqueta muestra abreviatura y nombre', () => {
  assert.equal(etiquetaProveedor(PROVEEDORES[0]), 'IMPTEC · Importadora Tecnológica S.A.')
  assert.equal(etiquetaProveedor(PROVEEDORES[2]), 'Mayorista Apple Paraguay')
  assert.equal(etiquetaProveedor({ code: 'X' }), 'X')
  assert.equal(etiquetaProveedor(null), '')
})

test('los últimos usados van primero y el resto queda por nombre', () => {
  const orden = ordenarConRecientes(PROVEEDORES, ['p3', 'p1']).map((p) => p.id)
  assert.deepEqual(orden, ['p3', 'p1', 'p2'])
  assert.deepEqual(ordenarConRecientes(PROVEEDORES, []).map((p) => p.id), ['p2', 'p1', 'p3'])
})

test('las sugerencias acotan la lista y respetan el orden de recientes', () => {
  const sugerencias = sugerenciasDeProveedores(PROVEEDORES, ['p2'], 2)
  assert.deepEqual(sugerencias.map((p) => p.id), ['p2', 'p1'])
})

test('un texto que ya identifica a un proveedor no se ofrece como nuevo', () => {
  assert.equal(coincideExacto(PROVEEDORES, 'imptec')?.id, 'p1')
  assert.equal(coincideExacto(PROVEEDORES, 'Importadora Tecnológica S.A.')?.id, 'p1')
  assert.equal(coincideExacto(PROVEEDORES, 'Importadora Tecnológica'), null)
  assert.equal(coincideExacto(PROVEEDORES, 'nueva tienda'), null)
})

test('los recientes se recuerdan sin repetir y con tope', () => {
  almacen.clear()
  for (let indice = 1; indice <= 8; indice += 1) recordarProveedorReciente('empresa-test', `p${indice}`)
  const recientes = leerProveedoresRecientes('empresa-test')
  assert.equal(recientes.length, MAX_PROVEEDORES_RECIENTES)
  assert.deepEqual(recientes, ['p8', 'p7', 'p6', 'p5', 'p4', 'p3'])

  // Volver a usar uno lo sube al tope sin duplicarlo.
  assert.deepEqual(recordarProveedorReciente('empresa-test', 'p5'), ['p5', 'p8', 'p7', 'p6', 'p4', 'p3'])
  olvidarProveedoresRecientes('empresa-test')
  assert.deepEqual(leerProveedoresRecientes('empresa-test'), [])
})
