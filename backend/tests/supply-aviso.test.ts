import assert from 'node:assert/strict'
import { esCompradorDeLaVenta, textoAvisoVentaSinStock } from '../lib/supply-aviso'

// Quién recibe el aviso de venta sin stock: puede comprar y ve la sucursal.
const admin = { id: 'a', role: 'ADMIN', branchId: 'b1', permissions: null }
const gerente = { id: 'g', role: 'GERENTE', branchId: 'b1', permissions: null }
const gerenteGlobal = { id: 'gg', role: 'GERENTE', branchId: null, permissions: null }
const gerenteSinStock = { id: 'gs', role: 'GERENTE', branchId: null, permissions: ['orders:manage', 'cash:manage'] }
const vendedor = { id: 'v', role: 'VENDEDOR', branchId: 'b1', permissions: null }
assert.equal(esCompradorDeLaVenta(admin, 'b2'), true, 'el dueño ve todas las sucursales')
const compras = { id: 'c', role: 'COMPRAS', branchId: 'b1', permissions: null }
const comprasGlobal = { id: 'cg', role: 'COMPRAS', branchId: null, permissions: null }
const comprasRecortado = { id: 'cr', role: 'COMPRAS', branchId: null, permissions: ['products:read'] }
assert.equal(esCompradorDeLaVenta(compras, 'b1'), true)
assert.equal(esCompradorDeLaVenta(compras, 'b2'), false, 'compras de otra sucursal no')
assert.equal(esCompradorDeLaVenta(comprasGlobal, 'b2'), true, 'compras sin sucursal ve todas')
assert.equal(esCompradorDeLaVenta(compras, null), true, 'venta sin sucursal: avisa a todos los compradores')
assert.equal(esCompradorDeLaVenta(comprasRecortado, 'b1'), false, 'sin stock:manage no compra')
assert.equal(esCompradorDeLaVenta(gerenteGlobal, 'b1'), false, 'el gerente no abre Abastecimiento: no se le avisa')
assert.equal(esCompradorDeLaVenta(gerente, 'b1'), false)
assert.equal(esCompradorDeLaVenta(gerenteSinStock, 'b1'), false)
assert.equal(esCompradorDeLaVenta(vendedor, 'b1'), false, 'el vendedor no compra')

// Texto: producto, cantidad y fecha; nunca el cliente ni montos.
assert.equal(textoAvisoVentaSinStock([{ producto: 'iPhone 15 128 GB', cantidad: 1 }], null), 'Hay que comprar iPhone 15 128 GB.')
assert.equal(textoAvisoVentaSinStock([{ producto: 'Funda', cantidad: 3 }, { producto: 'Vidrio', cantidad: 1 }], null), 'Hay que comprar 3 × Funda y 1 más.')
assert.equal(textoAvisoVentaSinStock([{ producto: 'AirPods', cantidad: 1 }], new Date('2026-11-05T12:00:00-03:00')), 'Hay que comprar AirPods · prometido para el 05/11.')

// Resumen diario de compras (push de la mañana).
import { textoResumenCompras } from '../lib/web-push-eventos'
assert.equal(textoResumenCompras(1, 0), '1 venta sin stock por comprar.')
assert.equal(textoResumenCompras(4, 2), '4 ventas sin stock por comprar, 2 con la fecha prometida vencida.')
