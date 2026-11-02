import assert from 'node:assert/strict'
import { esCompradorDeLaVenta, textoAvisoVentaSinStock } from '../lib/supply-aviso'

// Quién recibe el aviso de venta sin stock: puede comprar y ve la sucursal.
const admin = { id: 'a', role: 'ADMIN', branchId: 'b1', permissions: null }
const gerente = { id: 'g', role: 'GERENTE', branchId: 'b1', permissions: null }
const gerenteGlobal = { id: 'gg', role: 'GERENTE', branchId: null, permissions: null }
const gerenteSinStock = { id: 'gs', role: 'GERENTE', branchId: null, permissions: ['orders:manage', 'cash:manage'] }
const vendedor = { id: 'v', role: 'VENDEDOR', branchId: 'b1', permissions: null }
assert.equal(esCompradorDeLaVenta(admin, 'b2'), true, 'el dueño ve todas las sucursales')
assert.equal(esCompradorDeLaVenta(gerente, 'b1'), true)
assert.equal(esCompradorDeLaVenta(gerente, 'b2'), false, 'gerente de otra sucursal no')
assert.equal(esCompradorDeLaVenta(gerenteGlobal, 'b2'), true, 'gerente sin sucursal ve todas')
assert.equal(esCompradorDeLaVenta(gerente, null), true, 'venta sin sucursal: avisa a todos los compradores')
assert.equal(esCompradorDeLaVenta(gerenteSinStock, 'b1'), false, 'sin stock:manage no compra')
assert.equal(esCompradorDeLaVenta(vendedor, 'b1'), false, 'el vendedor no compra')

// Texto: producto, cantidad y fecha; nunca el cliente ni montos.
assert.equal(textoAvisoVentaSinStock([{ producto: 'iPhone 15 128 GB', cantidad: 1 }], null), 'Hay que comprar iPhone 15 128 GB.')
assert.equal(textoAvisoVentaSinStock([{ producto: 'Funda', cantidad: 3 }, { producto: 'Vidrio', cantidad: 1 }], null), 'Hay que comprar 3 × Funda y 1 más.')
assert.equal(textoAvisoVentaSinStock([{ producto: 'AirPods', cantidad: 1 }], new Date('2026-11-05T12:00:00-03:00')), 'Hay que comprar AirPods · prometido para el 05/11.')
