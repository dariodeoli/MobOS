import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { Badge, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

// Pantalla real de auditoría: el registro que escribe el backend en cada
// operación. Antes solo existía en la demo; en producción no había dónde verlo.

// Etiqueta humana por acción. Lo que no está en el mapa se muestra tal cual
// (el código crudo), que sigue siendo mejor que ocultarlo.
const ACCIONES = {
  ORDER_CREATED: ['Venta registrada', 'green'],
  ORDER_DISCOUNT_APPROVED: ['Descuento aprobado', 'orange'],
  PAYMENT_RECORDED: ['Cobro registrado', 'green'],
  ORDER_ARCHIVED: ['Pedido archivado', 'slate'],
  ORDER_UNARCHIVED: ['Pedido desarchivado', 'slate'],
  ORDER_NOTIFIED_WHATSAPP: ['Aviso al cliente por WhatsApp', 'blue'],
  ORDER_SERIALS_ATTACHED: ['IMEI agregados al pedido', 'blue'],
  ORDER_TAGS_UPDATED: ['Etiquetas del pedido', 'slate'],
  ORDER_BILLING_UPDATED: ['Factura del pedido', 'slate'],
  ORDER_FULFILLMENT_UPDATED: ['Estado de entrega', 'blue'],
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
  STOCK_TRANSFER_RECEIVED: ['Traslado recibido en destino', 'green'],
  STOCK_LOCATION_CREATED: ['Ubicación creada', 'green'],
  STOCK_LOCATION_UPDATED: ['Ubicación editada', 'slate'],
  PRINT_JOB_ENQUEUED: ['Trabajo en cola', 'blue'],
  PRINT_JOB_ACCEPTED: ['Trabajo aceptado', 'green'],
  PRINT_JOB_INCIERTO: ['Trabajo incierto', 'orange'],
  PRINT_JOB_FAILED: ['Trabajo fallido', 'red'],
  PRINT_JOB_REQUEUED: ['Reingresó a la cola', 'orange'],
  PRINT_JOB_CONFIRMED: ['Trabajo confirmado', 'green'],
  PRINT_JOB_CONFIRM_FAILED: ['Confirmación fallida', 'red'],
  PRINT_BRIDGE_PAIRED: ['Puente vinculado', 'green'],
  PRINT_BRIDGE_PAIR_FAILED: ['Vinculación fallida', 'orange'],
  PRINT_BRIDGE_CREATED: ['Puente creado', 'blue'],
  PRINT_BRIDGE_REVOKED: ['Puente revocado', 'red'],
  PRINT_PRINTER_CREATED: ['Impresora creada', 'green'],
  PRINT_PRINTER_UPDATED: ['Impresora editada', 'slate'],
  PRINT_PRINTER_DELETED: ['Impresora eliminada', 'red'],
  PRINT_PRINTER_DISABLED: ['Impresora desactivada', 'orange'],
  PRINT_PRINTER_ENABLED: ['Impresora activada', 'green'],
  PRINT_PRINTERS_IMPORTED: ['Impresoras importadas', 'blue'],
  PRINT_PRINTER_IMPORTED: ['Impresoras importadas', 'blue'],
  PRINT_DEFAULT_PRINTER_CHANGED: ['Impresora predeterminada', 'blue'],
}

// Entidades con las que se filtra la lista.
const ENTIDADES = [
  ['', 'Todo'],
  ['Order', 'Pedidos'],
  ['InventoryUnit', 'Inventario'],
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
  ['PrintJob', 'Impresión · trabajo'],
  ['PrintBridge', 'Impresión · puente'],
  ['PrintPrinter', 'Impresión · impresora'],
]

// Área legible para la columna: el nombre técnico no dice nada.
const ENTIDAD_LABEL = Object.fromEntries(ENTIDADES.filter(([value]) => value).map(([value, label]) => [value, label]))

const GRID_AUDITORIA = 'grid min-w-[52rem] grid-cols-[minmax(9rem,1.1fr)_minmax(7rem,0.9fr)_minmax(6rem,0.7fr)_minmax(10rem,1.8fr)_8rem] items-center gap-x-2'
const CELDA_AUD = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

function fechaHora(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${dia} · ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

// El metadata es libre por acción: se muestra como pares legibles y los campos
// técnicos largos (ids) se recortan para que la fila siga siendo de una línea.
const ETIQUETAS = { serial: 'IMEI', serials: 'IMEI', reason: 'Motivo', customer: 'Cliente', customerName: 'Cliente', status: 'Estado', from: 'Antes', to: 'Después', amountPyg: 'Monto', totalPyg: 'Total', minutes: 'Minutos', level: 'Nivel', tags: 'Etiquetas', discountPyg: 'Descuento', method: 'Medio', role: 'Rol', name: 'Nombre', email: 'Correo', action: 'Acción', jobId: 'Trabajo', path: 'Camino', kind: 'Tipo', transport: 'Transporte', transporte: 'Transporte', printerId: 'Impresora', printerName: 'Impresora', bytes: 'Tamaño', attempts: 'Intentos', intentos: 'Intentos', error: 'Error', connection: 'Conexión', destination: 'Destino', width: 'Ancho', copies: 'Copias', count: 'Cantidad', created: 'Creadas', updated: 'Actualizadas', bridges: 'Puentes', validation: 'Validación', isDefault: 'Predeterminada', isActive: 'Activa' }
function detalleDe(metadata) {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '' && typeof valor !== 'object')
    .slice(0, 4)
    .map(([clave, valor]) => `${ETIQUETAS[clave] || clave}: ${String(valor).slice(0, 40)}`)
    .join(' · ')
}

// Eventos del módulo de impresión: se leen en español y con los ids recortados,
// nunca con el JSON crudo del backend (issue #60).
const AREAS_IMPRESION = new Set(['PrintJob', 'PrintBridge', 'PrintPrinter'])
const CAMPOS_IMPRESORA = { name: 'Nombre', brand: 'Marca', model: 'Modelo', location: 'Ubicación', connection: 'Conexión', destination: 'Destino', width: 'Ancho', copies: 'Copias', cut: 'Corte', density: 'Densidad', characters: 'Caracteres', isDefault: 'Predeterminada', isActive: 'Activa', bridgeId: 'Puente' }
const TRANSPORTES = { directo: 'TCP directo', cups: 'Cola CUPS', usb: 'USB', lan: 'LAN' }
const CAMINOS = { REMOTO: 'Remoto', LOCAL: 'Local' }

const idCorto = (valor) => {
  const texto = String(valor ?? '')
  return texto.length > 10 ? `${texto.slice(0, 8)}…` : texto
}

function valorDeImpresora(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (campo === 'connection') return valor === 'lan' ? 'LAN' : valor === 'cups' ? 'CUPS (cola local)' : String(valor)
  if (campo === 'width') return `${valor} mm`
  return String(valor)
}

// Devuelve el resumen de la fila y las líneas del panel abierto. `null` cuando
// no es un evento de impresión (esos siguen con el detalle genérico).
function detalleImpresion(row) {
  if (!AREAS_IMPRESION.has(row.entity)) return null
  const m = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const resumen = []
  const lineas = []
  const agregar = (etiqueta, valor) => {
    if (valor === null || valor === undefined || valor === '') return
    lineas.push([etiqueta, String(valor)])
    resumen.push(`${etiqueta}: ${String(valor)}`)
  }

  if (m.printerName || m.name) agregar('Impresora', m.printerName || m.name)
  else if (m.printerId) agregar('Impresora', idCorto(m.printerId))
  if (m.jobId) agregar('Trabajo', idCorto(m.jobId))
  if (row.action === 'PRINT_DEFAULT_PRINTER_CHANGED') {
    agregar('Antes', m.previousDefaultName || (m.previousDefaultId ? idCorto(m.previousDefaultId) : 'Sin predeterminada'))
    agregar('Después', m.printerName || m.name || '—')
  }
  if (m.connection !== undefined) agregar('Conexión', valorDeImpresora('connection', m.connection))
  if (m.destination) agregar('Destino', m.destination)
  if (m.path) agregar('Camino', CAMINOS[m.path] || m.path)
  if (m.kind) agregar('Tipo', m.kind)
  if (m.transport || m.transporte) {
    const transporte = m.transport || m.transporte
    agregar('Transporte', TRANSPORTES[transporte] || transporte)
  }
  if (m.width) agregar('Ancho', `${m.width} mm`)
  if (m.copies) agregar('Copias', m.copies)
  if (m.bytes) agregar('Tamaño', `${m.bytes} bytes`)
  if (m.attempts || m.intentos) agregar('Intentos', m.attempts || m.intentos)
  if (m.validation) agregar('Validación', m.validation)
  if (m.isDefault !== undefined) agregar('Predeterminada', m.isDefault ? 'Sí' : 'No')
  if (m.isActive !== undefined) agregar('Activa', m.isActive ? 'Sí' : 'No')
  if (m.bridgeId) agregar('Puente', idCorto(m.bridgeId))
  if (m.error) agregar('Error', m.error)
  if (row.action === 'PRINT_PRINTERS_IMPORTED' || row.action === 'PRINT_PRINTER_IMPORTED') {
    agregar('Total', m.total)
    agregar('Creadas', m.created)
    agregar('Actualizadas', m.updated)
    agregar('Puentes', m.bridges)
  }
  if (m.changes && typeof m.changes === 'object') {
    const cambios = Object.entries(m.changes)
      .map(([campo, valores]) => `${CAMPOS_IMPRESORA[campo] || campo}: ${valorDeImpresora(campo, valores?.from)} → ${valorDeImpresora(campo, valores?.to)}`)
      .join(' · ')
    if (cambios) agregar('Cambios', cambios)
  }

  const visible = resumen.slice(0, 4).join(' · ')
  return { resumen: visible, lineas }
}

export default function Auditoria() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hayMas, setHayMas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [entidad, setEntidad] = useState('')
  const [query, setQuery] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (entidad) params.set('entity', entidad)
      if (query.trim()) params.set('q', query.trim())
      const data = await api.get(`/api/audit?${params}`)
      setRows(data); setHayMas(data.length >= 50)
    } catch (cause) { setError(cause?.message || 'No se pudo cargar la auditoría.') } finally { setLoading(false) }
  }, [entidad, query])
  useEffect(() => { load() }, [load])

  const cargarMas = async () => {
    const ultimo = rows[rows.length - 1]?.id
    if (!ultimo || cargandoMas) return
    setCargandoMas(true)
    try {
      const params = new URLSearchParams({ limit: '50', cursor: ultimo })
      if (entidad) params.set('entity', entidad)
      if (query.trim()) params.set('q', query.trim())
      const data = await api.get(`/api/audit?${params}`)
      setRows((actual) => [...actual, ...data]); setHayMas(data.length >= 50)
    } catch { /* se conserva lo cargado */ } finally { setCargandoMas(false) }
  }

  const total = useMemo(() => rows.length, [rows])

  return <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">Auditoría</h2>
          <p className="mt-1 text-sm text-mute">Quién hizo qué y cuándo: ventas, inventario, cobros, equipo y configuración.</p>
        </div>
        <span className="text-xs text-mute">{total}{hayMas ? '+' : ''} movimientos</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Select aria-label="Filtrar por área" className="w-auto" value={entidad} onChange={(event) => setEntidad(event.target.value)}>
          {ENTIDADES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <div className="min-w-[200px] flex-1"><Input aria-label="Buscar en la auditoría" placeholder="Acción o identificador (IMEI, pedido…)" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      </div>
    </Card>

    {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
    {loading && <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
    {!loading && !error && !rows.length && <Card><EmptyState compact icon="clock" title="Sin movimientos para ese filtro." description="Probá con otra área o quitá la búsqueda." /></Card>}
    {!loading && !error && rows.length > 0 && <Card className="p-4">
      <div className="overflow-x-auto" data-testid="auditoria-tabla">
        <div className={cn(GRID_AUDITORIA, 'px-3.5 pb-2 pt-1')}>
          <span className={CELDA_AUD}>Acción</span>
          <span className={CELDA_AUD}>Actor</span>
          <span className={CELDA_AUD}>Área</span>
          <span className={CELDA_AUD}>Detalle</span>
          <span className={cn(CELDA_AUD, 'text-right')}>Fecha</span>
        </div>
        <div className="space-y-1">
          {rows.map((row) => {
            const [label, tone] = ACCIONES[row.action] || [row.action, 'slate']
            const impresion = detalleImpresion(row)
            const detalle = impresion ? impresion.resumen : detalleDe(row.metadata)
            const abierto = abiertos.has(row.id)
            const completo = detalleDe(row.metadata)
            return <div key={row.id}>
              <div
                role="button"
                tabIndex={0}
                data-testid="auditoria-fila"
                onClick={() => setAbiertos(prev => { const next = new Set(prev); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next })}
                onKeyDown={(event) => { if (event.key === 'Enter') setAbiertos(prev => { const next = new Set(prev); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next }) }}
                className={cn(GRID_AUDITORIA, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40', abierto && 'border-fono/40')}
              >
                <span className="min-w-0"><Badge color={tone} className="w-fit max-w-full truncate whitespace-nowrap px-1.5 py-0.5 text-[10px]" title={row.action}>{label}</Badge></span>
                <span className="truncate text-[13px] font-semibold" title={row.user?.name || undefined}>{row.user?.name || 'Sistema'}</span>
                <span className="truncate text-[11px] text-mute" title={row.entity}>{ENTIDAD_LABEL[row.entity] || row.entity}</span>
                <span className="truncate text-[11px] text-mute" title={row.entityId || undefined}>{detalle || row.entityId || '—'}</span>
                <span className="truncate text-right text-[11px] text-mute">{fechaHora(row.createdAt)}</span>
              </div>
              {abierto && <div className="mt-1 space-y-1 rounded-xl border border-ink-600 bg-ink-800/60 p-3 text-xs text-mute">
                <p><span className="font-semibold text-fore">Acción:</span> {row.action}</p>
                <p><span className="font-semibold text-fore">Entidad:</span> {row.entity}{row.entityId ? ` · ${row.entityId}` : ''}</p>
                {impresion
                  ? impresion.lineas.map(([etiqueta, valor]) => <p key={etiqueta}><span className="font-semibold text-fore">{etiqueta}:</span> {valor}</p>)
                  : <>
                    {completo ? <p><span className="font-semibold text-fore">Detalle:</span> {completo}</p> : null}
                    {row.metadata && Object.keys(row.metadata).length > 0 && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink-700/60 p-2 text-[11px]">{JSON.stringify(row.metadata, null, 2)}</pre>}
                  </>}
              </div>}
            </div>
          })}
        </div>
      </div>
      {hayMas && <div className="flex justify-center pt-3"><button type="button" disabled={cargandoMas} onClick={cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{cargandoMas ? 'Cargando…' : 'Cargar más'}</button></div>}
    </Card>}
  </div>
}
