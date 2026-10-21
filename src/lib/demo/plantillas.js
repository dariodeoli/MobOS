// Plantillas de WhatsApp del modo demo (#324): una sola fuente para POS,
// Clientes, Garantías y Taller. Antes Garantías y Servicio Técnico pedían al API
// y terminaban en «No se pudieron cargar las plantillas»; ahora el menú cae a
// estas plantillas locales cuando la sesión es demo.
// Los textos usan las mismas variables que `renderPlantilla` del menú.
export const PLANTILLAS_PEDIDOS_DEMO = [
  { id: 'demo-ready', key: 'ready_for_pickup', category: 'ORDERS', isDefault: true, name: 'Pedido listo para retirar', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.' },
  { id: 'demo-confirmado', key: 'pedido_confirmado', category: 'ORDERS', name: 'Pedido confirmado', body: '¡Hola {{cliente}}! 🧾 Confirmamos tu pedido {{pedido}} por {{total}}. Te avisamos apenas avance. ¡Gracias por tu compra! — {{empresa}}' },
  { id: 'demo-sobre-pedido', key: 'sobre_pedido_llego', category: 'ORDERS', name: 'Llegó tu pedido sobre encargo', body: '¡Hola {{cliente}}! 🎉 Llegó el {{producto}} que encargaste (pedido {{pedido}}). Pasá a retirarlo por {{sucursal}} cuando quieras. — {{empresa}}' },
  { id: 'demo-entregado', key: 'entregado', category: 'ORDERS', name: 'Pedido entregado', body: '¡Hola {{cliente}}! ✅ Tu pedido {{pedido}} quedó entregado. Gracias por elegirnos.' },
  { id: 'demo-garantia', key: 'garantia_registrada', category: 'ORDERS', name: 'Garantía registrada', body: '¡Hola {{cliente}}! 🛡️ Registramos la garantía de tu {{producto}} (pedido {{pedido}}): {{garantia}}, hasta el {{garantia_hasta}}. — {{empresa}}' },
  { id: 'demo-cotizacion', key: 'cotizacion_enviada', category: 'ORDERS', name: 'Cotización enviada', body: '¡Hola {{cliente}}! 🧾 Te enviamos la cotización {{cotizacion}} por {{total}}, válida hasta {{vigencia}}. Podés verla acá: {{enlace}}. — {{empresa}}' },
  { id: 'demo-arrived', key: 'arrived_from_depot', category: 'ORDERS', name: 'Pedido llegó a sucursal', body: 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}.' },
  { id: 'demo-reservation', key: 'reservation', category: 'ORDERS', name: 'Reserva confirmada', body: 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.' },
]

// Variables del cliente (nombre, saldo, sucursal) para que la vista previa de
// Clientes salga completa; las de pedidos siguen para el POS.
export const PLANTILLAS_CLIENTES_DEMO = [
  { id: 'demo-customer-resena', key: 'resena', category: 'CUSTOMERS', name: 'Pedido de reseña', body: '¡Hola {{nombre}}! 🙌 ¿Cómo te fue con tu {{producto}}? Contanos tu experiencia respondiendo este mensaje. ¡Gracias! — {{empresa}}' },
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

// Versión correo de cada evento (canal `email`, clave `email.<evento>`, con asunto).
const cierre = '\n\nSaludos,\n{{empresa}}'
export const PLANTILLAS_CORREO_DEMO = [
  { id: 'demo-mail-confirmado', key: 'email.pedido_confirmado', category: 'ORDERS', name: 'Correo · Pedido confirmado', subject: 'Confirmamos tu pedido {{pedido}}', body: `Hola {{cliente}},\n\nConfirmamos tu pedido {{pedido}} por {{total}}. Te avisamos apenas avance.\n\n¡Gracias por tu compra!${cierre}` },
  { id: 'demo-mail-ready', key: 'email.ready_for_pickup', category: 'ORDERS', name: 'Correo · Pedido listo para retirar', subject: 'Tu pedido {{pedido}} está listo para retirar', body: `Hola {{cliente}},\n\nTu pedido {{pedido}} ya está listo para retirar en {{sucursal}}. Te esperamos.${cierre}` },
  { id: 'demo-mail-sobre-pedido', key: 'email.sobre_pedido_llego', category: 'ORDERS', name: 'Correo · Llegó tu pedido sobre encargo', subject: 'Llegó tu pedido {{pedido}}', body: `Hola {{cliente}},\n\nLlegó el {{producto}} que encargaste (pedido {{pedido}}). Pasá a retirarlo por {{sucursal}} cuando quieras.${cierre}` },
  { id: 'demo-mail-entregado', key: 'email.entregado', category: 'ORDERS', name: 'Correo · Pedido entregado', subject: 'Tu pedido {{pedido}} fue entregado', body: `Hola {{cliente}},\n\nTu pedido {{pedido}} quedó entregado. Gracias por elegirnos.${cierre}` },
  { id: 'demo-mail-garantia', key: 'email.garantia_registrada', category: 'ORDERS', name: 'Correo · Garantía registrada', subject: 'Garantía registrada de tu {{producto}}', body: `Hola {{cliente}},\n\nRegistramos la garantía de tu {{producto}} (pedido {{pedido}}): {{garantia}}, hasta el {{garantia_hasta}}.${cierre}` },
  { id: 'demo-mail-cotizacion', key: 'email.cotizacion_enviada', category: 'ORDERS', name: 'Correo · Cotización enviada', subject: 'Tu cotización {{cotizacion}}', body: `Hola {{cliente}},\n\nTe enviamos la cotización {{cotizacion}} por {{total}}, válida hasta {{vigencia}}.\n\nPodés verla y aprobarla acá: {{enlace}}${cierre}` },
  { id: 'demo-mail-resena', key: 'email.resena', category: 'CUSTOMERS', name: 'Correo · Pedido de reseña', subject: '¿Cómo te fue con tu {{producto}}?', body: `Hola {{nombre}},\n\nQueremos saber cómo te fue con tu {{producto}}. Contanos tu experiencia respondiendo este correo.\n\n¡Gracias por elegirnos!${cierre}` },
  { id: 'demo-mail-reparacion', key: 'email.reparacion_lista', category: 'SERVICE', name: 'Correo · Reparación lista', subject: 'Tu {{equipo}} está listo para retirar', body: `Hola {{cliente}},\n\nTu {{equipo}} ya está listo para retirar en {{sucursal}}.${cierre}` },
  { id: 'demo-mail-cuota-vencida', key: 'email.cuota_vencida', category: 'COLLECTIONS', name: 'Correo · Cuota vencida', subject: 'Cuota vencida del pedido {{pedido}}', body: `Hola {{cliente}},\n\nLa cuota del pedido {{pedido}} venció el {{vencimiento}} y tiene un saldo de {{saldo_pendiente}} ({{dias_atraso}} día(s) de atraso). Podés coordinar el pago con nosotros.${cierre}` },
  { id: 'demo-mail-cuota', key: 'email.cuota_por_vencer', category: 'COLLECTIONS', name: 'Correo · Cuota por vencer', subject: 'Tu cuota del pedido {{pedido}} vence el {{vencimiento}}', body: `Hola {{cliente}},\n\nLa cuota del pedido {{pedido}} vence el {{vencimiento}} por {{saldo_pendiente}}.${cierre}` },
].map((item) => ({ ...item, channel: 'email', isActive: true }))

export const PLANTILLAS_DEMO = [...PLANTILLAS_PEDIDOS_DEMO, ...PLANTILLAS_CLIENTES_DEMO, ...PLANTILLAS_SERVICIO_DEMO]

/**
 * Plantillas demo activas para una categoría y canal (el menú filtra igual que el
 * API: sin `canal` solo WhatsApp; `todos` incluye también las de correo).
 */
export function plantillasDemo(category = 'CUSTOMERS', canal = 'whatsapp') {
  const base = canal === 'email' ? PLANTILLAS_CORREO_DEMO : canal === 'todos' ? [...PLANTILLAS_DEMO, ...PLANTILLAS_CORREO_DEMO] : PLANTILLAS_DEMO
  return base.filter((plantilla) => !category || plantilla.category === category)
}
