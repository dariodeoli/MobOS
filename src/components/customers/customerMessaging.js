// Plantillas demo del contexto Clientes (#160/#194): la fuente vive en
// `lib/demo/plantillas.js` (#324) y acá se re-exportan para no tocar a los
// consumidores. Las de pedidos usan variables de orden y siguen para POS.
export { PLANTILLAS_PEDIDOS_DEMO as DEMO_MESSAGE_TEMPLATES, PLANTILLAS_CLIENTES_DEMO as DEMO_CUSTOMER_TEMPLATES } from '@/lib/demo/plantillas'

/** Clave de «última plantilla usada» del contexto Clientes (lista y popup). */
export const ULTIMA_PLANTILLA_CLIENTES = 'mobos:clientes:plantilla-wa'

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
