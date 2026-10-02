// Compras de proveedores del modo demo (#324): semilla pura (sin storage) para
// que la usen la pantalla Compras, las cronologías y los tests. Los mismos
// proveedores ficticios que Inventario y Abastecimiento.
import { PROVEEDORES_DEMO, proveedorDemo } from './proveedores.js'

const proveedor = (id) => proveedorDemo(id) || PROVEEDORES_DEMO[0]
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()

const linea = ({ id, productId, productName, quantity, unitCostPyg }) => ({
  id,
  productId,
  productName,
  quantity,
  unitCostPyg,
  baseTotalPyg: quantity * unitCostPyg,
  finalUnitCostPyg: unitCostPyg,
  finalTotalCostPyg: quantity * unitCostPyg,
})

const compra1 = [
  linea({ id: 'demo-line-1', productId: 'demo-funda-magsafe-transparente', productName: 'Funda MagSafe Transparente', quantity: 24, unitCostPyg: 70000 }),
  linea({ id: 'demo-line-1b', productId: 'demo-cargador-usbc-20w', productName: 'Cargador USB-C 20W', quantity: 10, unitCostPyg: 120000 }),
]
const compra2 = [linea({ id: 'demo-line-2', productId: 'demo-funda-silicona-negra', productName: 'Funda Silicona Negra', quantity: 50, unitCostPyg: 55000 })]
const costo1 = compra1.reduce((suma, item) => suma + item.finalTotalCostPyg, 0) + 85000 + 120000
const costo2 = compra2.reduce((suma, item) => suma + item.finalTotalCostPyg, 0) + 60000

export const DEMO_PURCHASES = [
  {
    id: 'demo-purchase-1', supplierId: proveedor('demo-prov-importadora').id, supplierName: proveedor('demo-prov-importadora').name,
    status: 'RECEIVED', createdAt: haceDias(12), receivedAt: haceDias(10),
    currency: 'PYG', exchangeRatePyg: 1, shippingPyg: 85000, customsPyg: 120000, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0,
    finalCostPyg: costo1, paidPyg: costo1, outstandingPyg: 0, creditEnabled: false, dueAt: null, payments: [],
    branchId: 'mobos-demo-central', supplierReference: 'IMPTEC-4471', costAllocationMethod: 'PROPORTIONAL_VALUE',
    lines: compra1.map((item) => ({ ...item, receivedQty: item.quantity })),
  },
  {
    id: 'demo-purchase-2', supplierId: proveedor('demo-prov-distribuidora').id, supplierName: proveedor('demo-prov-distribuidora').name,
    status: 'DRAFT', createdAt: haceDias(4), receivedAt: null,
    currency: 'PYG', exchangeRatePyg: 1, shippingPyg: 60000, customsPyg: 0, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0,
    finalCostPyg: costo2, paidPyg: 0, outstandingPyg: 0, creditEnabled: false, dueAt: null, payments: [],
    branchId: 'mobos-demo-central', supplierReference: 'DISESTE-1180', costAllocationMethod: 'PROPORTIONAL_VALUE',
    lines: compra2.map((item) => ({ ...item, receivedQty: 0 })),
  },
]
