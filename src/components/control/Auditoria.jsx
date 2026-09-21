import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { Aviso, Badge, Card, EmptyState, Select, Skeleton } from '@/components/ui'
import SearchField from '@/components/shared/SearchField'
import { descargarCsv } from '@/utils/descargarCsv'
import { cn } from '@/lib/utils'
import { CELDA_ENCABEZADO } from '@/components/shared/tabla'

// Pantalla real de auditoría: el registro que escribe el backend en cada
// operación. Antes solo existía en la demo; en producción no había dónde verlo.

// Etiqueta humana por acción. Lo que no está en el mapa se muestra tal cual
// (el código crudo), que sigue siendo mejor que ocultarlo.
const ACCIONES = {
  ORDER_CREATED: ['Venta registrada', 'green'],
  ORDER_DISCOUNT_APPROVED: ['Descuento aprobado', 'orange'],
  PAYMENT_RECORDED: ['Cobro registrado', 'green'],
  CREDIT_INSTALLMENT_PAID: ['Cuota cobrada', 'green'],
  STORE_CREDIT_ISSUED: ['Saldo a favor emitido', 'blue'],
  STORE_CREDIT_USED: ['Saldo a favor usado', 'green'],
  PAYMENT_CONFIRMED: ['Pago pendiente confirmado', 'green'],
  PAYMENT_REJECTED: ['Pago pendiente rechazado', 'red'],
  ORDER_ARCHIVED: ['Pedido archivado', 'slate'],
  ORDER_UNARCHIVED: ['Pedido desarchivado', 'slate'],
  ORDER_NOTIFIED_WHATSAPP: ['Aviso al cliente por WhatsApp', 'blue'],
  ORDER_SERIALS_ATTACHED: ['IMEI agregados al pedido', 'blue'],
  ORDER_TAGS_UPDATED: ['Etiquetas del pedido', 'slate'],
  ORDER_BILLING_UPDATED: ['Factura del pedido', 'slate'],
  ORDER_FULFILLMENT_UPDATED: ['Estado de entrega', 'blue'],
  SALE_SUSPENDED: ['Venta suspendida', 'orange'],
  SALE_SUSPENDED_DISCARDED: ['Venta suspendida descartada', 'slate'],
  ORDER_RETURN_RECORDED: ['Devolución registrada', 'red'],
  ORDER_EXCHANGE_RECORDED: ['Cambio registrado', 'orange'],
  ORDER_COMMENTED: ['Comentario en el pedido', 'slate'],
  INVENTORY_UNIT_RECEIVED: ['Unidad recibida', 'green'],
  INVENTORY_UNIT_MOVED: ['Unidad cambiada de ubicación', 'blue'],
  INVENTORY_UNIT_ADJUSTED: ['Unidad ajustada', 'orange'],
  INVENTORY_PHYSICALLY_VERIFIED: ['Verificación física', 'green'],
  INVENTORY_TRANSIT_RECEIVED: ['Recepción de tránsito', 'green'],
  INVENTORY_UNITS_SOLD: ['Equipos vendidos', 'green'],
  INVENTORY_RESERVED: ['Reserva creada', 'blue'],
  INVENTORY_RESERVATION_RELEASED: ['Reserva liberada', 'slate'],
  INVENTORY_REMOVED: ['Unidad dada de baja', 'red'],
  INVENTORY_RESTORED: ['Unidad restaurada', 'green'],
  INVENTORY_UNIT_COMMENTED: ['Comentario en la unidad', 'slate'],
  INVENTORY_RESERVATIONS_RELEASED_SCHEDULED: ['Reservas vencidas liberadas', 'slate'],
  INVENTORY_COUNT_CREATED: ['Conteo iniciado', 'blue'],
  INVENTORY_COUNT_SCANNED: ['Unidad contada', 'slate'],
  INVENTORY_COUNT_APPLIED: ['Conteo aprobado', 'green'],
  INVENTORY_COUNT_CANCELLED: ['Conteo cancelado', 'red'],
  CUSTOMER_NOTE_CREATED: ['Nota de cliente creada', 'slate'],
  CUSTOMER_NOTE_UPDATED: ['Nota de cliente editada', 'slate'],
  CUSTOMER_NOTE_DELETED: ['Nota de cliente eliminada', 'red'],
  CUSTOMER_FOLLOW_UP_CREATED: ['Seguimiento creado', 'blue'],
  CUSTOMER_FOLLOW_UP_UPDATED: ['Seguimiento editado', 'slate'],
  CUSTOMER_FOLLOW_UP_DELETED: ['Seguimiento eliminado', 'red'],
  CUSTOMER_AUTHORIZATION_REQUESTED: ['Autorización pedida', 'orange'],
  CUSTOMER_AUTHORIZATION_APPROVED: ['Autorización aprobada', 'green'],
  CUSTOMER_AUTHORIZATION_REJECTED: ['Autorización rechazada', 'red'],
  CUSTOMER_BILLING_UPDATED: ['Facturación del cliente', 'slate'],
  CASH_OPENED: ['Caja abierta', 'green'],
  CASH_CLOSED: ['Caja cerrada', 'slate'],
  CASH_MOVEMENT_RECORDED: ['Movimiento de caja', 'blue'],
  CASH_MOVEMENT_CLEARED: ['Movimiento cobrado', 'green'],
  FINANCE_MOVEMENT_CREATED: ['Movimiento financiero', 'blue'],
  FINANCE_MOVEMENT_VOIDED: ['Movimiento anulado', 'red'],
  CHEQUE_CLEARED: ['Cheque cobrado', 'green'],
  PURCHASE_CREATED: ['Compra creada', 'blue'],
  PURCHASE_RECEIVED: ['Compra recibida', 'green'],
  PURCHASE_RETURNED: ['Devolución a proveedor', 'red'],
  COMMISSION_SETTLED: ['Liquidación de comisiones', 'blue'],
  COMMISSION_SETTLEMENT_PAID: ['Liquidación pagada', 'green'],
  COMMISSION_SETTLEMENT_CANCELLED: ['Liquidación anulada', 'red'],
  DEVICE_VALUATION_CREATED: ['Valor de toma creado', 'blue'],
  DEVICE_VALUATION_UPDATED: ['Valor de toma actualizado', 'slate'],
  BANK_STATEMENT_IMPORTED: ['Extracto bancario importado', 'blue'],
  LOYALTY_ACCRUED: ['Puntos de fidelización acreditados', 'green'],
  LOYALTY_REDEEMED: ['Puntos canjeados como saldo a favor', 'blue'],
  PURCHASE_COSTS_UPDATED: ['Costos de compra', 'orange'],
  PURCHASE_PAYMENT_RECORDED: ['Pago a proveedor', 'green'],
  PURCHASE_ADVANCE: ['Anticipo a proveedor', 'orange'],
  WARRANTY_CREATED: ['Garantía creada', 'blue'],
  WARRANTY_UPDATED: ['Garantía actualizada', 'blue'],
  WARRANTY_PHOTO_UPLOADED: ['Foto de garantía', 'slate'],
  SERVICE_ORDER_CREATED: ['Orden de servicio creada', 'blue'],
  SERVICE_ORDER_STATUS: ['Estado del taller', 'blue'],
  QUOTE_CREATED: ['Cotización creada', 'blue'],
  QUOTE_UPDATED: ['Cotización actualizada', 'slate'],
  QUOTE_CONVERTED: ['Cotización convertida', 'green'],
  USER_CREATED: ['Usuario creado', 'green'],
  USER_UPDATED: ['Usuario actualizado', 'slate'],
  USER_DEACTIVATED: ['Usuario desactivado', 'red'],
  USER_PIN_RESET: ['PIN restablecido', 'orange'],
  USER_INVITATION_CREATED: ['Invitación enviada', 'blue'],
  USER_INVITATION_ACCEPTED: ['Invitación aceptada', 'green'],
  USER_INVITATION_REVOKED: ['Invitación revocada', 'red'],
  TENANT_PROFILE_UPDATED: ['Perfil de la tienda', 'slate'],
  TENANT_ORDER_NUMBERING: ['Numeración de pedidos', 'slate'],
  SESSION_REVOKED: ['Sesión revocada', 'red'],
  COMPANY_SIGNED_IN: ['Ingreso de la empresa', 'slate'],
  SELLER_PIN_VERIFIED: ['PIN verificado', 'slate'],
  SELLER_PIN_FAILED: ['PIN incorrecto', 'orange'],
  SELLER_PIN_LOCKED: ['PIN bloqueado', 'red'],
  SELLER_PIN_DUPLICATED: ['PIN duplicado', 'orange'],
  TRADE_IN_RECEIVED: ['Trade-In recibido', 'blue'],
  TRADE_IN_PUBLISHED: ['Trade-In publicado', 'green'],
  TRADE_IN_SOLD_EXTERNAL: ['Trade-In vendido', 'green'],
  TRADE_IN_REPAIR_COST_ADDED: ['Costo de reparación', 'orange'],
  MESSAGE_TEMPLATE_CREATED: ['Plantilla creada', 'blue'],
  MESSAGE_TEMPLATE_UPDATED: ['Plantilla editada', 'slate'],
  MESSAGE_TEMPLATE_DELETED: ['Plantilla eliminada', 'red'],
  PAYMENT_ACCOUNT_CREATED: ['Cuenta de cobro creada', 'green'],
  PAYMENT_ACCOUNT_UPDATED: ['Cuenta de cobro editada', 'slate'],
  CASH_AUDIT_MARKED: ['Operación de caja auditada', 'blue'],
  ACCOUNT_HOLDER_CREATED: ['Titular creado', 'green'],
  ACCOUNT_HOLDER_UPDATED: ['Titular editado', 'slate'],
  PRIVATE_COMPANY_CREATED: ['Empresa privada creada', 'green'],
  PRIVATE_COMPANY_UPDATED: ['Empresa privada editada', 'slate'],
  STOCK_TRANSFER_RECEIVED: ['Traslado recibido en destino', 'green'],
  STOCK_LOCATION_CREATED: ['Ubicación creada', 'green'],
  STOCK_LOCATION_UPDATED: ['Ubicación editada', 'slate'],
  PRINT_JOB_ENQUEUED: ['Trabajo en cola', 'blue'],
  PRINT_JOB_ACCEPTED: ['Trabajo aceptado', 'green'],
  PRINT_JOB_INCIERTO: ['Trabajo incierto', 'orange'],
  PRINT_JOB_FAILED: ['Trabajo fallido', 'red'],
  PRINT_JOB_REQUEUED: ['Trabajo reingresó a la cola', 'orange'],
  PRINT_JOB_CANCELLED: ['Trabajo cancelado', 'slate'],
  PRINT_JOB_CONFIRMED: ['Trabajo confirmado', 'green'],
  PRINT_JOB_CONFIRM_FAILED: ['Confirmación fallida', 'red'],
  PRINT_BRIDGE_CREATED: ['Puente creado', 'blue'],
  PRINT_BRIDGE_PAIRED: ['Puente vinculado', 'green'],
  PRINT_BRIDGE_PAIR_FAILED: ['Vinculación fallida', 'orange'],
  PRINT_BRIDGE_REVOKED: ['Puente desvinculado', 'red'],
  PRINT_PRINTER_CREATED: ['Impresora creada', 'green'],
  PRINT_PRINTER_UPDATED: ['Impresora editada', 'slate'],
  PRINT_PRINTER_DELETED: ['Impresora eliminada', 'red'],
  PRINT_PRINTER_IMPORTED: ['Impresoras importadas', 'blue'],
  PRODUCT_CREATED: ['Producto creado', 'green'],
  PRODUCT_UPDATED: ['Producto editado', 'slate'],
  PRODUCT_DELETED: ['Producto eliminado', 'red'],
  PROMOTION_CREATED: ['Promoción creada', 'green'],
  PROMOTION_ACTIVATED: ['Promoción activada', 'green'],
  PROMOTION_DEACTIVATED: ['Promoción desactivada', 'slate'],
  PRICE_LIST_CREATED: ['Lista de precios creada', 'green'],
  PRICE_LIST_UPDATED: ['Lista de precios actualizada', 'blue'],
  PRICE_LIST_DELETED: ['Lista de precios eliminada', 'red'],
  PRICE_TIERS_UPDATED: ['Precios por cantidad actualizados', 'blue'],
}

// Entidades con las que se filtra la lista. Impresiones agrupa las tres
// entidades del módulo en una sola opción (el endpoint acepta la lista).
const ENTIDADES = [
  ['', 'Todo'],
  ['Order', 'Pedidos'],
  ['InventoryUnit', 'Inventario'],
  ['Product', 'Inventario'],
  ['Promotion', 'Promociones'],
  ['Customer', 'Clientes'],
  ['Payment', 'Pagos'],
  ['CashMovement', 'Caja y finanzas'],
  ['PurchaseOrder', 'Compras'],
  ['WarrantyCase', 'Garantías'],
  ['ServiceOrder', 'Servicio técnico'],
  ['Quote', 'Cotizaciones'],
  ['TradeInDevice', 'Trade-In'],
  ['User', 'Equipo'],
  ['Session', 'Sesiones'],
  ['PrintJob,PrintBridge,PrintPrinter', 'Impresiones'],
]

// Área legible para la columna: el nombre técnico no dice nada.
const ENTIDAD_LABEL = {
  Order: 'Pedidos',
  InventoryUnit: 'Inventario',
  Product: 'Inventario',
  Promotion: 'Promociones',
  Customer: 'Clientes',
  Payment: 'Pagos',
  CashMovement: 'Caja y finanzas',
  PurchaseOrder: 'Compras',
  WarrantyCase: 'Garantías',
  ServiceOrder: 'Servicio técnico',
  Quote: 'Cotizaciones',
  TradeInDevice: 'Trade-In',
  User: 'Equipo',
  Session: 'Sesiones',
  PrintJob: 'Impresiones',
  PrintBridge: 'Impresiones',
  PrintPrinter: 'Impresiones',
}

// Rangos de fecha: el navegador conoce el día del negocio y manda el inicio
// como instante; el backend filtra por createdAt.
const RANGOS = [
  ['', 'Cualquier fecha'],
  ['hoy', 'Hoy'],
  ['semana', 'Esta semana'],
  ['mes', 'Este mes'],
]

function desdeDelRango(rango) {
  if (!rango) return null
  const ahora = new Date()
  if (rango === 'hoy') return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  if (rango === 'semana') {
    const desdeElLunes = (ahora.getDay() + 6) % 7
    return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - desdeElLunes)
  }
  if (rango === 'mes') return new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  return null
}

const GRID_AUDITORIA = 'grid min-w-[52rem] grid-cols-[minmax(9rem,1.1fr)_minmax(7rem,0.9fr)_minmax(6rem,0.7fr)_minmax(10rem,1.8fr)_8rem] items-center gap-x-2'

function fechaHora(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${dia} · ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

// El metadata es libre por acción: se muestra como pares legibles y los campos
// técnicos largos (ids) se recortan para que la fila siga siendo de una línea.
// Los cambios campo a campo (`{ from, to }`) se leen como "antes → después".
const ETIQUETAS = {
  serial: 'IMEI', serials: 'IMEI', imei: 'IMEI', reason: 'Motivo', customer: 'Cliente', customerName: 'Cliente', status: 'Estado',
  from: 'Antes', to: 'Después', before: 'Antes', after: 'Después', amountPyg: 'Monto', totalPyg: 'Total', minutes: 'Minutos',
  level: 'Nivel', tags: 'Etiquetas', discountPyg: 'Descuento', method: 'Medio', role: 'Rol', name: 'Nombre', email: 'Correo',
  action: 'Acción', jobId: 'Job', attempts: 'Intentos', intentos: 'Intentos', transport: 'Transporte', path: 'Camino',
  kind: 'Tipo', bytes: 'Tamaños', printerId: 'Impresora', error: 'Error', sku: 'SKU', pricePyg: 'Precio', costPyg: 'Costo',
  stock: 'Stock', reorderPoint: 'Punto de reorden', wholesalePricePyg: 'Precio mayorista', isActive: 'Activo',
  condition: 'Condición', category: 'Categoría', model: 'Modelo', color: 'Color', capacity: 'Capacidad', destination: 'Destino',
  connection: 'Conexión', isDefault: 'Predeterminada', brand: 'Marca', location: 'Ubicación', width: 'Ancho', copies: 'Copias',
  cut: 'Corte', density: 'Densidad', characters: 'Caracteres', bridgeId: 'Puente', printers: 'Impresoras', bridges: 'Puentes',
  force: 'Forzar', code: 'Código', value: 'Valor', maxUnits: 'Unidades máximas', productId: 'Producto', usedUnits: 'Unidades usadas',
}

function formatearValor(valor) {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'object') {
    if ('from' in valor || 'to' in valor) return `${formatearValor(valor.from)} → ${formatearValor(valor.to)}`
    if ('before' in valor || 'after' in valor) return `${formatearValor(valor.before)} → ${formatearValor(valor.after)}`
    return ''
  }
  return String(valor)
}

function detalleDe(metadata) {
  if (!metadata || typeof metadata !== 'object') return ''
  const entradas = Object.entries(metadata)
    .map(([clave, valor]) => [clave, formatearValor(valor)])
    .filter(([, texto]) => texto !== '')
  // El JSONB no conserva el orden de las claves y los booleanos suelen ser
  // ruido: quedan al final para que los identificadores entren en la línea.
  const relevantes = entradas.filter(([clave]) => typeof metadata[clave] !== 'boolean')
  const booleanas = entradas.filter(([clave]) => typeof metadata[clave] === 'boolean')
  // Los identificadores del movimiento van primero: si el JSONB los deja al
  // final, el detalle visible podía quedar sin el IMEI/destino buscado.
  const identificadores = ['destination', 'serial', 'serials', 'imei', 'jobId', 'ref', 'email', 'orderNumber', 'pedido', 'code']
  const ordenados = [...relevantes].sort(([a], [b]) => {
    const pa = identificadores.includes(a) ? 0 : 1
    const pb = identificadores.includes(b) ? 0 : 1
    return pa - pb
  })
  return [...ordenados, ...booleanas]
    .slice(0, 5)
    .map(([clave, texto]) => `${ETIQUETAS[clave] || clave}: ${texto.slice(0, 40)}`)
    .join(' · ')
}

export default function Auditoria() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [entidad, setEntidad] = useState('')
  const [query, setQuery] = useState('')
  const [rango, setRango] = useState('')
  const [actor, setActor] = useState('')
  const [actores, setActores] = useState([])
  const [abiertos, setAbiertos] = useState(() => new Set())

  const paramsDeFiltros = useCallback((extra = {}) => {
    const params = new URLSearchParams({ limit: '50', ...extra })
    if (entidad) params.set('entity', entidad)
    if (query.trim()) params.set('q', query.trim())
    const desde = desdeDelRango(rango)
    if (desde) params.set('desde', desde.toISOString())
    if (actor) params.set('userId', actor)
    return params
  }, [entidad, query, rango, actor])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.get(`/api/audit?${paramsDeFiltros()}`)
      setRows(data); setHayMas(data.length >= 50)
    } catch (cause) { setError(cause?.message || 'No se pudo cargar la auditoría.') } finally { setLoading(false) }
  }, [paramsDeFiltros])
  useEffect(() => { load() }, [load])

  // Actores con movimientos: alimentan el filtro "quién hizo qué".
  useEffect(() => {
    let vigente = true
    api.get('/api/audit/actors')
      .then((data) => { if (vigente) setActores(Array.isArray(data?.actores) ? data.actores : []) })
      .catch(() => { if (vigente) setActores([]) })
    return () => { vigente = false }
  }, [])

  const cargarMas = async () => {
    const ultimo = rows[rows.length - 1]?.id
    if (!ultimo || cargandoMas) return
    setCargandoMas(true)
    try {
      const data = await api.get(`/api/audit?${paramsDeFiltros({ cursor: ultimo })}`)
      setRows((actual) => [...actual, ...data]); setHayMas(data.length >= 50)
    } catch { /* se conserva lo cargado */ } finally { setCargandoMas(false) }
  }

  const exportar = async () => {
    setExportando(true); setError('')
    try {
      const desde = desdeDelRango(rango)
      await descargarCsv('audit.csv', {
        entity: entidad || undefined,
        q: query.trim() || undefined,
        desde: desde ? desde.toISOString() : undefined,
        userId: actor || undefined,
      }, 'mobos-auditoria.csv')
    } catch (cause) { setError(cause?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) }
  }

  const total = useMemo(() => rows.length, [rows])

  return <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Quién hizo qué y cuándo: ventas, inventario, cobros, equipo y configuración.</p>
        </div>
        <span className="text-xs text-mute">{total}{hayMas ? '+' : ''} movimientos</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Select aria-label="Filtrar por área" className="w-auto" value={entidad} onChange={(event) => setEntidad(event.target.value)}>
          {ENTIDADES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select aria-label="Filtrar por fecha" className="w-auto" value={rango} onChange={(event) => setRango(event.target.value)}>
          {RANGOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select aria-label="Filtrar por actor" className="w-auto" value={actor} onChange={(event) => setActor(event.target.value)}>
          <option value="">Todos los actores</option>
          {actores.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
        </Select>
        <div className="min-w-[200px] flex-1"><SearchField ariaLabel="Buscar en la auditoría" placeholder="Acción, IMEI, pedido, impresora…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <button type="button" onClick={exportar} disabled={exportando} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{exportando ? 'Exportando…' : 'Exportar CSV'}</button>
        <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      </div>
    </Card>

    {error && <Aviso tono="error">{error}</Aviso>}
    {loading && <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
    {!loading && !error && !rows.length && <Card><EmptyState compact icon="clock" title="Sin movimientos para ese filtro." description="Probá con otra área, otro rango de fechas o quitá la búsqueda." /></Card>}
    {!loading && !error && rows.length > 0 && <Card className="p-4">
      <div className="overflow-x-auto" data-testid="auditoria-tabla">
        <div className={cn(GRID_AUDITORIA, 'px-3.5 pb-2 pt-1')}>
          <span className={CELDA_ENCABEZADO}>Acción</span>
          <span className={CELDA_ENCABEZADO}>Actor</span>
          <span className={CELDA_ENCABEZADO}>Área</span>
          <span className={CELDA_ENCABEZADO}>Detalle</span>
          <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Fecha</span>
        </div>
        <div className="space-y-1">
          {rows.map((row) => {
            const [label, tone] = ACCIONES[row.action] || [row.action, 'slate']
            const detalle = detalleDe(row.metadata)
            const abierto = abiertos.has(row.id)
            const alternar = () => setAbiertos(prev => { const next = new Set(prev); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next })
            return <div key={row.id}>
              <div
                role="button"
                tabIndex={0}
                data-testid="auditoria-fila"
                onClick={alternar}
                onKeyDown={(event) => { if (event.key === 'Enter') alternar() }}
                className={cn(GRID_AUDITORIA, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40', abierto && 'border-fono/40')}
              >
                <span className="min-w-0"><Badge color={tone} className="w-fit max-w-full truncate whitespace-nowrap px-1.5 py-0.5 text-[10px]" title={row.action}>{label}</Badge></span>
                <span className="truncate text-[13px] font-semibold" title={row.user?.name || undefined}>{row.user?.name || 'Sistema'}</span>
                <span className="truncate text-[11px] text-mute" title={row.entity}>{ENTIDAD_LABEL[row.entity] || row.entity}</span>
                <span className="truncate text-[11px] text-mute" title={row.entityId || undefined}>{detalle || row.entityId || '—'}</span>
                <span className="truncate text-right text-[11px] text-mute">{fechaHora(row.createdAt)}</span>
              </div>
              {abierto && <div className="mt-1 space-y-1 rounded-xl border border-ink-600 bg-ink-800/60 p-3 text-xs text-mute">
                <p><span className="font-semibold text-fore">Acción:</span> {label}</p>
                <p><span className="font-semibold text-fore">Área:</span> {ENTIDAD_LABEL[row.entity] || row.entity}{row.entityId ? ` · ${row.entityId}` : ''}</p>
                {detalle ? <p><span className="font-semibold text-fore">Detalle:</span> {detalle}</p> : null}
                {row.metadata && Object.keys(row.metadata).length > 0 && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink-700/60 p-2 text-[11px]">{JSON.stringify(row.metadata, null, 2)}</pre>}
              </div>}
            </div>
          })}
        </div>
      </div>
      {hayMas && <div className="flex justify-center pt-3"><button type="button" disabled={cargandoMas} onClick={cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{cargandoMas ? 'Cargando…' : 'Cargar más'}</button></div>}
    </Card>}
  </div>
}
