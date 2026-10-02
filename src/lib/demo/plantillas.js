// Plantillas de WhatsApp del modo demo (#324): una sola fuente para POS,
// Clientes, Garantías y Taller. Antes Garantías y Servicio Técnico pedían al API
// y terminaban en «No se pudieron cargar las plantillas»; ahora el menú cae a
// estas plantillas locales cuando la sesión es demo.
// Los textos usan las mismas variables que `renderPlantilla` del menú.
export const PLANTILLAS_PEDIDOS_DEMO = [
  { id: 'demo-ready', key: 'ready_for_pickup', category: 'ORDERS', isDefault: true, name: 'Pedido listo para retirar', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-arrived', key: 'arrived_from_depot', category: 'ORDERS', name: 'Pedido llegó a sucursal', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}.' },
  { id: 'demo-reservation', key: 'reservation', category: 'ORDERS', name: 'Reserva confirmada', body: 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.' },
]

// Variables del cliente (nombre, saldo, sucursal) para que la vista previa de
// Clientes salga completa; las de pedidos siguen para el POS.
export const PLANTILLAS_CLIENTES_DEMO = [
  { id: 'demo-customer-hola', key: 'customer_hello', category: 'CUSTOMERS', isDefault: true, name: 'Saludo del equipo', body: 'Hola, {{customer_name}}. Te escribimos de {{empresa}} · {{sucursal}} por si necesitás algo.' },
  { id: 'demo-customer-saldo', key: 'customer_balance', category: 'CUSTOMERS', name: 'Saldo pendiente', body: 'Hola, {{customer_name}}. Tu saldo pendiente es {{saldo_pendiente}}. Cualquier consulta, respondé este mensaje.' },
  { id: 'demo-customer-novedades', key: 'customer_news', category: 'CUSTOMERS', name: 'Novedades', body: 'Hola, {{customer_name}}. Pasá por {{sucursal}} y aprovechá las novedades de {{empresa}}.' },
]

// Taller y garantías: el aviso de cada etapa del servicio, con las variables
// que ya completan Garantías y Servicio Técnico.
export const PLANTILLAS_SERVICIO_DEMO = [
  { id: 'demo-service-received', key: 'service_received', category: 'SERVICE', isDefault: true, name: 'Equipo recibido en taller', body: 'Hola, {{customer_name}}. Recibimos tu equipo en {{branch_name}} para diagnóstico. Te avisamos con el presupuesto.' },
  { id: 'demo-service-budget', key: 'service_budget', category: 'SERVICE', name: 'Presupuesto listo', body: 'Hola, {{customer_name}}. Ya tenemos el presupuesto de tu equipo. Escribinos para confirmarlo y avanzar.' },
  { id: 'demo-service-ready', key: 'service_ready', category: 'SERVICE', name: 'Equipo listo para retirar', body: 'Hola, {{customer_name}}. Tu equipo ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-warranty-active', key: 'warranty_active', category: 'SERVICE', name: 'Garantía en curso', body: 'Hola, {{customer_name}}. Tu garantía sigue activa y estamos trabajando en el caso. Cualquier duda, respondé este mensaje.' },
]

export const PLANTILLAS_DEMO = [...PLANTILLAS_PEDIDOS_DEMO, ...PLANTILLAS_CLIENTES_DEMO, ...PLANTILLAS_SERVICIO_DEMO]

/** Plantillas demo activas para una categoría (el menú filtra igual que el API). */
export function plantillasDemo(category = 'CUSTOMERS') {
  return PLANTILLAS_DEMO.filter((plantilla) => !category || plantilla.category === category)
}
