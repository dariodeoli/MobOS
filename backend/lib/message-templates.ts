// Plantillas de mensajes listas para usar (WhatsApp + correo). Puro: sin base de
// datos, para poder probar la siembra y el catálogo sin Prisma.
//
// - WhatsApp: tono cercano, español de Paraguay (voseo), emojis medidos.
// - Correo: la versión de cada evento. Clave = `email.<evento>`, así no se toca el
//   único (tenantId, key). Lleva asunto (`subject`) y saludo/cierre propios.
// - La siembra agrega solo lo que falta por clave: nunca duplica ni revive una
//   plantilla que la empresa borró (las borradas se recuerdan en `deletedKeys`).

export type Category = 'ORDERS' | 'CUSTOMERS' | 'SERVICE' | 'COLLECTIONS'
export type Channel = 'whatsapp' | 'email'

export const CATEGORIES: Category[] = ['ORDERS', 'CUSTOMERS', 'SERVICE', 'COLLECTIONS']
export const CATEGORY_TO_CONTEXT: Record<Category, string> = { ORDERS: 'pedidos', CUSTOMERS: 'clientes', SERVICE: 'servicio', COLLECTIONS: 'cobranzas' }
export const CONTEXT_TO_CATEGORY: Record<string, Category> = { pedidos: 'ORDERS', clientes: 'CUSTOMERS', servicio: 'SERVICE', cobranzas: 'COLLECTIONS' }
export const CHANNELS: Channel[] = ['whatsapp', 'email']
export const EMAIL_PREFIX = 'email.'

export type TemplateDef = { key: string; name: string; body: string; channel: Channel; subject?: string }

type Raw = [key: string, name: string, body: string]

const WHATSAPP: Record<Category, Raw[]> = {
  ORDERS: [
    ['pedido_confirmado', 'Pedido confirmado', '¡Hola {{cliente}}! 🧾 Confirmamos tu pedido {{pedido}} por {{total}}. Te avisamos apenas avance. ¡Gracias por tu compra! — {{empresa}}'],
    ['ready_for_pickup', 'Pedido listo para retirar', '¡Hola {{cliente}}! 👋 Tu pedido {{pedido}} ya está listo para retirar en {{sucursal}}. Te esperamos. ¡Gracias por tu compra! — {{empresa}}'],
    ['ready_to_ship', 'Pedido listo para enviar', '¡Hola {{cliente}}! 📦 Tu pedido {{pedido}} ya está preparado y sale para envío. Te paso el seguimiento apenas esté en camino.'],
    ['arrived_from_depot', 'Pedido llegó a sucursal', '¡Hola {{cliente}}! 🚚 Tu pedido {{pedido}} ya llegó a {{sucursal}}. Lo estamos revisando y te avisamos cuando puedas retirarlo.'],
    ['sobre_pedido_llego', 'Llegó tu pedido sobre encargo', '¡Hola {{cliente}}! 🎉 Llegó el {{producto}} que encargaste (pedido {{pedido}}). Pasá a retirarlo por {{sucursal}} cuando quieras. Saldo pendiente: {{saldo_pendiente}}. — {{empresa}}'],
    ['en_camino', 'Pedido en camino', '¡Hola {{cliente}}! 🚚 Tu pedido {{pedido}} salió y está en camino. En breve lo recibís.'],
    ['reservation', 'Reserva confirmada', '¡Hola {{cliente}}! ⏳ Te reservamos el pedido {{pedido}} hasta {{reservation_until}}. Si necesitás más tiempo, avisanos y lo extendemos.'],
    ['saldo_pendiente', 'Saldo pendiente del pedido', '¡Hola {{cliente}}! 👋 Te recordamos que el pedido {{pedido}} tiene un saldo pendiente de {{saldo_pendiente}}. Podés pasar por {{sucursal}} o coordinar el pago por acá. ¡Gracias!'],
    ['pago_pendiente', 'Pago pendiente', '¡Hola {{cliente}}! 👋 Tu pedido {{pedido}} tiene un pago pendiente de {{saldo_pendiente}}. Podés pasar por {{sucursal}} o coordinarlo por acá.'],
    ['entregado', 'Pedido entregado', '¡Hola {{cliente}}! ✅ Tu pedido {{pedido}} quedó entregado. Gracias por elegirnos.'],
    ['envio_seguimiento', 'Seguimiento de envío', '¡Hola {{cliente}}! 📍 Tu pedido {{pedido}} ya está en camino. Podés seguirlo acá: {{seguimiento}}'],
    ['garantia_registrada', 'Garantía registrada', '¡Hola {{cliente}}! 🛡️ Registramos la garantía de tu {{producto}} (pedido {{pedido}}): {{garantia}}, hasta el {{garantia_hasta}}. Guardá este mensaje y tu comprobante; si necesitás un reclamo, escribinos. — {{empresa}}'],
    ['cotizacion_enviada', 'Cotización enviada', '🧾 *Cotización {{cotizacion}}*\nHola {{cliente}}, te comparto tu cotización de {{empresa}}.\n\n{{detalle}}\n\n💰 *Total: {{total}}*\n{{equipo_entrega}}\n{{faltante}}\n{{validez}}\n{{contacto}}\n\n{{aviso_revision}}\n🔗 Ver y aprobar: {{enlace}}'],
  ],
  CUSTOMERS: [
    ['seguimiento', 'Seguimiento postventa', '¡Hola {{nombre}}! 😊 Te escribimos de {{empresa}} para saber cómo te fue con tu compra. Si necesitás algo, estamos por acá.'],
    ['resena', 'Pedido de reseña', '¡Hola {{nombre}}! 🙌 ¿Cómo te fue con tu {{producto}}? Contanos tu experiencia respondiendo este mensaje: tu opinión nos ayuda a mejorar y a que más gente nos conozca. ¡Gracias! — {{empresa}}'],
    ['promocion', 'Promoción vigente', '¡Hola {{nombre}}! 🎉 Tenemos una promo pensada para vos en {{empresa}}: pasá por {{sucursal}} o respondé este mensaje y te contamos.'],
    ['recompra', 'Recompra', '¡Hola {{nombre}}! 📱 ¿Pensando en cambiar el equipo? En {{empresa}} tenemos novedades que te pueden interesar. Te esperamos.'],
    ['mayorista', 'Precios mayoristas', '¡Hola {{nombre}}! 🛒 En {{empresa}} accedés a precios mayoristas. Si querés, te enviamos la lista actualizada.'],
    ['agradecimiento', 'Agradecimiento por la compra', '¡Gracias por tu compra, {{nombre}}! 🙌 Cualquier consulta sobre tu equipo, escribinos: estamos para ayudarte. — {{empresa}}'],
    ['saldo_cliente', 'Recordatorio de saldo', '¡Hola {{nombre}}! 👋 Te recordamos que tu saldo pendiente es {{saldo_pendiente}}. Si ya lo abonaste, ignorá este mensaje. ¡Gracias por tu confianza!'],
  ],
  SERVICE: [
    ['equipo_recibido', 'Equipo recibido', '¡Hola {{cliente}}! 🛠️ Recibimos tu {{equipo}} en {{sucursal}}. Ya empieza la revisión y te avisamos con el diagnóstico.'],
    ['diagnostico_listo', 'Diagnóstico listo', '¡Hola {{cliente}}! 🔍 Ya tenemos el diagnóstico de tu {{equipo}}: {{estado}}. Te escribimos para coordinar los próximos pasos.'],
    ['esperando_repuesto', 'Esperando repuesto', '¡Hola {{cliente}}! ⏳ Tu {{equipo}} está esperando un repuesto. Apenas llegue te avisamos para continuar con la reparación.'],
    ['reparado', 'Equipo reparado', '¡Hola {{cliente}}! ✅ Tu {{equipo}} ya está reparado. Podés retirarlo en {{sucursal}} con el comprobante.'],
    ['reparacion_lista', 'Reparación lista', '¡Hola {{cliente}}! ✅ Tu {{equipo}} ya está listo para retirar en {{sucursal}}. Te esperamos con el comprobante.'],
    ['presupuesto', 'Presupuesto del servicio', '¡Hola {{cliente}}! 🧾 El presupuesto de tu {{equipo}} es {{total}}. Si lo aprobás, arrancamos con la reparación.'],
  ],
  COLLECTIONS: [
    ['cuota_por_vencer', 'Cuota por vencer', '¡Hola {{cliente}}! 👋 Te recordamos que la cuota del pedido {{pedido}} vence el {{vencimiento}} por {{saldo_pendiente}}. Podés coordinar el pago con nosotros. ¡Gracias! — {{empresa}}'],
    ['cuota_vencida', 'Cuota vencida', '¡Hola {{cliente}}! 👋 La cuota del pedido {{pedido}} venció el {{vencimiento}} y tiene un saldo de {{saldo_pendiente}} ({{dias_atraso}} día(s) de atraso). Podés coordinar el pago con nosotros. ¡Gracias! — {{empresa}}'],
  ],
}

// Versión correo de cada evento: [evento, asunto, cuerpo]. El nombre sale del
// de WhatsApp («Correo · …»). Cuerpo con saludo y cierre propios del correo.
const cierre = '\n\nSaludos,\n{{empresa}}'
const EMAIL: Array<[Category, string, string, string]> = [
  ['ORDERS', 'pedido_confirmado', 'Confirmamos tu pedido {{pedido}}', 'Hola {{cliente}},\n\nConfirmamos tu pedido {{pedido}} por {{total}}. Te avisamos apenas avance.\n\n¡Gracias por tu compra!' + cierre],
  ['ORDERS', 'ready_for_pickup', 'Tu pedido {{pedido}} está listo para retirar', 'Hola {{cliente}},\n\nTu pedido {{pedido}} ya está listo para retirar en {{sucursal}}. Te esperamos.\n\n¡Gracias por tu compra!' + cierre],
  ['ORDERS', 'sobre_pedido_llego', 'Llegó tu pedido {{pedido}}', 'Hola {{cliente}},\n\nLlegó el {{producto}} que encargaste (pedido {{pedido}}). Pasá a retirarlo por {{sucursal}} cuando quieras. Saldo pendiente: {{saldo_pendiente}}.' + cierre],
  ['ORDERS', 'en_camino', 'Tu pedido {{pedido}} está en camino', 'Hola {{cliente}},\n\nTu pedido {{pedido}} salió y está en camino. Podés seguirlo acá: {{seguimiento}}.' + cierre],
  ['ORDERS', 'entregado', 'Tu pedido {{pedido}} fue entregado', 'Hola {{cliente}},\n\nTu pedido {{pedido}} quedó entregado. Gracias por elegirnos; si necesitás algo, respondé este correo.' + cierre],
  ['ORDERS', 'garantia_registrada', 'Garantía registrada de tu {{producto}}', 'Hola {{cliente}},\n\nRegistramos la garantía de tu {{producto}} (pedido {{pedido}}): {{garantia}}, hasta el {{garantia_hasta}}.\n\nGuardá este correo y tu comprobante. Si necesitás hacer un reclamo, respondé este mensaje.' + cierre],
  ['ORDERS', 'cotizacion_enviada', 'Tu cotización {{cotizacion}}', 'Hola {{cliente}},\n\nTe enviamos la cotización {{cotizacion}} por {{total}}, válida hasta {{vigencia}}.\n\nPodés verla y aprobarla acá: {{enlace}}\n\nCualquier duda, estamos para ayudarte.' + cierre],
  ['CUSTOMERS', 'resena', '¿Cómo te fue con tu {{producto}}?', 'Hola {{nombre}},\n\nQueremos saber cómo te fue con tu {{producto}}. Contanos tu experiencia respondiendo este correo: tu opinión nos ayuda a mejorar y a que más gente nos conozca.\n\n¡Gracias por elegirnos!' + cierre],
  ['SERVICE', 'reparacion_lista', 'Tu {{equipo}} está listo para retirar', 'Hola {{cliente}},\n\nTu {{equipo}} ya está listo para retirar en {{sucursal}}. Te esperamos con el comprobante.' + cierre],
  ['SERVICE', 'presupuesto', 'Presupuesto de tu {{equipo}}', 'Hola {{cliente}},\n\nEl presupuesto de tu {{equipo}} es {{total}}. Si lo aprobás, arrancamos con la reparación; respondé este correo para confirmarlo.' + cierre],
  ['COLLECTIONS', 'cuota_por_vencer', 'Tu cuota del pedido {{pedido}} vence el {{vencimiento}}', 'Hola {{cliente}},\n\nTe recordamos que la cuota del pedido {{pedido}} vence el {{vencimiento}} por {{saldo_pendiente}}. Podés coordinar el pago con nosotros.\n\n¡Gracias!' + cierre],
  ['COLLECTIONS', 'cuota_vencida', 'Cuota vencida del pedido {{pedido}}', 'Hola {{cliente}},\n\nLa cuota del pedido {{pedido}} venció el {{vencimiento}} y tiene un saldo de {{saldo_pendiente}} ({{dias_atraso}} día(s) de atraso). Podés coordinar el pago con nosotros.\n\n¡Gracias!' + cierre],
]

export const DEFAULTS: Record<Category, TemplateDef[]> = Object.fromEntries(CATEGORIES.map((category) => {
  const whatsapp = WHATSAPP[category].map(([key, name, body]): TemplateDef => ({ key, name, body, channel: 'whatsapp' }))
  const email = EMAIL.filter(([cat]) => cat === category).map(([, evento, subject, body]): TemplateDef => {
    const origen = WHATSAPP[category].find(([key]) => key === evento)
    return { key: `${EMAIL_PREFIX}${evento}`, name: `Correo · ${origen?.[1] || evento}`, body, subject, channel: 'email' }
  })
  return [category, [...whatsapp, ...email]]
})) as Record<Category, TemplateDef[]>

/** Claves de las plantillas de campañas: las únicas que exige el módulo de mensajes. */
export const CAMPAIGN_KEYS = ['promocion', 'recompra', 'mayorista'] as const
export const isCampaignKey = (key: string) => CAMPAIGN_KEYS.includes(key.replace(EMAIL_PREFIX, '') as typeof CAMPAIGN_KEYS[number])

export const defaultKeys = () => new Set(CATEGORIES.flatMap((category) => DEFAULTS[category].map((item) => item.key)))
export const isEmailKey = (key: string) => key.startsWith(EMAIL_PREFIX)
export const channelOfKey = (key: string): Channel => (isEmailKey(key) ? 'email' : 'whatsapp')

/**
 * Qué falta sembrar en una categoría. Idempotente: con las mismas plantillas
 * existentes devuelve vacío; nunca incluye una clave borrada por la empresa.
 */
export function planSeed(category: Category, existingKeys: Iterable<string>, deletedKeys: Iterable<string> = []): TemplateDef[] {
  const have = new Set(existingKeys)
  const gone = new Set(deletedKeys)
  return DEFAULTS[category].filter((item) => !have.has(item.key) && !gone.has(item.key))
}

/** Lee las claves sembradas que la empresa borró (Tenant.settings.messageTemplates.deletedKeys). */
export function deletedKeysFrom(settings: unknown): string[] {
  const root = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {}
  const bag = root.messageTemplates && typeof root.messageTemplates === 'object' ? root.messageTemplates as Record<string, unknown> : {}
  return Array.isArray(bag.deletedKeys) ? bag.deletedKeys.filter((key): key is string => typeof key === 'string') : []
}

/** Devuelve los settings con la clave sumada a las borradas (sin pisar el resto). */
export function withDeletedKey(settings: unknown, key: string): Record<string, unknown> {
  const root = settings && typeof settings === 'object' && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {}
  const bag = root.messageTemplates && typeof root.messageTemplates === 'object' ? { ...(root.messageTemplates as Record<string, unknown>) } : {}
  const keys = new Set(deletedKeysFrom(root))
  keys.add(key)
  root.messageTemplates = { ...bag, deletedKeys: [...keys].sort() }
  return root
}
