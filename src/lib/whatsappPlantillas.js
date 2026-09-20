// Variables de plantilla por contexto y reemplazo de marcadores {{clave}}.
// Compartido por Configuración (chips del editor) y los menús de WhatsApp.
export const CATEGORIAS_PLANTILLA = [
  { clave: 'ORDERS', nombre: 'Pedidos' },
  { clave: 'CUSTOMERS', nombre: 'Clientes' },
  { clave: 'SERVICE', nombre: 'Servicio' },
  { clave: 'COLLECTIONS', nombre: 'Cobranzas' },
]

export const VARIABLES_POR_CONTEXTO = {
  CUSTOMERS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
    { clave: 'sucursal', descripcion: 'Sucursal que atiende' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente del cliente' },
    { clave: 'ultima_compra', descripcion: 'Fecha de la última compra' },
  ],
  ORDERS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'pedido', descripcion: 'Número de pedido' },
    { clave: 'total', descripcion: 'Total del pedido' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente del pedido' },
    { clave: 'sucursal', descripcion: 'Sucursal que entrega' },
    { clave: 'vendedor', descripcion: 'Vendedor a cargo' },
    { clave: 'fecha', descripcion: 'Fecha del pedido' },
    { clave: 'seguimiento', descripcion: 'Enlace público de seguimiento' },
  ],
  SERVICE: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'equipo', descripcion: 'Equipo o serial del caso' },
    { clave: 'servicio', descripcion: 'Detalle del servicio' },
    { clave: 'estado', descripcion: 'Estado actual del caso' },
    { clave: 'sucursal', descripcion: 'Sucursal que atiende' },
    { clave: 'fecha', descripcion: 'Fecha del caso' },
  ],
  COLLECTIONS: [
    { clave: 'cliente', descripcion: 'Nombre del cliente' },
    { clave: 'nombre', descripcion: 'Nombre o contacto principal' },
    { clave: 'pedido', descripcion: 'Número de pedido' },
    { clave: 'vencimiento', descripcion: 'Fecha de vencimiento de la cuota' },
    { clave: 'saldo_pendiente', descripcion: 'Saldo pendiente de la cuota' },
    { clave: 'dias_atraso', descripcion: 'Días de atraso (si está vencida)' },
    { clave: 'recargo', descripcion: 'Recargo por mora (vacío si no hay)' },
    { clave: 'total', descripcion: 'Saldo más recargo' },
    { clave: 'sucursal', descripcion: 'Sucursal que cobra' },
    { clave: 'empresa', descripcion: 'Nombre de la empresa' },
  ],
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
