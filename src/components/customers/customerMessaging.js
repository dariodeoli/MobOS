import { internationalPhone } from '@/utils/telefono'

export const DEMO_MESSAGE_TEMPLATES = [
  { id: 'demo-ready', key: 'ready_for_pickup', name: 'Pedido listo para retirar', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-arrived', key: 'arrived_from_depot', name: 'Pedido llegó a sucursal', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}.' },
  { id: 'demo-reservation', key: 'reservation', name: 'Reserva confirmada', body: 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.' },
]

const META_PREFIX = 'mobos:customer-meta:'

export function normalizeWhatsappNumber(value, countryCode = '+595') {
  return internationalPhone(value, countryCode)
}

export function whatsappUrl(phone, message, countryCode = '+595') {
  const normalized = normalizeWhatsappNumber(phone, countryCode)
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : ''
}

export function renderMessage(template, customer) {
  const values = {
    cliente: customer?.name || 'cliente',
    nombre: customer?.firstName || (customer?.name || 'cliente').split(' ')[0],
    customer_name: customer?.name || 'cliente',
    empresa: customer?.empresa || 'la tienda',
    sucursal: customer?.sucursal || customer?.branchName || 'la tienda',
    usuario: customer?.usuario || '',
    vendedor: customer?.vendedor || '',
    pedido: customer?.orderNumber || 'tu pedido',
    order_number: customer?.orderNumber || 'tu pedido',
    total: customer?.total || '',
    saldo_pendiente: customer?.saldoPendiente || '',
    producto: customer?.producto || '',
    fecha: customer?.fecha || '',
    branch_name: customer?.branchName || 'la tienda',
    reservation_until: customer?.reservationUntil || 'la hora acordada',
  }
  return String(template?.body || '').replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => values[key] || '')
}

export function readCustomerMetadata(notes) {
  if (typeof notes !== 'string' || !notes.startsWith(META_PREFIX)) return { phones: [] }
  try {
    const metadata = JSON.parse(notes.slice(META_PREFIX.length))
    return { phones: Array.isArray(metadata.phones) ? metadata.phones.filter(Boolean).slice(0, 4) : [] }
  } catch { return { phones: [] } }
}

export function customerMetadata(phones) {
  const extras = Array.from(new Set(phones.map((phone) => String(phone || '').trim()).filter(Boolean))).slice(1, 5)
  return extras.length ? `${META_PREFIX}${JSON.stringify({ phones: extras })}` : undefined
}
