// Lectura del inventario: nombre comercial del equipo y estado visible de la
// unidad, incluyendo lo que hereda de la entrega del pedido.

const sinEspacios = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, '')

export const ESTADOS_UNIDAD = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const TONO_ESTADO = { AVAILABLE: 'green', RESERVED: 'orange', IN_TRANSIT: 'blue', DEFECTIVE: 'slate', SOLD: 'red' }

// Nombre para la tabla: modelo + capacidad ("iPhone 15 Pro Max · 256 GB").
// Si el nombre ya trae la capacidad no se repite.
export function nombreProducto(product = {}, fallback = '') {
  const base = String(product.name || fallback || '').trim()
  const capacidad = String(product.capacity || '').trim()
  if (!base) return ''
  if (!capacidad) return base
  const digitos = capacidad.replace(/\D/g, '')
  if (digitos && sinEspacios(base).includes(digitos)) return base
  return `${base} · ${capacidad}`
}

// Permanencia: la unidad sigue en Inventario mientras no haya salido del
// local. Solo la entrega confirmada del pedido la saca.
export function sigueEnInventario(unit = {}) {
  if (unit.status === 'SOLD') return unit.sale?.fulfillmentStatus !== 'DELIVERED'
  return true
}

// Estado visible: una unidad vendida hereda la entrega del pedido, así "listo
// para retirar" se ve en Inventario sin duplicar estados.
export function estadoInventario(unit = {}) {
  if (unit.status === 'SOLD') {
    const entrega = unit.sale?.fulfillmentStatus
    if (entrega === 'READY_FOR_PICKUP') return { clave: 'READY_FOR_PICKUP', label: 'Listo p/ retirar', tone: 'orange' }
    if (entrega === 'DELIVERED') return { clave: 'DELIVERED', label: 'Entregado', tone: 'slate' }
    return { clave: 'SOLD', label: 'Vendido', tone: 'red' }
  }
  return { clave: unit.status, label: ESTADOS_UNIDAD[unit.status] || unit.status || '—', tone: TONO_ESTADO[unit.status] || 'slate' }
}
