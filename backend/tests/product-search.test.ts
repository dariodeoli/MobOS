import assert from 'node:assert/strict'
import { clasificarCoincidencia, normalizarBusqueda, ordenarResultados, resumirDisponibilidad } from '../lib/product-search'

// ── Códigos del escáner ────────────────────────────────────────────────────
assert.equal(normalizarBusqueda('MOBOS:3567-8910 2345'), '356789102345')
assert.equal(normalizarBusqueda(' mobos:abc-123 '), 'ABC123')
assert.equal(normalizarBusqueda('ZZ-SYNC-1'), 'ZZSYNC1')
assert.equal(normalizarBusqueda(null), '')

// ── Coincidencia ───────────────────────────────────────────────────────────
const producto = { sku: 'IPHONE-15-256', name: 'iPhone 15 Pro Max Titanio', model: 'iPhone 15 Pro Max', capacity: '256 GB', color: 'Titanio' }
assert.equal(clasificarCoincidencia(producto, 'iphone15256'), 'sku')
assert.equal(clasificarCoincidencia(producto, 'iPhone 15 Pro Max Titanio'), 'nombre')
assert.equal(clasificarCoincidencia(producto, '15 Pro Max'), 'modelo')
assert.equal(clasificarCoincidencia(producto, '256 GB'), 'capacidad')
assert.equal(clasificarCoincidencia(producto, 'Titanio'), 'texto')
assert.equal(clasificarCoincidencia(producto, 'IPHONE-15-256', true), 'serial')
assert.equal(clasificarCoincidencia({ name: 'Cable USB' }, 'funda'), 'texto')

// ── Disponibilidad por sucursal ────────────────────────────────────────────
const nombres = new Map([['s1', 'Centro'], ['s2', 'Shopping']])
// Modelo con IMEI: manda el conteo real de unidades.
assert.deepEqual(
  resumirDisponibilidad({ branchId: 's1', productBranchId: 's1', stockContador: 99, unidades: [{ branchId: 's1', available: 2 }], nombresSucursal: nombres }),
  { stock: 2, disponible: true, agotado: false, disponibleEn: [{ branchId: 's1', branchName: 'Centro', available: 2 }] },
)
assert.deepEqual(
  resumirDisponibilidad({ branchId: 's1', productBranchId: 's1', stockContador: 0, unidades: [{ branchId: 's2', available: 1 }], nombresSucursal: nombres }),
  { stock: 0, disponible: false, agotado: true, disponibleEn: [{ branchId: 's2', branchName: 'Shopping', available: 1 }] },
)
assert.deepEqual(resumirDisponibilidad({ branchId: 's1', productBranchId: 's1', stockContador: 0, unidades: [] }).disponibleEn, [])
// Producto sin unidades: vale el contador en su sucursal (o general).
assert.deepEqual(resumirDisponibilidad({ branchId: 's1', productBranchId: 's1', stockContador: 5, unidades: [] }), { stock: 5, disponible: true, agotado: false, disponibleEn: [{ branchId: 's1', branchName: null, available: 5 }] })
assert.equal(resumirDisponibilidad({ branchId: 's1', productBranchId: 's2', stockContador: 5, unidades: [] }).stock, 0)
assert.equal(resumirDisponibilidad({ branchId: 's1', productBranchId: 's2', stockContador: 5, unidades: [] }).disponibleEn[0].branchId, 's2')
assert.equal(resumirDisponibilidad({ branchId: 's1', productBranchId: null, stockContador: 5, unidades: [] }).stock, 5)

// ── Orden: el código primero, después el texto ─────────────────────────────
assert.deepEqual(
  ordenarResultados([
    { name: 'Zeta', coincidencia: 'texto' as const },
    { name: 'Alfa', coincidencia: 'modelo' as const },
    { name: 'Serial', coincidencia: 'serial' as const },
    { name: 'Sku', coincidencia: 'sku' as const },
  ]).map(fila => fila.name),
  ['Serial', 'Sku', 'Alfa', 'Zeta'],
)

console.log('product-search.test.ts: ok')
