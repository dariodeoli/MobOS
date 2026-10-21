// Compras de proveedores del modo demo (#324): semilla pura (sin storage) para
// que la usen la pantalla Compras, las cronologías y los tests. Los mismos
// proveedores ficticios que Inventario y Abastecimiento.
import { PROVEEDORES_DEMO, proveedorDemo } from './proveedores.js'

const proveedor = (id) => proveedorDemo(id) || PROVEEDORES_DEMO[0]
const haceDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
const enDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

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
const compra3 = [
  linea({ id: 'demo-line-3a', productId: 'demo-airpods-pro-2-usbc', productName: 'AirPods Pro 2 USB-C', quantity: 8, unitCostPyg: 1300000 }),
  linea({ id: 'demo-line-3b', productId: 'demo-iphone-14-pro-256-plata', productName: 'iPhone 14 Pro 256GB Plata', quantity: 2, unitCostPyg: 4000000 }),
]
const compra4 = [
  linea({ id: 'demo-line-4a', productId: 'demo-iphone-15-128-azul', productName: 'iPhone 15 128GB Azul', quantity: 4, unitCostPyg: 3900000 }),
  linea({ id: 'demo-line-4b', productId: 'demo-iphone-15-pro-256-negro', productName: 'iPhone 15 Pro 256GB Negro', quantity: 4, unitCostPyg: 5250000 }),
]
const compra5 = [linea({ id: 'demo-line-5', productId: 'demo-vidrio-17-pro', productName: 'Protector de vidrio 17 Pro', quantity: 100, unitCostPyg: 45000 })]
const costo3 = compra3.reduce((suma, item) => suma + item.finalTotalCostPyg, 0) + 150000
const costo4 = compra4.reduce((suma, item) => suma + item.finalTotalCostPyg, 0) + 150000
const costo5 = compra5.reduce((suma, item) => suma + item.finalTotalCostPyg, 0) + 40000

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
  // Compras a crédito y parcial: Compras → «Saldo por pagar», vencimientos y recepción parcial.
  {
    id: 'demo-purchase-3', supplierId: proveedor('demo-prov-mayorista').id, supplierName: proveedor('demo-prov-mayorista').name,
    status: 'RECEIVED', createdAt: haceDias(34), receivedAt: haceDias(31),
    currency: 'PYG', exchangeRatePyg: 1, shippingPyg: 150000, customsPyg: 0, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0,
    finalCostPyg: costo3, paidPyg: 6000000, outstandingPyg: costo3 - 6000000, creditEnabled: true, dueAt: haceDias(2),
    payments: [{ id: 'demo-pay-3a', amountPyg: 6000000, paidAt: haceDias(30), reference: 'Transferencia Itaú' }],
    branchId: 'mobos-demo-central', supplierReference: 'MAYAPY-2210', costAllocationMethod: 'PROPORTIONAL_VALUE',
    lines: compra3.map((item) => ({ ...item, receivedQty: item.quantity })),
  },
  {
    id: 'demo-purchase-4', supplierId: proveedor('demo-prov-importadora').id, supplierName: proveedor('demo-prov-importadora').name,
    status: 'PARTIAL', createdAt: haceDias(9), receivedAt: haceDias(5),
    currency: 'PYG', exchangeRatePyg: 1, shippingPyg: 90000, customsPyg: 60000, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0,
    finalCostPyg: costo4, paidPyg: 2000000, outstandingPyg: costo4 - 2000000, creditEnabled: true, dueAt: enDias(12),
    payments: [{ id: 'demo-pay-4a', amountPyg: 2000000, paidAt: haceDias(8), reference: 'Adelanto en efectivo' }],
    branchId: 'mobos-demo-central', supplierReference: 'IMPTEC-4502', costAllocationMethod: 'PROPORTIONAL_VALUE',
    lines: compra4.map((item, indice) => ({ ...item, receivedQty: indice === 0 ? item.quantity : Math.floor(item.quantity / 2) })),
  },
  {
    id: 'demo-purchase-5', supplierId: proveedor('demo-prov-distribuidora').id, supplierName: proveedor('demo-prov-distribuidora').name,
    status: 'RECEIVED', createdAt: haceDias(58), receivedAt: haceDias(55),
    currency: 'PYG', exchangeRatePyg: 1, shippingPyg: 40000, customsPyg: 0, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0,
    finalCostPyg: costo5, paidPyg: costo5, outstandingPyg: 0, creditEnabled: false, dueAt: null,
    payments: [{ id: 'demo-pay-5a', amountPyg: costo5, paidAt: haceDias(55), reference: 'Pago contra entrega' }],
    branchId: 'mobos-demo-central', supplierReference: 'DISESTE-1121', costAllocationMethod: 'PROPORTIONAL_VALUE',
    lines: compra5.map((item) => ({ ...item, receivedQty: item.quantity })),
  },
]
