// #222: guardia del barrido de "demo" en los datos visibles del modo demo.
import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { EQUIPO_DEMO, IMEIS_DEMO_FICTICIOS, IPHONES_DEMO } = await import('./demo/iphones.js')
const { EMPRESA_DEMO, SUCURSALES_DEMO } = await import('./demo/empresa.js')
const { SEED_DEMO_CLIENTES } = await import('./demoClientes.js')
const { demoInventorySeed } = await import('./demoInventory.js')
const { getDemoTenant } = await import('./demoTenant.js')

const CLAVES_INTERNAS = /(^id$|Id$|_id$|^key$|slug$|token$|url$|import|storage)/i
function visibles(valor, salida = []) {
  if (typeof valor === 'string') { salida.push(valor); return salida }
  if (Array.isArray(valor)) { for (const item of valor) visibles(item, salida); return salida }
  if (valor && typeof valor === 'object') {
    for (const [clave, item] of Object.entries(valor)) if (!CLAVES_INTERNAS.test(clave)) visibles(item, salida)
  }
  return salida
}
// Palabra completa: evita falsos positivos como "responDEMOS" o "demostración".
const sucios = valor => visibles(valor).filter(texto => /\bdemo\b/i.test(texto))

test('equipo, catálogo, empresa y sucursales demo no dicen "demo"', () => {
  assert.deepEqual(sucios(EQUIPO_DEMO), [], 'equipo')
  assert.deepEqual(sucios(IPHONES_DEMO), [], 'catálogo')
  assert.deepEqual(sucios(EMPRESA_DEMO), [], 'empresa')
  assert.deepEqual(sucios(SUCURSALES_DEMO), [], 'sucursales')
  assert.ok(IMEIS_DEMO_FICTICIOS.every(serial => serial.startsWith('AUR')), 'seriales ficticios AUR')
})

test('clientes, inventario y ajustes demo no dicen "demo"', () => {
  assert.deepEqual(sucios(SEED_DEMO_CLIENTES), [], 'clientes')
  const inventario = demoInventorySeed()
  assert.deepEqual(sucios({ locations: inventario.locations, suppliers: inventario.suppliers, units: inventario.units.map(u => ({ serial: u.serial, notes: u.notes, supplierName: u.supplierName, product: u.product?.name })) }), [], 'inventario')
  assert.equal(getDemoTenant().orderPrefix, 'AUR', 'prefijo de pedidos ficticio realista')
})
