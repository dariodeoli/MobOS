// Variables de plantilla por contexto y reemplazo de marcadores {{clave}}.
// Compartido por Configuración/Plantillas (chips del editor y vista previa) y
// los menús de WhatsApp. Cada contexto declara solo las variables que puede
// completar al enviar.
export const CATEGORIAS_PLANTILLA = [
  { clave: 'ORDERS', nombre: 'Pedidos' },
  { clave: 'CUSTOMERS', nombre: 'Clientes' },
  { clave: 'SERVICE', nombre: 'Servicio Técnico' },
  { clave: 'COLLECTIONS', nombre: 'Cobranzas' },
]

// Canal de la plantilla: el mismo evento tiene versión WhatsApp y versión correo
// (las de correo llevan asunto y la clave `email.<evento>`).
export const CANALES_PLANTILLA = [
  { clave: 'whatsapp', nombre: 'WhatsApp' },
  { clave: 'email', nombre: 'Correo' },
]
export const PREFIJO_CORREO = 'email.'

export const VARIABLES_POR_CONTEXTO = {
  CUSTOMERS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
    { clave: 'sucursal', descripcion: 'Sucursal que atiende' },
    { clave: 'usuario', descripcion: 'Usuario que envía el mensaje' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente del cliente' },
    { clave: 'producto', descripcion: 'Producto o equipo de la compra' },
    { clave: 'fecha', descripcion: 'Fecha del mensaje' },
    { clave: 'ultima_compra', descripcion: 'Fecha de la última compra' },
    { clave: 'enlace_resena', descripcion: 'Enlace para dejar una reseña (opcional)' },
  ],
  ORDERS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
    { clave: 'pedido', descripcion: 'Número de pedido' },
    { clave: 'total', descripcion: 'Total del pedido' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente del pedido' },
    { clave: 'producto', descripcion: 'Producto o equipo del pedido' },
    { clave: 'sucursal', descripcion: 'Sucursal que entrega' },
    { clave: 'usuario', descripcion: 'Usuario que envía el mensaje' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'fecha', descripcion: 'Fecha del pedido' },
    { clave: 'seguimiento', descripcion: 'Enlace público de seguimiento' },
    { clave: 'garantia', descripcion: 'Cobertura de la garantía (ej. 12 meses)' },
    { clave: 'garantia_hasta', descripcion: 'Fecha en que vence la garantía' },
    { clave: 'cotizacion', descripcion: 'Número de cotización' },
    { clave: 'vigencia', descripcion: 'Validez de la cotización' },
    { clave: 'enlace', descripcion: 'Enlace público de la cotización' },
  ],
  SERVICE: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
    { clave: 'sucursal', descripcion: 'Sucursal que atiende' },
    { clave: 'usuario', descripcion: 'Usuario que envía el mensaje' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'equipo', descripcion: 'Equipo o serial del caso' },
    { clave: 'servicio', descripcion: 'Detalle del servicio' },
    { clave: 'estado', descripcion: 'Estado actual del caso' },
    { clave: 'total', descripcion: 'Presupuesto del servicio' },
    { clave: 'producto', descripcion: 'Modelo del equipo' },
    { clave: 'fecha', descripcion: 'Fecha del caso' },
  ],
  COLLECTIONS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
    { clave: 'sucursal', descripcion: 'Sucursal que cobra' },
    { clave: 'usuario', descripcion: 'Usuario que envía el mensaje' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'pedido', descripcion: 'Número de pedido' },
    { clave: 'vencimiento', descripcion: 'Fecha de vencimiento de la cuota' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente de la cuota' },
    { clave: 'dias_atraso', descripcion: 'Días de atraso (si está vencida)' },
    { clave: 'recargo', descripcion: 'Recargo por mora (vacío si no hay)' },
    { clave: 'total', descripcion: 'Saldo más recargo' },
    { clave: 'fecha', descripcion: 'Fecha del mensaje' },
  ],
}

// Valores de muestra para la vista previa del editor: nunca se envían.
export const VALORES_EJEMPLO = {
  cliente: 'María González',
  nombre: 'María',
  empresa: 'MobOS',
  sucursal: 'Sucursal Centro',
  usuario: 'Ana (vos)',
  vendedor: 'Ana',
  pedido: 'MOB #0008',
  total: 'Gs 3.000.000',
  saldo_pendiente: 'Gs 500.000',
  producto: 'iPhone 15',
  fecha: '21-sep-2026',
  equipo: 'iPhone 15 · IMEI 356789012345678',
  servicio: 'Cambio de pantalla',
  estado: 'Listo para retirar',
  seguimiento: 'https://moboss.online/pedido/abc123',
  vencimiento: '30-sep-2026',
  dias_atraso: '5',
  recargo: 'Gs 0',
  ultima_compra: '10-sep-2026',
  reservation_until: '25-sep-2026',
  garantia: '12 meses',
  garantia_hasta: '21-sep-2027',
  cotizacion: 'COT-0012',
  vigencia: '28-sep-2026',
  enlace: 'https://moboss.online/cotizacion/abc123',
  enlace_resena: 'https://g.page/r/tu-negocio/review',
}

// Marcadores heredados que se resuelven contra la clave nueva equivalente.
const ALIAS_VARIABLES = {
  customer_name: 'cliente',
  order_number: 'pedido',
  branch_name: 'sucursal',
}

export function renderPlantilla(body, valores = {}) {
  return String(body || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, clave) => {
    const directo = valores[clave]
    if (directo !== undefined && directo !== null) return String(directo)
    const alias = ALIAS_VARIABLES[clave]
    const alterno = alias ? valores[alias] : undefined
    return alterno === undefined || alterno === null ? '' : String(alterno)
  })
}

/** Clave de la versión correo de un evento. */
export const claveCorreo = (evento) => `${PREFIJO_CORREO}${evento}`
/** Canal de una plantilla (las filas viejas no traen `channel`). */
export const canalDe = (plantilla) => (plantilla?.channel === 'email' || String(plantilla?.key || '').startsWith(PREFIJO_CORREO) ? 'email' : 'whatsapp')
