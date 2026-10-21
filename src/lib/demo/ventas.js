// Ventas/pedidos canónicos del modo demo (#324): UNA sola fuente de verdad.
// De acá salen las ventas del POS (forma legacy de `storage.js`), los pedidos de
// la ficha/portal del cliente y los datos del comprobante (empresa, cliente,
// vendedor, sucursal, líneas y pagos). Antes cada módulo tenía su propia copia y
// se contradecían: el POS mostraba pedidos sin artículos y transacciones en Gs 0.
//
// Sin estado ni almacenamiento: solo datos y funciones puras, testeables en node.
import { EMPRESA_DEMO, SUCURSALES_DEMO } from './empresa.js'
import { EQUIPO_DEMO, IMEIS_DEMO_FICTICIOS } from './iphones.js'
import { CATALOGO_VENTA } from './catalogoPro.js'
import { generarVentasHistorial } from './ventasHistorial.js'
import { diaDemo, instanteDemo } from './reloj.js'

// ── Catálogo de líneas demo (descripción, modelo y categoría visibles) ──
const ARTICULOS = {
  'demo-iphone-15-pro-256-titanio': { descripcion: 'iPhone 15 Pro 256GB Titanio', modelo: 'iPhone 15 Pro', categoria: 'Celulares' },
  'demo-iphone-15-pro-256-negro': { descripcion: 'iPhone 15 Pro 256GB Negro', modelo: 'iPhone 15 Pro', categoria: 'Celulares' },
  'demo-iphone-15-128-azul': { descripcion: 'iPhone 15 128GB Azul', modelo: 'iPhone 15', categoria: 'Celulares' },
  'demo-iphone-14-pro-256-plata': { descripcion: 'iPhone 14 Pro 256GB Plata', modelo: 'iPhone 14 Pro', categoria: 'Celulares' },
  'demo-iphone-15-pro-max-256-titanio': { descripcion: 'iPhone 15 Pro Max 256GB Titanio Natural', modelo: 'iPhone 15 Pro Max', categoria: 'Celulares' },
  'demo-iphone-14-256-azul': { descripcion: 'iPhone 14 256GB Azul', modelo: 'iPhone 14', categoria: 'Celulares' },
  'demo-iphone-13-pro-max-256-grafito': { descripcion: 'iPhone 13 Pro Max 256GB Grafito', modelo: 'iPhone 13 Pro Max', categoria: 'Celulares' },
  'demo-iphone-15-256-rosa': { descripcion: 'iPhone 15 256GB Rosa', modelo: 'iPhone 15', categoria: 'Celulares' },
  'demo-iphone-14-128-medianoche': { descripcion: 'iPhone 14 128GB Medianoche', modelo: 'iPhone 14', categoria: 'Celulares' },
  'demo-iphone-13-128-blanco': { descripcion: 'iPhone 13 128GB Blanco', modelo: 'iPhone 13', categoria: 'Celulares' },
  'demo-iphone-12-128-verde': { descripcion: 'iPhone 12 128GB Verde', modelo: 'iPhone 12', categoria: 'Celulares' },
  'demo-airpods-pro-2-usbc': { descripcion: 'AirPods Pro 2 USB-C', modelo: 'AirPods Pro 2', categoria: 'Audio' },
  'demo-cargador-usbc-20w': { descripcion: 'Cargador USB-C 20W', modelo: 'Cargador USB-C', categoria: 'Accesorios' },
  'demo-funda-magsafe-transparente': { descripcion: 'Funda MagSafe Transparente', modelo: 'Funda MagSafe', categoria: 'Accesorios' },
}

// Medio legacy de las ventas demo → código/etiqueta del CRM.
const MEDIO_CRM = {
  DINERO: { code: 'CASH', label: 'Efectivo' },
  'DINERO USD': { code: 'CASH', label: 'Efectivo' },
  'UENO BANK': { code: 'TRANSFER', label: 'Transferencia' },
  TRANSFERENCIA: { code: 'TRANSFER', label: 'Transferencia' },
  'POS UENO': { code: 'CARD', label: 'Tarjeta / POS' },
  TARJETA: { code: 'CARD', label: 'Tarjeta / POS' },
  PIX: { code: 'PIX', label: 'Pix' },
  QR: { code: 'QR', label: 'QR' },
  'GIFT CARD': { code: 'GIFT_CARD', label: 'Gift card' },
  CRÉDITO: { code: 'CREDIT', label: 'Crédito' },
  'USDT - CRIPTO': { code: 'CRYPTO', label: 'USDT - Cripto' },
  CANJE: { code: 'TRADE_IN', label: 'Canje' },
  'SALDO A FAVOR': { code: 'STORE_CREDIT', label: 'Saldo a favor' },
}


const linea = (productoId, cantidad, precioUnitario, seriales = []) => {
  const articulo = ARTICULOS[productoId] || CATALOGO_VENTA[productoId] || { descripcion: productoId, modelo: '', categoria: '' }
  return { productoId, ...articulo, cantidad, precioUnitario, totalPyg: cantidad * precioUnitario, seriales }
}
/** Días de garantía de la demo por categoría (el comprobante imprime los días de cada línea). */
export const garantiaDiasDemo = (categoria = '', estado = 'Nuevo') => {
  if (categoria === 'Celulares') return /nuevo|sellado/i.test(estado) ? 365 : 90
  if (categoria === 'Audio') return 180
  if (categoria === 'Accesorios' || categoria === 'Protectores') return 30
  return 0
}
const pago = (id, medioPago, cuenta, monto, hora) => ({ id, medioPago, cuenta, monto, hora })

// ── Semillas canónicas (ids estables para no duplicar al re-sembrar) ──
// `diasAtras` 0 = hoy. `entrega`: RETIRO | DELIVERY. `fulfillment` es el estado
// visible en el pedido/comprobante; los pagos definen Pagado/Parcial/Pendiente.
const VENTAS_MANUALES = [
  {
    id: 'demo-venta-hoy-full', numero: 'AUR-0001', diasAtras: 0, hora: 10, minuto: 15,
    clienteId: 'demo-cliente-maria', cliente: 'María González', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-15-pro-256-titanio', 1, 6850000)],
    pagos: [pago('demo-pago-hoy-full', 'DINERO', '', 6850000, '10:15')],
    observacion: 'Venta de mostrador',
  },
  {
    id: 'demo-venta-hoy-partial', numero: 'AUR-0002', diasAtras: 0, hora: 11, minuto: 20,
    clienteId: 'demo-cliente-carlos-benitez', cliente: 'Carlos Benítez', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-funda-magsafe-transparente', 1, 180000)],
    pagos: [pago('demo-pago-hoy-partial-a', 'DINERO', '', 50000, '11:20'), pago('demo-pago-hoy-partial-b', 'UENO BANK', 'Caja · Guaraníes', 30000, '11:21')],
    observacion: 'Seña en dos medios',
  },
  {
    id: 'demo-venta-ayer-pending', numero: 'AUR-0003', diasAtras: 1, hora: 16, minuto: 40,
    clienteId: 'demo-cliente-lucia-franco', cliente: 'Lucía Franco', vendedorId: 'demo-user-vendedor',
    entrega: 'DELIVERY', fulfillment: 'IN_TRANSIT', montoDelivery: 30000,
    items: [linea('demo-airpods-pro-2-usbc', 1, 1850000)],
    pagos: [],
    observacion: 'Pendiente de cobro',
  },
  {
    id: 'demo-venta-extra-1', numero: 'AUR-0004', diasAtras: 0, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-maria', cliente: 'María González', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-15-pro-max-256-titanio', 1, 7250000)],
    pagos: [pago('demo-pago-extra-0-0', 'DINERO', '', 3000000, '10:30'), pago('demo-pago-extra-0-1', 'SALDO A FAVOR', 'Saldo a favor', 1000000, '11:30'), pago('demo-pago-extra-0-2', 'TRANSFERENCIA', 'Itaú · Cuenta corriente', 3250000, '12:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-2', numero: 'AUR-0005', diasAtras: 1, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-juan', cliente: 'Juan Pereira', vendedorId: 'demo-user-vendedor',
    entrega: 'DELIVERY', fulfillment: 'DELIVERED', montoDelivery: 30000,
    items: [linea('demo-iphone-15-128-azul', 1, 4850000)],
    pagos: [pago('demo-pago-extra-1-0', 'DINERO', '', 2000000, '10:30'), pago('demo-pago-extra-1-1', 'TARJETA', 'Ueno · Tarjeta', 2880000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-3', numero: 'AUR-0006', diasAtras: 1, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-ana', cliente: 'Ana Villalba', vendedorId: 'demo-user-vendedora',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-14-256-azul', 1, 3950000, [IMEIS_DEMO_FICTICIOS[20]])],
    pagos: [pago('demo-pago-extra-2-0', 'PIX', 'Pix · Itaú', 3950000, '10:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-4', numero: 'AUR-0007', diasAtras: 2, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-ramiro', cliente: 'Ramiro Cáceres', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-13-pro-max-256-grafito', 1, 4450000)],
    pagos: [pago('demo-pago-extra-3-0', 'USDT - CRIPTO', 'USDT · Binance', 2225000, '10:30'), pago('demo-pago-extra-3-1', 'DINERO USD', 'Caja · Dólares', 2225000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-5', numero: 'AUR-0008', diasAtras: 2, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-estela', cliente: 'Estela Ramírez', vendedorId: 'demo-user-vendedor',
    entrega: 'DELIVERY', fulfillment: 'DELIVERED', montoDelivery: 30000,
    items: [linea('demo-iphone-15-256-rosa', 1, 5400000, [IMEIS_DEMO_FICTICIOS[18]])],
    pagos: [pago('demo-pago-extra-4-0', 'DINERO', '', 2000000, '10:30'), pago('demo-pago-extra-4-1', 'TRANSFERENCIA', 'Continental · Cuenta corriente', 3430000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-6', numero: 'AUR-0009', diasAtras: 3, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-distribuidora-luque', cliente: 'Distribuidora Luque S.A.', vendedorId: 'demo-user-vendedora',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-14-128-medianoche', 1, 3600000, [IMEIS_DEMO_FICTICIOS[19]])],
    pagos: [pago('demo-pago-extra-5-0', 'TRANSFERENCIA', 'Itaú · Cuenta corriente', 3600000, '10:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-7', numero: 'AUR-0010', diasAtras: 3, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-gloria', cliente: 'Gloria Martínez', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-13-128-blanco', 1, 3050000)],
    pagos: [pago('demo-pago-extra-6-0', 'CANJE', 'Canje · Equipos', 1850000, '10:30'), pago('demo-pago-extra-6-1', 'DINERO', '', 1200000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-8', numero: 'AUR-0011', diasAtras: 4, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-fernando', cliente: 'Fernando Ortellado', vendedorId: 'demo-user-vendedor',
    entrega: 'DELIVERY', fulfillment: 'DELIVERED', montoDelivery: 30000,
    items: [linea('demo-iphone-15-pro-256-negro', 1, 6750000)],
    pagos: [pago('demo-pago-extra-7-0', 'DINERO', '', 3000000, '10:30'), pago('demo-pago-extra-7-1', 'POS UENO', 'Ueno · Tarjeta', 3780000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-9', numero: 'AUR-0012', diasAtras: 5, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-hugo', cliente: 'Hugo Benítez', vendedorId: 'demo-user-vendedora',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-iphone-12-128-verde', 1, 2350000)],
    pagos: [],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-10', numero: 'AUR-0013', diasAtras: 6, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-maria', cliente: 'María González', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-airpods-pro-2-usbc', 1, 1850000)],
    pagos: [pago('demo-pago-extra-9-0', 'DINERO', '', 1850000, '10:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-11', numero: 'AUR-0014', diasAtras: 7, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-juan', cliente: 'Juan Pereira', vendedorId: 'demo-user-vendedor',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-cargador-usbc-20w', 1, 220000)],
    pagos: [pago('demo-pago-extra-10-0', 'DINERO', '', 100000, '10:30'), pago('demo-pago-extra-10-1', 'PIX', 'Pix · Itaú', 120000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  {
    id: 'demo-venta-extra-12', numero: 'AUR-0015', diasAtras: 8, hora: 10, minuto: 30,
    clienteId: 'demo-cliente-ana', cliente: 'Ana Villalba', vendedorId: 'demo-user-vendedora',
    entrega: 'DELIVERY', fulfillment: 'DELIVERED', montoDelivery: 20000,
    items: [linea('demo-funda-magsafe-transparente', 1, 180000)],
    pagos: [pago('demo-pago-extra-11-0', 'DINERO USD', 'Caja · Dólares', 200000, '11:30')],
    observacion: 'Pedido con pagos variados',
  },
  // ── Ventas a crédito (fiado/cuotas): alimentan «A crédito», Créditos y mora y
  // Cobranzas. `creditDays` es el plazo; los vencimientos son relativos a hoy.
  {
    id: 'demo-venta-credito-1', numero: 'AUR-0400', diasAtras: 41, hora: 11, minuto: 5,
    clienteId: 'demo-cliente-ramiro', cliente: 'Ramiro Cáceres', vendedorId: 'demo-user-vendedor',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0, creditDays: 30,
    items: [linea('demo-iphone-15-128-azul', 2, 4850000), linea('demo-cargador-usbc-20w', 2, 220000)],
    pagos: [pago('demo-pago-credito-1-a', 'TRANSFERENCIA', 'Itaú · Cuenta corriente', 4000000, '11:10')],
    observacion: 'Mayorista a crédito a 30 días',
  },
  {
    id: 'demo-venta-credito-2', numero: 'AUR-0401', diasAtras: 14, hora: 15, minuto: 30,
    clienteId: 'demo-cliente-distribuidora-luque', cliente: 'Distribuidora Luque S.A.', vendedorId: 'demo-user-gerente',
    entrega: 'DELIVERY', fulfillment: 'DELIVERED', montoDelivery: 40000, creditDays: 30,
    items: [linea('demo-iphone-14-128-medianoche', 3, 3600000)],
    pagos: [pago('demo-pago-credito-2-a', 'TRANSFERENCIA', 'Continental · Cuenta corriente', 3000000, '15:40')],
    observacion: 'Factura a 30 días, entrega en depósito',
  },
  {
    id: 'demo-venta-credito-3', numero: 'AUR-0402', diasAtras: 58, hora: 10, minuto: 0,
    clienteId: 'demo-cliente-hugo', cliente: 'Hugo Benítez', vendedorId: 'demo-user-vendedora',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0, creditDays: 7,
    items: [linea('demo-iphone-12-128-verde', 1, 2350000)],
    pagos: [pago('demo-pago-credito-3-a', 'DINERO', '', 1500000, '10:05')],
    observacion: 'Crédito a 7 días con cuota pendiente (en mora)',
  },
  {
    id: 'demo-venta-credito-4', numero: 'AUR-0403', diasAtras: 9, hora: 17, minuto: 10,
    clienteId: 'demo-cliente-maria', cliente: 'María González', vendedorId: 'demo-user',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0, creditDays: 15,
    items: [linea('demo-airpods-pro-2-usbc', 1, 1850000), linea('demo-funda-magsafe-transparente', 1, 180000)],
    pagos: [pago('demo-pago-credito-4-a', 'DINERO', '', 1000000, '17:15')],
    observacion: 'Crédito a 15 días con seña en efectivo',
  },
  {
    id: 'demo-venta-caja', numero: 'AUR-0404', diasAtras: 1, hora: 9, minuto: 40,
    clienteId: 'demo-cliente-camila', cliente: 'Camila Arévalo', vendedorId: 'demo-user-cajera',
    entrega: 'RETIRO', fulfillment: 'PICKED_UP', montoDelivery: 0,
    items: [linea('demo-cargador-usbc-20w', 1, 220000), linea('demo-funda-magsafe-transparente', 1, 180000)],
    pagos: [pago('demo-pago-caja', 'POS UENO', 'Ueno · Tarjeta', 400000, '09:45')],
    observacion: 'Venta cobrada en caja con tarjeta',
  },
  // ── Pedidos en otros estados de entrega: preparación, listo para retirar y anulado.
  {
    id: 'demo-venta-preparacion', numero: 'AUR-0405', diasAtras: 1, hora: 12, minuto: 5,
    clienteId: 'demo-cliente-natalia', cliente: 'Natalia Britez', vendedorId: 'demo-user-vendedora',
    entrega: 'RETIRO', fulfillment: 'PROCESSING', montoDelivery: 0,
    items: [linea('demo-airpods-pro-2-usbc', 1, 1850000)],
    pagos: [pago('demo-pago-preparacion', 'TRANSFERENCIA', 'Continental · Cuenta corriente', 1850000, '12:10')],
    observacion: 'Pedido en preparación, retira esta tarde',
  },
  {
    id: 'demo-venta-listo-retiro', numero: 'AUR-0406', diasAtras: 1, hora: 15, minuto: 25,
    clienteId: 'demo-cliente-bruno', cliente: 'Bruno Insfrán', vendedorId: 'demo-user-vendedor',
    entrega: 'RETIRO', fulfillment: 'READY_FOR_PICKUP', montoDelivery: 0,
    items: [linea('demo-iphone-14-256-azul', 1, 3950000)],
    pagos: [pago('demo-pago-listo-retiro-a', 'DINERO', '', 2000000, '15:30'), pago('demo-pago-listo-retiro-b', 'PIX', 'Pix · Itaú', 1950000, '15:32')],
    observacion: 'Listo para retirar, avisado por WhatsApp',
  },
  {
    id: 'demo-venta-anulada', numero: 'AUR-0407', diasAtras: 4, hora: 18, minuto: 0,
    clienteId: 'demo-cliente-sandra', cliente: 'Sandra Báez', vendedorId: 'demo-user-vendedor', status: 'CANCELLED',
    entrega: 'RETIRO', fulfillment: 'PROCESSING', montoDelivery: 0,
    items: [linea('demo-funda-magsafe-transparente', 1, 180000)],
    pagos: [],
    observacion: 'Anulado: el cliente cambió de modelo',
  },
]

// Ventas manuales (ids estables, casos puntuales) + ~120 días de historial
// generado (#451). Los ids `demo-hist-*` son deterministas.
export const VENTAS_DEMO = [...VENTAS_MANUALES, ...generarVentasHistorial()]

// ── Derivaciones puras ──────────────────────────────────────────────
export const totalProductos = (venta) => (venta.items || []).reduce((suma, item) => suma + (Number(item.totalPyg) || 0), 0)
export const totalDeVenta = (venta) => totalProductos(venta) + (Number(venta.montoDelivery) || 0)
export const totalPagado = (venta) => (venta.pagos || []).reduce((suma, item) => suma + (Number(item.monto) || 0), 0)
export const estadoPagoDeVenta = (venta) => {
  const total = totalDeVenta(venta)
  const pagado = totalPagado(venta)
  return total > 0 && pagado >= total ? 'Pagado' : pagado > 0 ? 'Parcial' : 'Pendiente'
}
export const fechaDeVenta = (venta, ahora = new Date()) => diaDemo(venta.diasAtras, ahora)
export const creadoEnDeVenta = (venta, ahora = new Date()) => instanteDemo(venta.diasAtras, venta.hora, venta.minuto, ahora)
const conHora = (venta, hora, diasDespues = 0, ahora = new Date()) => {
  const [h, m] = String(hora || '10:30').split(':').map(Number)
  return instanteDemo(Math.max(0, venta.diasAtras - (Number(diasDespues) || 0)), Number.isFinite(h) ? h : 10, Number.isFinite(m) ? m : 0, ahora)
}
const vendedorDe = (id) => EQUIPO_DEMO.find((usuario) => usuario.id === id) || EQUIPO_DEMO[0]
const sucursalDe = (id) => SUCURSALES_DEMO.find((sucursal) => sucursal.id === id) || SUCURSALES_DEMO[0]

const cuponDePago = (venta, pago, indice, ahora) => ({
  id: pago.id || `demo-pago-${venta.id}-${indice}`,
  medioPago: pago.medioPago,
  cuenta: pago.cuenta || '',
  monto: Number(pago.monto) || 0,
  amountPyg: Number(pago.monto) || 0,
  fecha: conHora(venta, pago.hora, pago.diasDespues, ahora),
})

/** Ventas en la forma legacy que consume `storage.js`/el POS. */
export function ventasDemoLegacy(ahora = new Date()) {
  return VENTAS_DEMO.map((venta) => {
    const items = (venta.items || []).map((item, indice) => {
      const articulo = ARTICULOS[item.productoId] || {}
      return {
        id: `${venta.id}-item-${indice + 1}`,
        productoId: item.productoId,
        description: item.descripcion || articulo.descripcion || item.productoId,
        descripcion: item.descripcion || articulo.descripcion || item.productoId,
        quantity: Number(item.cantidad) || 1,
        model: item.modelo || articulo.modelo || '',
        category: item.categoria || articulo.categoria || '',
        unitPricePyg: Number(item.precioUnitario) || 0,
        totalPyg: Number(item.totalPyg) || 0,
        serials: item.seriales || [],
        ...(garantiaDiasDemo(item.categoria || articulo.categoria) ? { warrantyDays: garantiaDiasDemo(item.categoria || articulo.categoria) } : {}),
      }
    })
    const pagos = (venta.pagos || []).map((item, indice) => cuponDePago(venta, item, indice, ahora))
    const pagado = pagos.reduce((suma, item) => suma + item.monto, 0)
    const total = totalDeVenta(venta)
    const vendedor = vendedorDe(venta.vendedorId)
    const sucursal = sucursalDe('mobos-demo-central')
    return {
      id: venta.id,
      orderNumber: venta.numero,
      numero: venta.numero,
      fecha: fechaDeVenta(venta, ahora),
      creadoEn: creadoEnDeVenta(venta, ahora),
      cliente: venta.cliente,
      clienteId: venta.clienteId,
      customer: { id: venta.clienteId, name: venta.cliente },
      productoId: items[0]?.productoId || null,
      productoNombre: items[0]?.descripcion || '',
      items,
      precio: totalProductos(venta),
      subtotalPyg: totalProductos(venta),
      totalPyg: total,
      pagos,
      totalPagado: pagado,
      // Un pedido anulado no queda debiendo nada (misma regla que `totalesPedido`).
      totalPendiente: venta.status === 'CANCELLED' ? 0 : Math.max(0, total - pagado),
      estadoPago: estadoPagoDeVenta(venta),
      medioPago: pagos[0]?.medioPago || '',
      vendedorId: venta.vendedorId,
      seller: { id: vendedor.id, name: vendedor.nombre },
      branch: { id: sucursal.id, name: sucursal.name, address: sucursal.address, city: sucursal.city },
      tenant: { id: EMPRESA_DEMO.id, name: EMPRESA_DEMO.razonSocial, ruc: EMPRESA_DEMO.ruc, address: EMPRESA_DEMO.direccion, phone: EMPRESA_DEMO.telefono, email: EMPRESA_DEMO.email },
      entrega: venta.entrega === 'DELIVERY' ? 'Delivery' : 'Retiro en tienda',
      deliveryType: venta.entrega,
      fulfillmentStatus: venta.fulfillment || (venta.entrega === 'DELIVERY' ? 'DELIVERED' : 'PICKED_UP'),
      montoDelivery: Number(venta.montoDelivery) || 0,
      deliveryPyg: Number(venta.montoDelivery) || 0,
      ...(Number(venta.creditDays) > 0 ? { creditDays: Number(venta.creditDays) } : {}),
      ...(venta.status ? { status: venta.status } : {}),
      observacion: venta.observacion || '',
    }
  })
}

/** Pedidos de un cliente en la forma que consume la ficha/portal del CRM. */
export function pedidosDemoDeCliente(clienteId, ahora = new Date()) {
  return VENTAS_DEMO
    .filter((venta) => venta.clienteId === clienteId)
    .map((venta) => {
      const pagos = (venta.pagos || []).map((item) => {
        const medio = MEDIO_CRM[String(item.medioPago || '').toUpperCase()] || { code: 'CASH', label: String(item.medioPago || 'Efectivo') }
        return { amountPyg: Number(item.monto) || 0, method: medio.code, methodLabel: medio.label, paidAt: conHora(venta, item.hora, item.diasDespues, ahora) }
      })
      const cobrado = pagos.reduce((suma, item) => suma + item.amountPyg, 0)
      const total = totalDeVenta(venta)
      const vendedor = vendedorDe(venta.vendedorId)
      return {
        id: venta.id,
        orderNumber: venta.numero,
        totalPyg: total,
        collectedPyg: cobrado,
        pendingPyg: venta.status === 'CANCELLED' ? 0 : Math.max(0, total - cobrado),
        createdAt: creadoEnDeVenta(venta, ahora),
        status: venta.status === 'CANCELLED' ? 'CANCELLED' : cobrado >= total && total > 0 ? 'COMPLETED' : 'PENDING',
        deliveryType: venta.entrega,
        fulfillmentStatus: venta.fulfillment || (venta.entrega === 'DELIVERY' ? 'DELIVERED' : 'PICKED_UP'),
        branch: { id: 'mobos-demo-central', name: 'Casa Central' },
        seller: { id: vendedor.id, name: vendedor.nombre },
        serials: [],
        pagos,
        items: (venta.items || []).map((item, indice) => ({
          id: `${venta.id}-linea-${indice + 1}`,
          description: item.descripcion,
          quantity: Number(item.cantidad) || 1,
          model: item.modelo || '',
          category: item.categoria || '',
          unitPricePyg: Number(item.precioUnitario) || 0,
          totalPyg: Number(item.totalPyg) || 0,
          serials: item.seriales || [],
        })),
      }
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/** Texto corto de una venta canónica (para cronologías y asuntos). */
export function resumenDeVentaDemo(venta) {
  const items = venta.items || []
  const primera = items[0]
  return `${venta.numero} · ${primera ? primera.descripcion : 'Venta'}${items.length > 1 ? ` +${items.length - 1}` : ''}`
}
