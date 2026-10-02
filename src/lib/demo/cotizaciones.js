// Cotizaciones ficticias del modo demo (#324): el pipeline de Vender muestra
// los mismos estados que la cuenta real (borrador, enviada, aceptada,
// convertida, vencida) con clientes y artículos del catálogo demo.
// Las dos que ya viven en la ficha del cliente (Lucía y Carlos) se repiten acá
// con el mismo número y total para no contradecir la ficha ni el portal.
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
const vence = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

const item = (description, quantity, unitPricePyg) => ({
  description,
  quantity,
  unitPricePyg,
  totalPyg: quantity * unitPricePyg,
})

const cotizacion = ({ id, number, status, customerId, customerName, sellerId, sellerName, dias, validaDias, descuentoPyg = 0, items = [], order = null }) => {
  const subtotalPyg = items.reduce((suma, linea) => suma + linea.totalPyg, 0)
  return {
    id,
    number,
    status,
    customerId,
    customerName,
    customer: { id: customerId, name: customerName, phone: '', email: '' },
    seller: sellerId ? { id: sellerId, name: sellerName } : null,
    items,
    subtotalPyg,
    discountPyg: descuentoPyg,
    totalPyg: subtotalPyg - descuentoPyg,
    notes: '',
    validUntil: validaDias === null ? null : vence(validaDias),
    publicToken: `demo-cot-${id}`,
    createdAt: hace(dias),
    updatedAt: hace(Math.max(0, dias - 1)),
    order,
  }
}

export const COTIZACIONES_DEMO = [
  cotizacion({
    id: 'cot-lucia', number: 'COT-#0018', status: 'SENT', customerId: 'demo-cliente-lucia', customerName: 'Lucía Fernández',
    sellerId: 'demo-user-vendedor', sellerName: 'Diego López', dias: 5, validaDias: 2, descuentoPyg: 150000,
    items: [item('iPhone 15 · 128 GB', 1, 5000000)],
  }),
  cotizacion({
    id: 'cot-juan', number: 'COT-#0019', status: 'DRAFT', customerId: 'demo-cliente-juan', customerName: 'Juan Pereira',
    sellerId: 'demo-user-vendedor', sellerName: 'Diego López', dias: 1, validaDias: 7,
    items: [item('iPhone 15 128GB Azul', 1, 4850000), item('Cargador USB-C 20W', 1, 220000)],
  }),
  cotizacion({
    id: 'cot-ramiro', number: 'COT-#0020', status: 'ACCEPTED', customerId: 'demo-cliente-ramiro', customerName: 'Ramiro Cáceres',
    sellerId: 'demo-user', sellerName: 'Hernán Acosta', dias: 3, validaDias: 1, descuentoPyg: 200000,
    items: [item('iPhone 14 Pro 256GB Plata', 1, 4950000)],
  }),
  cotizacion({
    id: 'cot-carlos', number: 'COT-#0011', status: 'CONVERTED', customerId: 'demo-cliente-carlos', customerName: 'Carlos Ramírez',
    sellerId: 'demo-user-vendedor', sellerName: 'Diego López', dias: 35, validaDias: -20,
    items: [item('Cargador USB-C', 1, 450000)],
    order: { id: 'demo-p-1', orderNumber: 'MOB-0001' },
  }),
  cotizacion({
    id: 'cot-gloria', number: 'COT-#0014', status: 'REJECTED', customerId: 'demo-cliente-gloria', customerName: 'Gloria Martínez',
    sellerId: 'demo-user-vendedora', sellerName: 'Sofía Cáceres', dias: 12, validaDias: -4,
    items: [item('iPhone 13 128GB Blanco', 1, 3050000)],
  }),
  cotizacion({
    id: 'cot-ana', number: 'COT-#0009', status: 'EXPIRED', customerId: 'demo-cliente-ana', customerName: 'Ana Villalba',
    sellerId: 'demo-user-vendedora', sellerName: 'Sofía Cáceres', dias: 40, validaDias: -25,
    items: [item('AirPods Pro 2 USB-C', 1, 1850000)],
  }),
]

/** Listado del pipeline con la forma de `GET /api/quotes`. */
export function listDemoQuotes() {
  return COTIZACIONES_DEMO.map((fila) => ({ ...fila, items: fila.items.map((linea) => ({ ...linea })) }))
}
