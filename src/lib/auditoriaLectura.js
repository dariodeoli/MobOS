// #301 · Lectura humana de la auditoría: severidad por acción y etiquetas
// canónicas para los campos del metadata (incluidos los técnicos: ID de
// petición, huella, URL). Puro y testeable; la pantalla solo lo dibuja.

// Campos del metadata con nombre legible. Los técnicos quedan etiquetados
// (aunque se muestren en «Detalles técnicos») para no leer jerga cruda.
export const ETIQUETAS_METADATA = {
  serial: 'IMEI', serials: 'IMEI', imei: 'IMEI', reason: 'Motivo', customer: 'Cliente', customerName: 'Cliente', status: 'Estado',
  from: 'Antes', to: 'Después', before: 'Antes', after: 'Después', amountPyg: 'Monto', totalPyg: 'Total', minutes: 'Minutos',
  level: 'Nivel', tags: 'Etiquetas', discountPyg: 'Descuento', method: 'Medio', role: 'Rol', name: 'Nombre', email: 'Correo',
  action: 'Acción', jobId: 'Job', attempts: 'Intentos', intentos: 'Intentos', transport: 'Transporte', path: 'Camino',
  requestedTransport: 'Solicitado', fallback: 'Fallback', fallbackReason: 'Motivo del fallback', physicalConnection: 'Conexión física',
  kind: 'Tipo', bytes: 'Tamaños', printerId: 'Impresora', error: 'Error', sku: 'SKU', pricePyg: 'Precio', costPyg: 'Costo',
  stock: 'Stock', reorderPoint: 'Punto de reorden', wholesalePricePyg: 'Precio mayorista', isActive: 'Activo',
  condition: 'Condición', category: 'Categoría', model: 'Modelo', color: 'Color', capacity: 'Capacidad', destination: 'Destino',
  connection: 'Conexión', isDefault: 'Predeterminada', brand: 'Marca', location: 'Ubicación', width: 'Ancho', copies: 'Copias',
  cut: 'Corte', density: 'Densidad', characters: 'Caracteres', bridgeId: 'Puente', printers: 'Impresoras', bridges: 'Puentes',
  force: 'Forzar', code: 'Código', value: 'Valor', maxUnits: 'Unidades máximas', productId: 'Producto', usedUnits: 'Unidades usadas',
  // Técnicos (#301): se leen, no se esconden.
  requestId: 'ID de petición', ip: 'IP', hash: 'Huella', url: 'URL', token: 'Token', orderId: 'Pedido', orderNumber: 'Pedido',
  userId: 'Usuario', branchId: 'Sucursal', countId: 'Conteo', transferId: 'Traslado', paymentId: 'Pago', quoteId: 'Cotización',
}

/** Nombre legible de un campo del metadata (cae al nombre crudo). */
export function etiquetaCampo(clave) {
  return ETIQUETAS_METADATA[clave] || clave
}

// Severidad para el ojo del dueño: lo destructivo salta primero.
const ACCIONES_ALTAS = /(VOID|DELETE|DESTROY|REMOVE|CANCEL|REVOKE|PURGE|ARCHIVE|FAILED|FAIL|REJECT|RETURNED|BLOCKED|DUPLICATED|MISMATCH|MERGED)/
const ACCIONES_MEDIAS = /(UPDATED|UPDATE|ADJUST|RECONCIL|PAYMENT|PAID|REFUND|TRANSFER|IMPORT|ASSIGN|CLOSED|APPLIED|CONFIRMED|ENQUEUED)/

export const ETIQUETA_SEVERIDAD = { alta: 'Sensible', media: 'Cambio', info: 'Actividad' }

/**
 * Severidad de una acción: `alta` (destructiva o con fallo), `media` (cambia
 * datos o dinero) o `info` (actividad normal).
 */
export function severidadAuditoria(action) {
  const codigo = String(action || '').toUpperCase()
  if (ACCIONES_ALTAS.test(codigo)) return 'alta'
  if (ACCIONES_MEDIAS.test(codigo)) return 'media'
  return 'info'
}
