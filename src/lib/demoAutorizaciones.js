// Autorizaciones ficticias de la demo (#213): la experiencia se ve completa
// —solicitudes pendientes y resueltas— sin tocar el API real. Las acciones
// sobre estas filas quedan simuladas en el navegador.

const hace = (ms) => new Date(Date.now() - ms).toISOString()
const HORA = 3600000

export const DEMO_AUTORIZACIONES = [
  {
    id: 'demo-autz-credito',
    status: 'PENDING',
    kind: 'CREDIT',
    customer: { id: 'demo-cli-1', name: 'María González' },
    requestedValue: { creditLimitPyg: 5000000, creditDays: 15 },
    requestedById: 'demo-vendedor-1',
    requestedBy: { id: 'demo-vendedor-1', name: 'Diego López' },
    createdAt: hace(3 * HORA),
    note: 'Cliente frecuente: pide crédito a 15 días.',
  },
  {
    id: 'demo-autz-descuento',
    status: 'PENDING',
    kind: 'DISCOUNT',
    customer: { id: 'demo-cli-2', name: 'Carlos Benítez' },
    requestedValue: { discountPyg: 150000, amountPyg: 6850000 },
    requestedById: 'demo-vendedor-2',
    requestedBy: { id: 'demo-vendedor-2', name: 'Lucía Fernández' },
    createdAt: hace(5 * HORA),
    note: 'Descuento fuera de política para cerrar la venta.',
  },
  {
    id: 'demo-autz-mayorista',
    status: 'APPROVED',
    kind: 'WHOLESALE',
    customer: { id: 'demo-cli-3', name: 'Distribuidora Luque S.A.' },
    requestedValue: {},
    resolvedValue: {},
    requestedById: 'demo-vendedor-1',
    requestedBy: { id: 'demo-vendedor-1', name: 'Diego López' },
    createdAt: hace(26 * HORA),
    resolvedBy: { name: 'Hernán Acosta' },
    resolvedAt: hace(20 * HORA),
    resolvedNote: 'Aprobado: compra recurrente.',
  },
  {
    id: 'demo-autz-precio-bajo',
    status: 'REJECTED',
    kind: 'BELOW_LIST_PRICE',
    customer: { id: 'demo-cli-4', name: 'Distribuidora del Este S.A.' },
    requestedValue: { discountPyg: 400000, amountPyg: 26000000 },
    requestedById: 'demo-vendedor-2',
    requestedBy: { id: 'demo-vendedor-2', name: 'Lucía Fernández' },
    createdAt: hace(30 * HORA),
    resolvedBy: { name: 'Hernán Acosta' },
    resolvedAt: hace(28 * HORA),
    resolvedNote: 'El margen no aguanta ese precio.',
  },
]

export function demoAutorizacionesFiltradas(filtro = '', tipo = '') {
  return DEMO_AUTORIZACIONES.filter(
    (fila) => (!filtro || fila.status === filtro) && (!tipo || fila.kind === tipo),
  )
}
