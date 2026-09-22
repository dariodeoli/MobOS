export const DEMO_MESSAGE_TEMPLATES = [
  { id: 'demo-ready', key: 'ready_for_pickup', name: 'Pedido listo para retirar', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-arrived', key: 'arrived_from_depot', name: 'Pedido llegó a sucursal', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}.' },
  { id: 'demo-reservation', key: 'reservation', name: 'Reserva confirmada', body: 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.' },
]

// Plantillas demo del contexto Clientes (#160/#194): variables del cliente
// (nombre, saldo, sucursal) para que la vista previa salga completa. Las de
// pedidos (DEMO_MESSAGE_TEMPLATES) usan variables de orden y siguen para POS.
export const DEMO_CUSTOMER_TEMPLATES = [
  { id: 'demo-customer-hola', key: 'customer_hello', name: 'Saludo del equipo', body: 'Hola, {{customer_name}}. Te escribimos de {{empresa}} · {{sucursal}} por si necesitás algo.' },
  { id: 'demo-customer-saldo', key: 'customer_balance', name: 'Saldo pendiente', body: 'Hola, {{customer_name}}. Tu saldo pendiente es {{saldo_pendiente}}. Cualquier consulta, respondé este mensaje.' },
  { id: 'demo-customer-novedades', key: 'customer_news', name: 'Novedades', body: 'Hola, {{customer_name}}. Pasá por {{sucursal}} y aprovechá las novedades de {{empresa}}.' },
]

const META_PREFIX = 'mobos:customer-meta:'

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
    seguimiento: customer?.seguimiento || '',
    tracking_url: customer?.seguimiento || '',
    branch_name: customer?.branchName || 'la tienda',
    reservation_until: customer?.reservationUntil || 'la hora acordada',
    tracking_url: customer?.trackingUrl || '',
  }
  // Las plantillas aceptan {variable} y {{variable}}: el editor inserta la
  // forma corta y los avisos viejos usan la doble llave.
  return String(template?.body || '').replace(/\{\{?\s*([a-z_]+)\s*\}?\}/gi, (_, key) => values[key] || '')
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
