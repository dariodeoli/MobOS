import { Prisma } from '@prisma/client'

// Auditoría central: etiquetas humanas, áreas y armado de filtros compartidos
// entre GET /api/audit y la exportación CSV. Las etiquetas espejan las de la
// pantalla (src/components/control/Auditoria.jsx); lo que no está en el mapa se
// muestra con el código crudo, que sigue siendo mejor que ocultarlo.

export const ROLES_AUDITORIA = ['ADMIN', 'GERENTE'] as const
export const MAX_AUDIT_LIMIT = 200

export const ACCIONES_AUDITORIA: Record<string, string> = {
  ORDER_CREATED: 'Venta registrada',
  ORDER_DISCOUNT_APPROVED: 'Descuento aprobado',
  PAYMENT_RECORDED: 'Cobro registrado',
  CREDIT_INSTALLMENT_PAID: 'Cuota cobrada',
  PAYMENT_CONFIRMED: 'Cobro confirmado',
  PAYMENT_REJECTED: 'Cobro rechazado',
  ORDER_ARCHIVED: 'Pedido archivado',
  ORDER_UNARCHIVED: 'Pedido desarchivado',
  ORDER_NOTIFIED_WHATSAPP: 'Aviso al cliente por WhatsApp',
  ORDER_SERIALS_ATTACHED: 'IMEI agregados al pedido',
  ORDER_TAGS_UPDATED: 'Etiquetas del pedido',
  ORDER_BILLING_UPDATED: 'Factura del pedido',
  ORDER_FULFILLMENT_UPDATED: 'Estado de entrega',
  ORDER_RETURN_RECORDED: 'Devolución registrada',
  ORDER_EXCHANGE_RECORDED: 'Cambio registrado',
  ORDER_COMMENTED: 'Comentario en el pedido',
  INVENTORY_UNIT_RECEIVED: 'Unidad recibida',
  INVENTORY_UNIT_MOVED: 'Unidad cambiada de ubicación',
  INVENTORY_UNIT_ADJUSTED: 'Unidad ajustada',
  INVENTORY_PHYSICALLY_VERIFIED: 'Verificación física',
  INVENTORY_TRANSIT_RECEIVED: 'Recepción de tránsito',
  INVENTORY_UNITS_SOLD: 'Equipos vendidos',
  INVENTORY_RESERVED: 'Reserva creada',
  INVENTORY_RESERVATION_RELEASED: 'Reserva liberada',
  INVENTORY_REMOVED: 'Unidad dada de baja',
  INVENTORY_RESTORED: 'Unidad restaurada',
  INVENTORY_UNIT_COMMENTED: 'Comentario en la unidad',
  INVENTORY_RESERVATIONS_RELEASED_SCHEDULED: 'Reservas vencidas liberadas',
  IMEI_QUERY_CONCILIATED: 'Consulta IMEI conciliada',
  SUPPLY_NEED_CREATED: 'Necesidad de abastecimiento creada',
  SUPPLY_NEED_ASSIGNED: 'Necesidad asignada a un comprador',
  SUPPLY_NEED_CANCELLED: 'Necesidad de abastecimiento cancelada',
  SUPPLY_PURCHASE_CREATED: 'Compra del Centro de Abastecimiento',
  SUPPLY_PURCHASE_CANCELLED: 'Compra del Centro cancelada',
  SUPPLY_PURCHASE_SERIALS_ADDED: 'IMEI cargados a una compra',
  CUSTOMER_NOTE_CREATED: 'Nota de cliente creada',
  CUSTOMER_NOTE_UPDATED: 'Nota de cliente editada',
  CUSTOMER_NOTE_DELETED: 'Nota de cliente eliminada',
  CUSTOMER_FOLLOW_UP_CREATED: 'Seguimiento creado',
  CUSTOMER_FOLLOW_UP_UPDATED: 'Seguimiento editado',
  CUSTOMER_FOLLOW_UP_DELETED: 'Seguimiento eliminado',
  CUSTOMER_AUTHORIZATION_REQUESTED: 'Autorización pedida',
  CUSTOMER_AUTHORIZATION_APPROVED: 'Autorización aprobada',
  CUSTOMER_AUTHORIZATION_REJECTED: 'Autorización rechazada',
  CUSTOMER_BILLING_UPDATED: 'Facturación del cliente',
  CUSTOMER_DEVICE_REPORT_SHARED: 'Informe de equipo compartido',
  CUSTOMER_DEVICE_REPORT_VIEWED: 'Informe de equipo visto por el cliente',
  CUSTOMER_NOTICE_CREATED: 'Mensaje al cliente',
  CUSTOMER_NOTICE_DELETED: 'Mensaje al cliente eliminado',
  CASH_OPENED: 'Caja abierta',
  CASH_CLOSED: 'Caja cerrada',
  CASH_MOVEMENT_RECORDED: 'Movimiento de caja',
  CASH_MOVEMENT_CLEARED: 'Movimiento cobrado',
  FINANCE_MOVEMENT_CREATED: 'Movimiento financiero',
  FINANCE_MOVEMENT_VOIDED: 'Movimiento anulado',
  CHEQUE_CLEARED: 'Cheque cobrado',
  PAYMENT_RECONCILIATION_VIEWED: 'Conciliación consultada',
  PAYMENT_RECONCILIATION_UPDATED: 'Pago conciliado',
  RECONCILIATION_BATCH_CREATED: 'Lote de conciliación creado',
  PURCHASE_CREATED: 'Compra creada',
  PURCHASE_RECEIVED: 'Compra recibida',
  PURCHASE_COSTS_UPDATED: 'Costos de compra',
  PURCHASE_PAYMENT_RECORDED: 'Pago a proveedor',
  PURCHASE_ADVANCE: 'Anticipo a proveedor',
  WARRANTY_CREATED: 'Garantía creada',
  WARRANTY_UPDATED: 'Garantía actualizada',
  WARRANTY_PHOTO_UPLOADED: 'Foto de garantía',
  SERVICE_ORDER_CREATED: 'Orden de servicio creada',
  SERVICE_ORDER_FROM_WARRANTY: 'Orden de servicio creada (garantía)',
  SERVICE_ORDER_STATUS: 'Estado del taller',
  QUOTE_CREATED: 'Cotización creada',
  QUOTE_UPDATED: 'Cotización actualizada',
  QUOTE_CONVERTED: 'Cotización convertida',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_PIN_RESET: 'PIN restablecido',
  USER_INVITATION_CREATED: 'Invitación enviada',
  USER_INVITATION_ACCEPTED: 'Invitación aceptada',
  USER_INVITATION_REVOKED: 'Invitación revocada',
  TENANT_PROFILE_UPDATED: 'Perfil de la tienda',
  BRANCH_CREATED: 'Sucursal creada',
  BRANCH_UPDATED: 'Sucursal editada',
  BRANCH_AUTO_ASSIGNED: 'Sucursal asignada',
  TENANT_ORDER_NUMBERING: 'Numeración de pedidos',
  SESSION_REVOKED: 'Sesión revocada',
  COMPANY_SIGNED_IN: 'Ingreso de la empresa',
  SELLER_PIN_VERIFIED: 'PIN verificado',
  SELLER_PIN_FAILED: 'PIN incorrecto',
  SELLER_PIN_LOCKED: 'PIN bloqueado',
  SELLER_PIN_DUPLICATED: 'PIN duplicado',
  TRADE_IN_RECEIVED: 'Trade-In recibido',
  TRADE_IN_PUBLISHED: 'Trade-In publicado',
  TRADE_IN_SOLD_EXTERNAL: 'Trade-In vendido',
  TRADE_IN_REPAIR_COST_ADDED: 'Costo de reparación',
  DEVICE_VALUATION_CREATED: 'Valor de toma creado',
  DEVICE_VALUATION_UPDATED: 'Valor de toma editado',
  MESSAGE_TEMPLATE_CREATED: 'Plantilla creada',
  MESSAGE_TEMPLATE_UPDATED: 'Plantilla editada',
  MESSAGE_TEMPLATE_DELETED: 'Plantilla eliminada',
  PAYMENT_ACCOUNT_CREATED: 'Cuenta de cobro creada',
  PAYMENT_ACCOUNT_UPDATED: 'Cuenta de cobro editada',
  CASH_AUDIT_MARKED: 'Operación de caja auditada',
  COMMISSION_SETTLED: 'Liquidación de comisiones creada',
  COMMISSION_SETTLEMENT_PAID: 'Liquidación de comisiones pagada',
  COMMISSION_SETTLEMENT_CANCELLED: 'Liquidación de comisiones anulada',
  COMMISSION_SETTLEMENT_TOKEN_ROTATED: 'Enlace del comprobante rotado',
  ACCOUNT_HOLDER_CREATED: 'Titular creado',
  ACCOUNT_HOLDER_UPDATED: 'Titular editado',
  PRIVATE_COMPANY_CREATED: 'Empresa privada creada',
  PRIVATE_COMPANY_UPDATED: 'Empresa privada editada',
  STOCK_TRANSFER_RECEIVED: 'Traslado recibido en destino',
  STOCK_LOCATION_CREATED: 'Ubicación creada',
  STOCK_LOCATION_UPDATED: 'Ubicación editada',
  PRINT_JOB_ENQUEUED: 'Job en cola',
  PRINT_JOB_ACCEPTED: 'Job aceptado',
  PRINT_JOB_INCIERTO: 'Job incierto',
  PRINT_JOB_FAILED: 'Job fallido',
  PRINT_JOB_REQUEUED: 'Job reingresó a cola',
  PRINT_JOB_CANCELLED: 'Trabajo cancelado',
  PRINT_JOB_CONFIRMED: 'Job confirmado',
  PRINT_JOB_CONFIRM_FAILED: 'Confirmación fallida',
  PRINT_BRIDGE_CREATED: 'Puente creado',
  PRINT_BRIDGE_PAIRED: 'Puente vinculado',
  PRINT_BRIDGE_PAIR_FAILED: 'Vinculación fallida',
  PRINT_BRIDGE_UPDATED: 'Puente editado',
  PRINT_BRIDGE_REVOKED: 'Puente desvinculado',
  PRINT_PRINTER_CREATED: 'Impresora creada',
  PRINT_PRINTER_UPDATED: 'Impresora editada',
  PRINT_PRINTER_DELETED: 'Impresora eliminada',
  PRINT_PRINTER_IMPORTED: 'Impresoras importadas',
  PRINT_PRINTER_ENABLED: 'Impresora habilitada',
  PRINT_PRINTER_DISABLED: 'Impresora deshabilitada',
  PRINT_DEFAULT_PRINTER_CHANGED: 'Impresora predeterminada cambiada',
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto editado',
  PRODUCT_DELETED: 'Producto eliminado',
  PROMOTION_CREATED: 'Promoción creada',
  PROMOTION_ACTIVATED: 'Promoción activada',
  PROMOTION_DEACTIVATED: 'Promoción desactivada',
}

// Área legible por entidad: el nombre técnico no dice nada en la pantalla.
export const AREAS_AUDITORIA: Record<string, string> = {
  Order: 'Pedidos',
  InventoryUnit: 'Inventario',
  ImeiCheckQuery: 'IMEI',
  SupplyNeed: 'Abastecimiento',
  SupplyPurchase: 'Abastecimiento',
  Product: 'Inventario',
  Promotion: 'Promociones',
  Customer: 'Clientes',
  Payment: 'Pagos',
  PaymentReconciliation: 'Caja y finanzas',
  ReconciliationBatch: 'Caja y finanzas',
  CashMovement: 'Caja y finanzas',
  CashAuditMark: 'Caja y finanzas',
  CommissionSettlement: 'Comisiones',
  PaymentAccount: 'Caja y finanzas',
  AccountHolder: 'Caja y finanzas',
  PrivateCompany: 'Caja y finanzas',
  PurchaseOrder: 'Compras',
  WarrantyCase: 'Garantías',
  ServiceOrder: 'Servicio técnico',
  Quote: 'Cotizaciones',
  TradeInDevice: 'Trade-In',
  DeviceValuation: 'Trade-In',
  User: 'Equipo',
  Session: 'Sesiones',
  Branch: 'Sucursales',
  Tenant: 'Configuración',
  PrintJob: 'Impresiones',
  PrintBridge: 'Impresiones',
  PrintPrinter: 'Impresiones',
}

export const ETIQUETAS_METADATA: Record<string, string> = {
  serial: 'IMEI',
  serials: 'IMEI',
  imei: 'IMEI',
  device: 'Equipo',
  previous: 'Antes',
  current: 'Después',
  reason: 'Motivo',
  customer: 'Cliente',
  customerName: 'Cliente',
  status: 'Estado',
  from: 'Antes',
  to: 'Después',
  before: 'Antes',
  after: 'Después',
  amountPyg: 'Monto',
  totalPyg: 'Total',
  minutes: 'Minutos',
  level: 'Nivel',
  tags: 'Etiquetas',
  discountPyg: 'Descuento',
  method: 'Medio',
  canal: 'Canal',
  role: 'Rol',
  name: 'Nombre',
  email: 'Correo',
  action: 'Acción',
  jobId: 'Job',
  attempts: 'Intentos',
  intentos: 'Intentos',
  transport: 'Transporte',
  path: 'Camino',
  kind: 'Tipo',
  bytes: 'Tamaños',
  printerId: 'Impresora',
  previousDefaultId: 'Impresora anterior',
  previousDefaultName: 'Nombre anterior',
  automatic: 'Automático',
  error: 'Error',
  sku: 'SKU',
  pricePyg: 'Precio',
  costPyg: 'Costo',
  stock: 'Stock',
  reorderPoint: 'Punto de reorden',
  wholesalePricePyg: 'Precio mayorista',
  isActive: 'Activo',
  condition: 'Condición',
  storage: 'Capacidad',
  baseValuePyg: 'Valor base',
  maxValuePyg: 'Valor máximo',
  category: 'Categoría',
  model: 'Modelo',
  color: 'Color',
  capacity: 'Capacidad',
  destination: 'Destino',
  connection: 'Conexión',
  isDefault: 'Predeterminada',
  brand: 'Marca',
  location: 'Ubicación',
  width: 'Ancho',
  copies: 'Copias',
  cut: 'Corte',
  density: 'Densidad',
  characters: 'Caracteres',
  bridgeId: 'Puente',
  printers: 'Impresoras',
  bridges: 'Puentes',
  force: 'Forzar',
  code: 'Código',
  value: 'Valor',
  maxUnits: 'Unidades máximas',
  productId: 'Producto',
  usedUnits: 'Unidades usadas',
}

// Cambio de un campo: `from`/`to` (o `before`/`after`) se muestran como "antes → después".
const formatearValor = (valor: unknown, clave: string): string => {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    if ('from' in objeto || 'to' in objeto) return `${formatearValor(objeto.from, clave)} → ${formatearValor(objeto.to, clave)}`
    if ('before' in objeto || 'after' in objeto) return `${formatearValor(objeto.before, clave)} → ${formatearValor(objeto.after, clave)}`
    return ''
  }
  return String(valor)
}

export function detalleAuditoria(metadata: unknown, limite = 4): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
  const objetos = metadata as Record<string, unknown>
  const entradas = Object.entries(objetos)
    .map(([clave, valor]) => [clave, formatearValor(valor, clave)] as const)
    .filter(([, texto]) => texto !== '')
  // El JSONB no conserva el orden de las claves y los booleanos suelen ser
  // ruido: quedan al final para que los identificadores entren en la línea.
  const relevantes = entradas.filter(([clave]) => typeof objetos[clave] !== 'boolean')
  const booleanas = entradas.filter(([clave]) => typeof objetos[clave] === 'boolean')
  return [...relevantes, ...booleanas]
    .slice(0, limite)
    .map(([clave, texto]) => `${ETIQUETAS_METADATA[clave] || clave}: ${texto.slice(0, 60)}`)
    .join(' · ')
}

// Diferencias campo a campo para el rastro de ediciones. Los Decimal de Prisma
// se comparan por número: dos instancias iguales no son el mismo objeto.
export function diffCampos(antes: object, despues: object, campos: readonly string[]): Record<string, { from: unknown; to: unknown }> {
  const leer = (objeto: object, campo: string) => (objeto as Record<string, unknown>)[campo]
  const normalizar = (valor: unknown): unknown => {
    if (valor !== null && typeof valor === 'object' && typeof (valor as { toNumber?: unknown }).toNumber === 'function') return Number(valor as { toNumber: () => number })
    return valor
  }
  const cambios: Record<string, { from: unknown; to: unknown }> = {}
  for (const campo of campos) {
    const from = normalizar(leer(antes, campo))
    const to = normalizar(leer(despues, campo))
    if (from !== to) cambios[campo] = { from, to }
  }
  return cambios
}

export type FiltrosAuditoria = {
  entidades: string[]
  action: string
  q: string
  desde: Date | null
  hasta: Date | null
  userId: string
}

const fechaFiltro = (value: string | null): Date | null => {
  if (!value) return null
  const fecha = new Date(value)
  if (Number.isNaN(fecha.getTime())) throw new Error('Fecha inválida.')
  return fecha
}

export function parseFiltrosAuditoria(params: URLSearchParams): { ok: true; filtros: FiltrosAuditoria } | { ok: false; error: string } {
  try {
    return {
      ok: true,
      filtros: {
        entidades: (params.get('entity') || '').split(',').map((valor) => valor.trim()).filter(Boolean).slice(0, 8),
        action: (params.get('action') || '').trim().slice(0, 80),
        q: (params.get('q') || '').trim().slice(0, 120),
        desde: fechaFiltro(params.get('desde')),
        hasta: fechaFiltro(params.get('hasta')),
        userId: (params.get('userId') || '').trim().slice(0, 128),
      },
    }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Filtro inválido.' }
  }
}

// La búsqueda cruza acción, identificador y el texto denormalizado de la fila
// (que incluye el metadato), así un IMEI, un jobId o el nombre de una impresora
// encuentran su movimiento.
export function whereAuditoria(tenant: string, filtros: FiltrosAuditoria): Prisma.AuditLogWhereInput {
  return {
    tenantId: tenant,
    ...(filtros.entidades.length === 1
      ? { entity: filtros.entidades[0] }
      : filtros.entidades.length
        ? { entity: { in: filtros.entidades } }
        : {}),
    ...(filtros.action ? { action: filtros.action } : {}),
    ...(filtros.userId ? { userId: filtros.userId } : {}),
    ...(filtros.desde || filtros.hasta
      ? { createdAt: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
      : {}),
    ...(filtros.q
      ? {
          OR: [
            { action: { contains: filtros.q, mode: 'insensitive' as const } },
            { entityId: { contains: filtros.q, mode: 'insensitive' as const } },
            { searchText: { contains: filtros.q.toLowerCase() } },
          ],
        }
      : {}),
  }
}
