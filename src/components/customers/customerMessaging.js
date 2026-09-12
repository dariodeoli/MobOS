export const DEMO_MESSAGE_TEMPLATES = [
  { id: 'demo-ready', key: 'ready_for_pickup', name: 'Pedido listo para retirar', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-arrived', key: 'arrived_from_depot', name: 'Pedido llegó a sucursal', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}.' },
  { id: 'demo-reservation', key: 'reservation', name: 'Reserva confirmada', body: 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.' },
]

const META_PREFIX = 'mobos:customer-meta:'

export function normalizeWhatsappNumber(value, countryCode = '+595') {
  let digits = String(value || '').replace(/\D/g, '')
  const countryDigits = String(countryCode || '+595').replace(/\D/g, '') || '595'
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(countryDigits)) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `${countryDigits}${digits}`
}

export function whatsappUrl(phone, message, countryCode = '+595') {
  const normalized = normalizeWhatsappNumber(phone, countryCode)
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : ''
}

export function renderMessage(template, customer) {
  const values = {
    customer_name: customer?.name || 'cliente',
    order_number: customer?.orderNumber || 'tu pedido',
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
