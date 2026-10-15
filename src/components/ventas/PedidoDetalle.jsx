import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PresenciaPedido from './PresenciaPedido'
import RecordHeader from '@/components/app/RecordHeader'
import { Aviso, Badge, Button, ConfirmDialog, Input, MenuDesplegable, Modal, Money, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { descargarArchivo } from '@/utils/descargarArchivo'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import Avatar from '@/components/shared/Avatar'
import PersonaChip from '@/components/shared/PersonaChip'
import SeccionColapsable from '@/components/shared/SeccionColapsable'
import { cn, primerNombre } from '@/lib/utils'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import CreditoPedido from '@/components/ventas/venta/CreditoPedido'
import EntregaPregunta from '@/components/ventas/venta/EntregaPregunta'
import { creditoBloqueaEntrega, preguntaEntregaAplica } from '@/lib/credito'
import { api, apiFetch } from '@/lib/api/client'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { metodoEntrega, opcionesDeEntrega, tonoEntrega } from './venta/entrega'
import { accessUrlFor, FORMATOS_PEDIDO, printDeliveryNote } from '@/components/shared/OrderReceipt'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
import ClienteDelPedidoModal from './ClienteDelPedidoModal'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { configImpresora } from '@/lib/printing/agent'
import { ticketNotaEntrega } from '@/lib/printing/tickets'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { DEMO_MESSAGE_TEMPLATES } from '@/components/customers/customerMessaging'
import { gs } from '@/utils/calculos'
import { useSesion } from '@/lib/sesion'
import { codigoPedido, fechaLegible, pagosDelPedido, totalesPedido } from '@/utils/pedido'
import { getVendedores, listVentas, ventaDesdeApi } from '@/lib/storage'
import PagosPedido from './PagosPedido'
import { consultaDeMencion, insertarMencion, tramosDeMencion } from '@/utils/menciones'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { temaV2Activo } from '@/lib/temaV2'
import './ventasF3.css'

const FULFILLMENT = FULFILLMENT_LABELS
// Pasos del flujo de entrega para la vista previa v2 (#241): agrupa los estados
// reales de `entrega.js` en cuatro pasos visibles por método.
const PASOS_ENTREGA = (deliveryType) => (metodoEntrega(deliveryType) === 'DELIVERY'
  ? [
      ['Pendiente', ['PENDING']],
      ['Preparando', ['PROCESSING', 'READY_TO_SHIP']],
      ['En camino', ['SHIPPED', 'IN_TRANSIT', 'PARTIAL']],
      ['Entregado', ['DELIVERED']],
    ]
  : [
      ['Pendiente', ['PENDING']],
      ['Preparando', ['PROCESSING', 'READY_TO_SHIP']],
      ['Listo para retirar', ['IN_TRANSIT', 'READY_FOR_PICKUP', 'PARTIAL']],
      ['Retirado', ['PICKED_UP']],
    ])
const PAYMENT_TONE = (status) => status === 'Pagado' ? 'green' : status === 'Parcial' ? 'orange' : status === 'Anulado' ? 'slate' : 'red'
const PAYMENT_STATUS = { CONFIRMED: 'Confirmado', PENDING: 'Por verificar', REFUNDED: 'Reembolsado', REJECTED: 'Rechazado' }
const ICONO_MEDIO = { CASH: 'money', DINERO: 'money', TRANSFER: 'transfer', CARD: 'card', CREDIT: 'subscription', STORE_CREDIT: 'wallet', GIFT_CARD: 'wallet', CRYPTO: 'terminal', PIX: 'qr' }
// Los pagos del demo/legado llegan como { monto, medioPago, cuenta, hora }: se
// normalizan a la forma del API. Sin estado se cuentan como confirmados, igual
// que en el listado (orderFields) y en totalesPedido, para que el dinero sea
// el mismo en toda la pantalla.
const normalizarPago = (pago) => ({
  ...pago,
  amountPyg: pago.amountPyg ?? pago.monto ?? 0,
  method: pago.method ?? pago.medioPago,
  status: pago.status ?? 'CONFIRMED',
  accountSnapshot: pago.accountSnapshot || (pago.cuenta ? { name: pago.cuenta } : undefined),
})
const AUDIT_LABELS = {
  ORDER_FULFILLMENT_UPDATED: (meta) => `Entrega: ${FULFILLMENT[meta?.previous] || meta?.previous || '—'} → ${FULFILLMENT[meta?.current] || meta?.current || '—'}`,
  ORDER_SERIALS_ATTACHED: (meta) => `IMEI agregados al pedido: ${(meta?.serials || []).join(', ')}`,
  ORDER_BILLING_UPDATED: (meta) => meta?.billingName ? `Factura a nombre de ${meta.billingName}` : 'Datos de factura actualizados',
  ORDER_DISCOUNT_APPROVED: (meta) => <>Descuento aprobado: <Money value={Number(meta?.discountPyg || 0)} /></>,
  ORDER_DISCOUNT_AUTHORIZED: (meta) => <>Descuento autorizado: <Money value={Number(meta?.discountPyg || 0)} /> (máx. <Money value={Number(meta?.maxDiscountPyg || 0)} />)</>,
  ORDER_PRICE_AUTHORIZED: (meta) => <>Precio bajo lista autorizado: <Money value={Number(meta?.belowListPyg || 0)} /></>,
  ORDER_CUSTOMER_CHANGED: (meta) => `Cliente: ${meta?.previousCustomerName || 'ocasional'} → ${meta?.customerName || '—'}`,
  ORDER_CUSTOMER_REMOVED: (meta) => `Cliente quitado${meta?.previousCustomerName ? `: ${meta.previousCustomerName}` : ''} · el pedido queda como ocasional`,
  ORDER_CUSTOMER_CREATED: (meta) => `Ficha creada desde el pedido: ${meta?.customerName || ''}${meta?.matched ? ' (coincidía con una ficha existente)' : ''}`,
  ORDER_VOIDED: (meta) => `Pedido anulado${meta?.reason ? `: ${meta.reason}` : ''}${Number(meta?.restoredUnits || 0) > 0 ? ` · ${meta.restoredUnits} unidad(es) repuestas` : ''}`,
  ORDER_DELIVERED_UNPAID: (meta) => `Entrega con saldo autorizada${Number(meta?.pendingPyg || 0) > 0 ? ` · saldo ${gs(Number(meta.pendingPyg))}` : ''}`,
  ORDER_CREDIT_HELD: (meta) => <>Pendiente de autorización de crédito: supera el límite en <Money value={Number(meta?.overPyg || 0)} /></>,
  ORDER_CREDIT_AUTHORIZED: (meta) => <>Crédito autorizado por {meta?.approverName || 'gerencia'}{meta?.via === 'PIN' ? ' (con PIN)' : ''}: <Money value={Number(meta?.overPyg || 0)} /> sobre el límite</>,
  ORDER_CREDIT_REJECTED: (meta) => `Crédito rechazado por ${meta?.approverName || 'gerencia'}${meta?.note ? `: ${meta.note}` : ''}`,
  ORDER_TAGS_UPDATED: (meta) => (meta?.tags || []).length ? `Etiquetas: ${meta.tags.join(', ')}` : 'Etiquetas quitadas',
  ORDER_ARCHIVED: () => 'Pedido archivado',
  ORDER_UNARCHIVED: () => 'Pedido desarchivado',
  INVENTORY_UNITS_SOLD: (meta) => `Equipos vendidos: ${(meta?.serials || []).join(', ')}`,
  ORDER_NOTIFIED_WHATSAPP: () => 'Aviso enviado al cliente por WhatsApp',
  ORDER_OFFLINE_SYNCED: (meta) => `Venta sincronizada sin conexión${Number(meta?.stockFaltante || 0) > 0 ? ` · faltó stock de ${meta.stockFaltante} unidad(es)` : ''}${Number(meta?.sinImei || 0) > 0 ? ` · ${meta.sinImei} equipo(s) sin IMEI` : ''}`,
  ORDER_COMMENTED: () => 'Comentario agregado',
}

function nombreActor(name) {
  // Solo el primer nombre (#212): «Dario creó el pedido», no el nombre completo.
  const corto = primerNombre(String(name || '').trim())
  return corto ? corto.charAt(0).toUpperCase() + corto.slice(1) : 'Sistema'
}
// Sin foto, el cliente se muestra con el Avatar compartido (iniciales): no se
// dibuja un avatar propio ni una imagen rota (#164).
function relativeDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hoy = new Date(); const ayer = new Date(Date.now() - 86400000)
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === hoy.toDateString()) return `Hoy ${hora}`
  if (date.toDateString() === ayer.toDateString()) return `Ayer ${hora}`
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) + ` ${hora}`
}
// Quién hizo el movimiento: el usuario real cuando existe; en pagos viejos
// (sin creador guardado) cae al vendedor del pedido antes que a "Sistema".
// Miniatura de una foto de comentario: se descarga con sesión y se muestra
// como vignette; al hacer clic se abre el archivo.
function nombrePago(pago, order) {
  if (pago?.user?.name) return pago.user.name
  if (pago?.createdBy?.name) return pago.createdBy.name
  if (order?.seller?.name) return order.seller.name
  // La fila del listado trae el vendedor como `sellerName` (no como objeto): sin esto salía «Sistema».
  if (order?.sellerName) return order.sellerName
  return ''
}

function PhotoThumb({ orderId, commentId, photo }) {
  const [url, setUrl] = useState('')
  // Si el archivo llega dañado (o el blob no es una imagen), se muestra un
  // marcador en vez de la imagen rota con el nombre del archivo encima (#164).
  const [rota, setRota] = useState(false)
  useEffect(() => {
    let active = true; let objectUrl = ''
    apiFetch(`/api/orders/${encodeURIComponent(orderId)}/comments/${encodeURIComponent(commentId)}/photos/${encodeURIComponent(photo.id)}`)
      .then(response => { if (!response.ok) throw new Error('sin foto'); return response.blob() })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [orderId, commentId, photo.id])
  if (photo.mimeType === 'application/pdf') {
    return <button type="button" className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2 py-1.5 text-xs text-fono-light" onClick={() => url && window.open(url, '_blank')}><Icon name="report" className="h-3.5 w-3.5" /> {photo.fileName}</button>
  }
  if (!url) return <Skeleton className="h-16 w-16 rounded-lg bg-ink-700" />
  return (
    <button type="button" onClick={() => window.open(url, '_blank')} className="overflow-hidden rounded-lg border border-ink-600 transition hover:border-fono">
      {rota
        ? <span className="grid h-16 w-16 place-items-center text-mute" title={photo.fileName}><Icon name="image" className="h-4 w-4" /></span>
        : <img src={url} alt={photo.fileName} onError={() => setRota(true)} className="h-16 w-16 object-cover" />}
    </button>
  )
}

const NIVELES_ACCESO = [['rapido', 'Rápido'], ['completo', 'Completo'], ['detallado', 'Detallado']]

export default function PedidoDetalle({ row, esDemo, customerOrderCount = 0, onClose, onChanged, pagina = false, navegacion = null, abrirCobro = false }) {
  const toast = useToast()
  const navigate = useNavigate()
  const ubicacion = useLocation()
  const { usuario, vendedores, sesion } = useSesion()
  // Autorización de crédito: en la demo no hay recarga, así que el resultado se guarda acá.
  const [creditoLocal, setCreditoLocal] = useState(null)
  // «¿El cliente ya se llevó el producto?»: solo justo después de vender (el POS navega con la marca).
  const [preguntaEntrega, setPreguntaEntrega] = useState(Boolean(ubicacion.state?.preguntaEntrega))
  const [accesos, setAccesos] = useState({})
  const [accesoBusy, setAccesoBusy] = useState(false)
  const [accesoMsg, setAccesoMsg] = useState('')
  const [comprobante, setComprobante] = useState(false)
  // Cobrar el saldo pendiente sin salir del detalle (mismo modal que Cobranzas).
  const [cobroAbierto, setCobroAbierto] = useState(Boolean(abrirCobro))
  // Nota del pedido editable desde el detalle (#21).
  const [notaOpen, setNotaOpen] = useState(false)
  const [notaTexto, setNotaTexto] = useState('')
  const [detail, setDetail] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(!esDemo)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [comentario, setComentario] = useState('')
  // Menciones internas: "@Nombre" avisa a quien corresponde (el equipo sale de
  // la lista de usuarios de la tienda).
  // El equipo sale del contexto de la empresa (lo ven todos los roles) y, si
  // está hidratado, se completa con los usuarios de la tienda.
  const nombresEquipo = useMemo(() => {
    const delContexto = Array.isArray(vendedores) ? vendedores.map((v) => v.nombre || v.name) : []
    const deLaTienda = getVendedores().map((v) => v.nombre)
    return [...new Set([...delContexto, ...deLaTienda, sesion?.nombre].filter(Boolean))]
  }, [vendedores, sesion?.nombre])
  const consultaMencion = consultaDeMencion(comentario)
  const sugerenciasMencion = consultaMencion === null
    ? []
    : nombresEquipo.filter((nombre) => nombre.toLowerCase().includes(consultaMencion.toLowerCase())).slice(0, 5)
  const [adjunto, setAdjunto] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [avisando, setAvisando] = useState(false)
  // Anulación del pedido: gerencia la ejecuta directo; el vendedor necesita
  // una autorización ORDER_VOID aprobada para ese pedido.
  const [anularOpen, setAnularOpen] = useState(false)
  const [anularMotivo, setAnularMotivo] = useState('')
  const [anularError, setAnularError] = useState('')
  const [anularBusy, setAnularBusy] = useState(false)
  const [anularAuth, setAnularAuth] = useState(null)
  const [anularVersion, setAnularVersion] = useState(0)
  // Entrega con saldo: si el cliente no tiene crédito, gerencia ejecuta directo
  // y el vendedor necesita una autorización ORDER_DELIVER_UNPAID aprobada.
  const [entregaOpen, setEntregaOpen] = useState(false)
  const [entregaMotivo, setEntregaMotivo] = useState('')
  const [entregaError, setEntregaError] = useState('')
  const [entregaBusy, setEntregaBusy] = useState(false)
  const [entregaAuth, setEntregaAuth] = useState(null)
  const [entregaVersion, setEntregaVersion] = useState(0)
  const puedeAnular = Boolean(usuario && (['ADMIN', 'GERENTE'].includes(usuario.role) || usuario.permissions?.includes('orders:manage')))
  // Cliente ocasional (#149): asignar/cambiar la ficha y crear una desde el pedido.
  const [clienteModal, setClienteModal] = useState(null)
  const [quitarCliente, setQuitarCliente] = useState(false)
  const fileRef = useRef(null)
  // `order` se declara antes de los efectos: usarlo en un array de
  // dependencias después de su declaración es TDZ y rompía la vista en
  // producción ("Cannot access 'I' before initialization").
  const order = detail || row

  const load = useCallback(async () => {
    if (esDemo) {
      // Demo: el cobro de saldo y las correcciones escriben en la venta local; el detalle
      // vuelve a leerla para que Pagado/Saldo no queden con la foto vieja de la fila.
      const viva = listVentas().find(venta => venta.id === row.id)
      setDetail(viva ? { ...row, payments: viva.pagos, pagos: viva.pagos, totalPagado: viva.totalPagado, totalPendiente: viva.totalPendiente, estadoPago: viva.estadoPago } : row)
      setLoading(false); return
    }
    setLoading(true); setError('')
    try {
      const [full, history] = await Promise.all([
        api.get(`/api/orders/${encodeURIComponent(row.id)}`),
        api.get(`/api/orders/${encodeURIComponent(row.id)}/history`).catch(() => ({ events: [] })),
      ])
      setDetail(full); setEvents(history?.events || [])
    } catch (cause) { setError(cause?.message || 'No se pudo cargar el pedido.') } finally { setLoading(false) }
  }, [row, esDemo])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!esDemo && order?.id) cargarAccesos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, esDemo])

  const items = order.items || []
  const itemsCantidad = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
  const nombreCliente = order.customer?.name || (typeof order.customer === 'string' ? order.customer : '') || 'Consumidor final'
  const payments = useMemo(() => pagosDelPedido(order).map(normalizarPago), [order])
  const pagosPorVerificar = payments.filter(pago => pago.status === 'PENDING')
  // Pagado/Saldo: la misma función que el listado, la ficha del cliente y el comprobante (#461).
  const { total, pagado: paid, pendiente } = totalesPedido(order)
  const credito = creditoLocal ?? order.creditAuthorization ?? null
  const creditoRetiene = creditoBloqueaEntrega({ creditAuthorization: credito })
  const clienteConCredito = Number(order.customer?.creditLimitPyg || 0) > 0 && Number(order.customer?.creditDays || 0) > 0
  const anulado = order.status === 'CANCELLED'
  const estadoPago = anulado ? 'Anulado' : (paid >= total && total > 0 ? 'Pagado' : (Number(order.creditDays || 0) > 0 && pendiente > 0 ? 'A crédito' : paid > 0 ? 'Parcial' : 'Pendiente'))
  // Vista previa v2 (#241): el detalle suma el stepper del flujo de entrega.
  const v2 = temaV2Activo()
  const tags = Array.isArray(order.tags) ? order.tags : []
  const archivado = Boolean(order.archivedAt)
  // Cronología para el comprobante detallado: el mismo timeline que se ve en la
  // página, en el formato que espera el comprobante (creación, pagos y cambios
  // de entrega). Así el papel no depende de un segundo viaje al backend.
  const timelineComprobante = useMemo(() => events.map(evento => {
    if (evento.type === 'created') return { type: 'created', at: evento.at }
    if (evento.type === 'payment') return { type: 'payment', at: evento.at, amountPyg: Number(evento.payment?.amountPyg || 0), methodLabel: ETIQUETAS_MEDIO_PAGO[evento.payment?.method] || evento.payment?.method, account: evento.payment?.accountSnapshot?.name || null }
    if (evento.type === 'audit' && evento.action === 'ORDER_FULFILLMENT_UPDATED') return { type: 'fulfillment', at: evento.at, metadata: evento.metadata }
    return null
  }).filter(Boolean), [events])
  // Referencia estable: el comprobante reconstruye su HTML cuando cambia el
  // documento, y un objeto nuevo en cada render lo dejaba en «Preparando…».
  const ordenComprobante = useMemo(() => ({ ...order, timeline: timelineComprobante }), [order, timelineComprobante])
  const contextoWhatsApp = {
    cliente: order.customer?.name || 'cliente',
    nombre: order.customer?.name || 'cliente',
    pedido: order.orderNumber || '',
    total: gs(total),
    saldo_pendiente: gs(pendiente),
    sucursal: order.branch?.name || '',
    vendedor: order.seller?.name || '',
    fecha: order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-PY') : '',
  }

  async function avisarPorWhatsApp() {
    if (avisando || esDemo) return
    setAvisando(true); setError('')
    try {
      const payload = await api.get(`/api/orders/${encodeURIComponent(order.id)}/whatsapp-message`)
      if (payload?.whatsappUrl) window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer')
      await api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: 'markNotified' })
      await load(); onChanged?.()
    } catch (cause) { setError(cause?.message || 'No se pudo preparar el aviso.') } finally { setAvisando(false) }
  }
  // Envío con plantilla elegida: el API arma el mensaje con las variables del
  // pedido, lo marca como avisado y devuelve el enlace definitivo de WhatsApp.
  async function enviarPlantilla({ template }) {
    const payload = await api.post(`/api/orders/${encodeURIComponent(order.id)}/whatsapp-message`, { templateKey: template.key })
    await load(); onChanged?.()
    return payload?.whatsappUrl || ''
  }

  async function accion(operation, success) {
    if (busy || esDemo) return
    setBusy(true); setError('')
    try { await operation(); toast.success(success); await load(); onChanged?.() } catch (cause) { setError(cause?.message || 'No se pudo actualizar el pedido.') } finally { setBusy(false) }
  }
  async function cargarAccesos() {
    if (esDemo || !order?.id) return
    try {
      const data = await api.get(`/api/orders/${encodeURIComponent(order.id)}/access-tokens`)
      setAccesos(Object.fromEntries((data.tokens || []).map(token => [token.level, token.token])))
    } catch { /* sin permisos o sin red: se generan a demanda */ }
  }
  async function generarAcceso(level, regenerate) {
    if (esDemo || !order?.id) return
    setAccesoBusy(true); setAccesoMsg('')
    try {
      const data = await api.post(`/api/orders/${encodeURIComponent(order.id)}/access-tokens`, { level, regenerate })
      setAccesos(current => ({ ...current, [level]: data.token }))
      setAccesoMsg(regenerate ? 'Enlace regenerado: el anterior ya no funciona.' : 'Enlace listo para compartir.')
    } catch (cause) {
      setAccesoMsg(cause?.message || 'No se pudo preparar el enlace.')
    } finally { setAccesoBusy(false) }
  }
  // «Regenerar acceso QR»: invalida todos los códigos y enlaces vigentes del
  // pedido y emite uno nuevo para el QR del comprobante. Sirve cuando un papel
  // con QR se perdió o se filtró: lo impreso antes deja de abrir la vista.
  async function regenerarAccesoQr() {
    if (esDemo || !order?.id) return
    setAccesoBusy(true); setAccesoMsg('')
    try {
      await api.post(`/api/orders/${encodeURIComponent(order.id)}/access-tokens`, { level: 'rapido', impreso: true, regenerate: true, revokeAll: true })
      setAccesos({})
      setAccesoMsg('Acceso QR regenerado: los códigos y enlaces anteriores ya no funcionan. Imprimí el comprobante de nuevo para entregar el vigente.')
    } catch (cause) {
      setAccesoMsg(cause?.message || 'No se pudo regenerar el acceso QR.')
    } finally { setAccesoBusy(false) }
  }
  function copiarAcceso(token, nivel = '') {
    const url = accessUrlFor(token)
    if (!url) { setAccesoMsg('No se pudo armar el enlace.'); return }
    copiarAlPortapapeles(url).then((ok) => {
      if (ok) toast.success('Enlace copiado', nivel ? `Acceso ${nivel.toLowerCase()} listo para compartir.` : 'Listo para compartir.')
      else setAccesoMsg(url)
    })
  }
  // Nota de entrega: primero la térmica (agente o puente) y solo si el fallo
  // fue claro cae al diálogo con el A4, igual que el comprobante.
  async function imprimirNotaEntrega() {
    const { ancho } = configImpresora()
    const resultado = await imprimirDocumentoNoFiscal(ticketNotaEntrega(order, { ancho }), {
      tipo: 'nota-entrega',
      respaldo: () => printDeliveryNote(order, { format: 'a4' }),
    })
    if (resultado.ok) {
      toast.success(
        resultado.encolado ? 'Nota de entrega encolada' : 'Nota de entrega enviada a la impresora',
        resultado.encolado ? (resultado.remoto ? 'La imprime el puente cuando la reclame.' : 'La impresora no respondió; se reintenta solo.') : '',
      )
      return
    }
    if (resultado.dialogo) return
    toast.error('No se pudo imprimir la nota de entrega', resultado.error || 'Revisá la impresora.')
  }
  const cambiarEntrega = (fulfillmentStatus) => {
    if (creditoRetiene && ['DELIVERED', 'PICKED_UP', 'PARTIAL'].includes(fulfillmentStatus)) {
      setError('Pendiente de autorización de crédito: un administrador o gerente debe autorizar la entrega.')
      return
    }
    if (fulfillmentStatus === 'DELIVERED' && pendiente > 0 && !clienteConCredito && !puedeAnular) {
      setEntregaMotivo(''); setEntregaError(''); setEntregaAuth(null)
      setEntregaVersion(v => v + 1)
      setEntregaOpen(true)
      return
    }
    return accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { fulfillmentStatus }), 'Entrega actualizada.')
  }
  // Con permiso de gestión entrega directo; sin permiso pide la autorización y,
  // cuando está aprobada, ejecuta la entrega consumiéndola una sola vez.
  async function confirmarEntregaConSaldo() {
    const motivo = entregaMotivo.trim()
    if (motivo.length < 3) { setEntregaError('Indicá un motivo de al menos 3 caracteres.'); return }
    setEntregaBusy(true); setEntregaError('')
    try {
      if (entregaAuth) {
        await api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { fulfillmentStatus: 'DELIVERED', deliveryAuthorizationId: entregaAuth.id })
        toast.success('Pedido entregado', 'La entrega con saldo quedó registrada y auditada.')
        setEntregaOpen(false)
        await load(); onChanged?.()
      } else {
        await api.post('/api/authorizations', { kind: 'ORDER_DELIVER_UNPAID', requestedValue: { orderId: order.id, reason: motivo } })
        toast.success('Solicitud enviada', 'Gerencia tiene que autorizar la entrega; después ejecutala desde acá.')
      }
    } catch (cause) { setEntregaError(cause?.message || 'No se pudo registrar la entrega.') } finally { setEntregaBusy(false) }
  }
  const alternarArchivado = () => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: archivado ? 'unarchive' : 'archive' }), archivado ? 'Pedido desarchivado.' : 'Pedido archivado.')
  const guardarTags = (next) => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { tags: next }), 'Etiquetas actualizadas.')
  function abrirAnular() {
    setAnularMotivo('')
    setAnularError('')
    setAnularAuth(null)
    setAnularVersion(v => v + 1)
    setAnularOpen(true)
  }
  // Con permiso de gestión anula directo; sin permiso pide la autorización y,
  // cuando está aprobada, ejecuta POST /void consumiéndola.
  async function confirmarAnular() {
    const motivo = anularMotivo.trim()
    if (motivo.length < 3) { setAnularError('Indicá un motivo de al menos 3 caracteres.'); return }
    setAnularBusy(true); setAnularError('')
    try {
      if (puedeAnular || anularAuth) {
        await api.post(`/api/orders/${encodeURIComponent(order.id)}/void`, { reason: motivo, ...(anularAuth && !puedeAnular ? { authorizationId: anularAuth.id } : {}) })
        toast.success('Pedido anulado.', 'Las unidades vendidas volvieron a stock; los pagos quedan registrados.')
      } else {
        await api.post('/api/authorizations', { kind: 'ORDER_VOID', requestedValue: { orderId: order.id, kind: 'full', reason: motivo } })
        toast.success('Solicitud enviada', 'Gerencia tiene que autorizar la anulación; después ejecutala desde acá.')
      }
      setAnularOpen(false)
      await load(); onChanged?.()
    } catch (cause) { setAnularError(cause?.message || 'No se pudo anular el pedido.') } finally { setAnularBusy(false) }
  }
  // Descarga autenticada del comprobante de un pago (el endpoint exige sesión):
  // se pide el binario y se ofrece como archivo local, igual que en pagos.
  async function descargarComprobante(paymentId, proof) {
    try {
      const response = await apiFetch(`/api/payments/${encodeURIComponent(paymentId)}/proofs/${encodeURIComponent(proof.id)}`)
      if (!response.ok) throw new Error('No se pudo descargar el comprobante.')
      const blob = await response.blob()
      descargarArchivo(proof.fileName || 'comprobante', blob)
    } catch (cause) { setError(cause?.message || 'No se pudo descargar el comprobante.') }
  }
  async function enviarComentario(event) {
    event.preventDefault()
    if (subiendo || esDemo) return
    if (!comentario.trim() && !adjunto) return
    setSubiendo(true); setError('')
    try {
      const form = new FormData()
      if (comentario.trim()) form.append('body', comentario.trim())
      if (adjunto) form.append('file', adjunto)
      await api.post(`/api/orders/${encodeURIComponent(order.id)}/comments`, form)
      setComentario(''); setAdjunto(null); if (fileRef.current) fileRef.current.value = ''
      await load(); onChanged?.()
    } catch (cause) { setError(cause?.message || 'No se pudo guardar el comentario.') } finally { setSubiendo(false) }
  }

  const cuerpo = (
    <>
      {loading && !detail && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {error && <Aviso tono="error" className="mb-4 rounded-xl">{error}</Aviso>}
      {(!loading || detail) && (
        <div className="ventas-f3-page" data-testid="pedido-pagina-f3">
          <div className="ventas-f3-page-main">
            {credito && (
              <CreditoPedido
                order={order}
                credito={credito}
                esDemo={esDemo}
                sesion={sesion}
                puedeResolver={['ADMIN', 'GERENTE'].includes(usuario?.role) || (esDemo && ['dueno', 'ADMIN', 'GERENTE'].includes(sesion?.rol))}
                onCambio={(siguiente) => {
                  setCreditoLocal(siguiente)
                  if (!esDemo) { load(); onChanged?.() } else onChanged?.()
                }}
              />
            )}
            {preguntaEntrega && !loading && !anulado && preguntaEntregaAplica({ ...order, creditAuthorization: credito }) && (
              <EntregaPregunta
                order={order}
                esDemo={esDemo}
                onEntregado={(estado) => {
                  setPreguntaEntrega(false)
                  if (esDemo) { setDetail({ ...order, fulfillmentStatus: estado }); onChanged?.() } else { load(); onChanged?.() }
                  toast.success('Pedido retirado', 'Quedó marcado como retirado.')
                }}
                onNoTodavia={() => setPreguntaEntrega(false)}
              />
            )}
            {(order.isSpecialOrder || order.assignedTo?.name || order.offlineSyncedAt || order.billingName) && (
              <div className="flex flex-wrap items-center gap-2">
                {order.isSpecialOrder && (
                  <Badge color="orange">
                    Pedido especial
                    {order.expectedAt && !Number.isNaN(new Date(order.expectedAt).getTime())
                      ? ` · esperado ${new Date(order.expectedAt).toLocaleDateString('es-PY')}`
                      : ''}
                  </Badge>
                )}
                {order.assignedTo?.name && <Badge color="blue">Reparto: {order.assignedTo.name}</Badge>}
                {order.offlineSyncedAt && <Badge color="orange">Sincronizada sin conexión · revisar stock</Badge>}
                {order.billingName && <Badge color="blue">Factura: {order.billingName}</Badge>}
              </div>
            )}

            {/* Artículos */}
            <section className="ventas-f3-detail-section" data-testid="pedido-articulos">
              <h3 className="ventas-f3-card-title"><Icon name="box" className="h-3.5 w-3.5" /> Artículos preparados <span className="ventas-f3-card-sub">{items.length ? `${itemsCantidad} artículo${itemsCantidad === 1 ? '' : 's'}` : ''}</span></h3>
              <div className="divide-y divide-ink-600/70 px-3 pb-1">
                {items.map((item, index) => {
                  const serials = Array.isArray(item.serials) ? item.serials : []
                  return (
                    <article key={item.id || index} className="ventas-f3-detail-item py-2">
                      <div className="min-w-0">
                        <p className="ventas-f3-name">{item.description}</p>
                        {serials.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{serials.map(serial => <span key={serial} className="rounded border border-fono/25 bg-fono/10 px-1.5 py-0.5 font-mono text-[11px] text-fono-light">IMEI {serial}</span>)}</p>}
                        {(item.costPending || Number(item.serialsPending || 0) > 0 || Number(item.stockPending || 0) > 0) && <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-warn">{Number(item.serialsPending || 0) > 0 && <span>{item.serialsPending} sin IMEI (sobre pedido)</span>}{Number(item.stockPending || 0) > 0 && <span>{item.stockPending} sobre pedido</span>}{item.costPending && <span>costo pendiente</span>}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums"><Money value={Number(item.totalPyg ?? 0)} /></p>
                        <p className="text-[11px] text-mute tabular-nums"><Money value={Number(item.unitPricePyg ?? 0)} /> × {item.quantity || 1}{Number(item.discountPyg || 0) > 0 ? <> · −<Money value={item.discountPyg} /></> : ''}</p>
                      </div>
                    </article>
                  )
                })}
                {!items.length && <p className="py-3 text-sm text-mute">Sin artículos detallados.</p>}
              </div>
            </section>

            {/* Información de pago */}
            <section className="ventas-f3-detail-section" data-testid="pedido-pago">
              <h3 className="ventas-f3-card-title"><Icon name="wallet" className="h-3.5 w-3.5" /> Información de pago</h3>
              <div className="space-y-1 px-3 pb-3 text-sm">
                <p className="flex justify-between gap-3"><span className="text-mute">Subtotal · {itemsCantidad} artículo{itemsCantidad === 1 ? '' : 's'}</span><span className="tabular-nums"><Money value={Number(order.subtotalPyg ?? total)} /></span></p>
                {Number(order.discountPyg || 0) > 0 && <p className="flex justify-between gap-3 text-warn"><span>Descuento</span><span className="tabular-nums">− <Money value={order.discountPyg} /></span></p>}
                {Number(order.deliveryPyg || 0) > 0 && <p className="flex justify-between gap-3"><span className="text-mute">Envío</span><span className="tabular-nums"><Money value={order.deliveryPyg} /></span></p>}
                <dl className="ventas-f3-detail-totals" data-testid="pedido-totales-f3">
                  <div><dt>Total</dt><dd className="ventas-f3-money">{gs(total)}</dd></div>
                  <div><dt>Pagado</dt><dd className="ventas-f3-money text-ok">{gs(paid)}</dd></div>
                  <div><dt>{pendiente > 0 && Number(order.creditDays || 0) > 0 ? `Saldo · plazo ${order.creditDays} días` : 'Saldo'}</dt><dd className={cn('ventas-f3-money', pendiente > 0 && 'text-warn')}>{gs(pendiente)}</dd></div>
                </dl>
                {pendiente > 0 && order.dueAt && <p className="text-xs text-mute">Vence {new Date(order.dueAt).toLocaleDateString('es-PY')}</p>}
                {!anulado && pendiente > 0 && <Button className="mt-1 w-full sm:w-auto" onClick={() => setCobroAbierto(true)}>Cobrar saldo · {gs(pendiente)}</Button>}
              </div>
              {payments.length > 0 && <div className="space-y-2 border-t border-ink-600 px-3 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Transacciones ({payments.length})</p>
                {payments.map(pago => {
                  const medio = ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method || 'Pago'
                  const cuando = pago.createdAt || pago.date || pago.fecha ? relativeDate(pago.createdAt || pago.date || pago.fecha) : (pago.hora ? `Hoy ${pago.hora}` : relativeDate(order.createdAt || order.date))
                  return (
                    <div key={pago.id} data-testid="pedido-transaccion" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-ink-600 text-mute" aria-hidden="true"><Icon name={ICONO_MEDIO[pago.method] || 'money'} className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0">
                          <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-fore">{medio}{pago.accountSnapshot?.name ? ` · ${pago.accountSnapshot.name}` : ''}{pago.reference ? ` · ${pago.reference}` : ''}</span>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-mute">{cuando && <span>{cuando}</span>}{nombrePago(pago, order) && <span className="flex items-center gap-1"><PersonaChip user={pago.user || { name: nombrePago(pago, order) }} size="sm" nombre={false} />{nombreActor(nombrePago(pago, order))}</span>}{pago.settlesAt && <span>acredita {new Date(pago.settlesAt).toLocaleDateString('es-PY')}</span>}</span>
                        </span>
                      </span>
                      <Badge color={pago.status === 'CONFIRMED' ? 'green' : pago.status === 'PENDING' ? 'orange' : 'slate'}>{PAYMENT_STATUS[pago.status] || pago.status || 'Confirmado'}</Badge>
                      <span className="ml-auto min-w-24 text-right text-sm font-semibold tabular-nums"><Money value={Number(pago.amountPyg || 0)} /></span>
                    </div>
                  )
                })}
                {pagosPorVerificar.length > 0 && <p className="text-[11px] text-warn">«Pagado» suma solo los pagos confirmados; {pagosPorVerificar.length} pago{pagosPorVerificar.length === 1 ? '' : 's'} por verificar ({gs(pagosPorVerificar.reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0))}) no descuentan el saldo todavía.</p>}
              </div>}
            </section>

            {/* Comprobantes de pago: archivos adjuntos a cada cobro */}
            {payments.some(pago => (pago.proofs || []).length > 0) && (
              <SeccionColapsable className="ventas-f3-detail-section" id={`pedido-${order.id}-comprobantes`} titulo="Comprobantes" icono="report" resumen={`${payments.reduce((sum, pago) => sum + (pago.proofs || []).length, 0)} archivo(s) de pago`}>
                <div className="space-y-3">
                  {payments.filter(pago => (pago.proofs || []).length > 0).map(pago => (
                    <div key={pago.id}>
                      <p className="text-xs text-mute">{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method} · <Money value={Number(pago.amountPyg || 0)} /></p>
                      <ul className="mt-1 space-y-1">
                        {(pago.proofs || []).map(proof => (
                          <li key={proof.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2 text-xs">
                            <span className="flex min-w-0 items-center gap-2"><Icon name="report" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{proof.fileName}</span><span className="shrink-0 text-mute">{Math.max(1, Math.round((proof.sizeBytes || 0) / 1024))} KB</span></span>
                            <button type="button" className="font-semibold text-fono-light hover:underline" onClick={() => descargarComprobante(pago.id, proof)}>Descargar</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </SeccionColapsable>
            )}

            {/* Cronología */}
            <SeccionColapsable className="ventas-f3-detail-section" id={`pedido-${order.id}-cronologia`} titulo="Cronología" icono="clock" resumen={events.length ? `${events.length} movimiento${events.length === 1 ? '' : 's'}` : 'Sin movimientos'}>
              {esDemo && <p className="text-sm text-mute">La cronología con comentarios y fotos está disponible con una cuenta real.</p>}
              {!esDemo && (
                <>
                  <form onSubmit={enviarComentario} className="mt-3 space-y-2">
                    <Textarea aria-label="Comentario del pedido" rows={2} maxLength={2000} value={comentario} onChange={event => setComentario(event.target.value)} placeholder="Escribí un comentario para el equipo… Usá @ para mencionar" className="rounded-xl px-3 py-2 text-sm" />
                    {sugerenciasMencion.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-mute">Mencionar:</span>
                        {sugerenciasMencion.map((nombre) => (
                          <button
                            key={nombre}
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); setComentario((texto) => insertarMencion(texto, nombre)) }}
                            className="rounded-full border border-fono/30 bg-fono/10 px-2.5 py-1 text-xs font-semibold text-fono-light transition hover:bg-fono/20"
                          >
                            @{nombre}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-mute transition hover:border-fono hover:text-fore">
                        <Icon name="image" className="h-3.5 w-3.5" />{adjunto ? adjunto.name : 'Adjuntar foto o PDF'}
                        <AttachmentInput inputRef={fileRef} className="hidden" onSelect={file => { setAdjunto(file); setError('') }} onError={setError} />
                      </label>
                      <Button type="submit" disabled={subiendo || (!comentario.trim() && !adjunto)}>{subiendo ? 'Enviando…' : 'Comentar'}</Button>
                      <span className="text-[10px] text-mute">Solo tú y otros empleados pueden ver los comentarios.</span>
                    </div>
                  </form>
                  <div className="mt-3 space-y-3">
                    {events.map(event => <article key={`${event.type}-${event.id}`} className="flex gap-3">
                      <PersonaChip user={event.user || { name: 'Sistema' }} picture={event.user?.picture} size="sm" nombreCorto textoClassName="text-xs" title={event.user?.name || 'Sistema'}>
                        · {relativeDate(event.at)}
                      </PersonaChip>
                      <div className="min-w-0 flex-1">
                        {event.type === 'comment' && <>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{tramosDeMencion(event.body, nombresEquipo).map((tramo, indice) => tramo.mencion ? <span key={indice} className="font-semibold text-fono-light">{tramo.texto}</span> : <span key={indice}>{tramo.texto}</span>)}</p>
                          {(event.photos || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{event.photos.map(photo => <PhotoThumb key={photo.id} orderId={order.id} commentId={event.id} photo={photo} />)}</div>}
                        </>}
                        {event.type === 'payment' && <p className="mt-1 text-sm text-mute">{ETIQUETAS_MEDIO_PAGO[event.payment.method] || event.payment.method} · <b className="text-fore"><Money value={Number(event.payment.amountPyg || 0)} /></b> · {PAYMENT_STATUS[event.payment.status] || event.payment.status}{event.payment.accountSnapshot?.name ? ` · ${event.payment.accountSnapshot.name}` : ''}{event.payment.reference ? ` · ${event.payment.reference}` : ''}</p>}
                        {event.type === 'audit' && <p className="mt-1 text-sm text-mute">{AUDIT_LABELS[event.action]?.(event.metadata) || 'Movimiento del pedido'}</p>}
                        {event.type === 'created' && <p className="mt-1 text-sm text-mute">Pedido creado.</p>}
                      </div>
                    </article>)}
                    {!events.length && <p className="text-sm text-mute">Todavía no hay movimientos.</p>}
                  </div>
                </>
              )}
            </SeccionColapsable>
            {/* Acceso del cliente: un enlace privado por nivel de información */}
            {!esDemo && (
              <section className="ventas-f3-detail-section p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={cn('flex items-center gap-2', ROTULO_SECCION)}><Icon name="eye" className="h-3.5 w-3.5" /> Acceso del cliente</h3>
                  <button type="button" disabled={accesoBusy} onClick={regenerarAccesoQr} className="min-h-11 rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-warn hover:text-warn disabled:opacity-60 md:min-h-0">Regenerar acceso QR</button>
                </div>
                <p className="mt-1 text-xs text-mute">Cada nivel tiene su propio enlace privado. Regenerar uno invalida el anterior; «Regenerar acceso QR» invalida además los QR ya impresos y los enlaces compartidos.</p>
                <div className="mt-3 space-y-2">
                  {NIVELES_ACCESO.map(([level, label]) => {
                    const token = accesos[level]
                    return (
                      <div key={level} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2 text-xs">
                        <span className="font-semibold">{label}</span>
                        <span className="flex flex-wrap items-center gap-3">
                          {token ? (
                            <>
                              <button type="button" className="inline-flex min-h-11 -my-2 items-center font-semibold text-fono-light hover:underline" onClick={() => copiarAcceso(token, label)}>Copiar enlace</button>
                              <button type="button" className="inline-flex min-h-11 -my-2 items-center text-mute hover:text-warn" disabled={accesoBusy} onClick={() => generarAcceso(level, true)}>Regenerar</button>
                            </>
                          ) : (
                            <button type="button" className="inline-flex min-h-11 -my-2 items-center font-semibold text-fono-light hover:underline" disabled={accesoBusy} onClick={() => generarAcceso(level, false)}>Generar enlace</button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {accesoMsg && <p role="status" className="mt-2 text-xs text-fono-light">{accesoMsg}</p>}
              </section>
            )}

          </div>

          <aside className="ventas-f3-page-side" aria-label="Información del pedido" data-testid="pedido-lateral">
            {/* Notas */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-notas">
              <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="edit" className="h-3.5 w-3.5" /> Notas</h3>
              {order.notes && !notaOpen && <p className="whitespace-pre-wrap text-sm text-fore">{order.notes}</p>}
              {!order.notes && !notaOpen && <p className="text-xs text-mute">Sin notas.</p>}
              {!esDemo && (notaOpen ? (
                <div className="mt-2 space-y-2">
                  <Textarea rows={2} maxLength={2000} value={notaTexto} onChange={(event) => setNotaTexto(event.target.value)} placeholder="Nota interna del pedido" aria-label="Nota del pedido" />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setNotaOpen(false)}>Cancelar</Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { notes: notaTexto }), 'Nota guardada.').then(() => setNotaOpen(false))}
                    >
                      Guardar nota
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-fono-light hover:underline lg:min-h-0" onClick={() => { setNotaTexto(order.notes || ''); setNotaOpen(true) }}>
                  {order.notes ? 'Editar nota' : '＋ Agregar nota'}
                </button>
              ))}
            </section>

            {/* Cliente */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-cliente">
              <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="user" className="h-3.5 w-3.5" /> Cliente</h3>
              <div className="flex items-start gap-2.5">
                <Avatar user={{ name: nombreCliente }} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="ventas-f3-name">{nombreCliente}</p>
                  {customerOrderCount > 0 && <p className="text-xs text-fono-light">{customerOrderCount} pedido{customerOrderCount === 1 ? '' : 's'}</p>}
                  <p className="mt-0.5 break-words text-xs text-mute">{order.customer?.phone ? `${order.customer.countryCode || '+595'} ${order.customer.phone}` : 'Sin teléfono'}</p>
                  {order.customer?.email && <p className="break-all text-xs text-mute">{order.customer.email}</p>}
                  {order.customer?.document && <p className="text-xs text-mute">CI/RUC {order.customer.document}</p>}
                  {order.customer?.id && !esDemo && <Link to={`/clientes?cliente=${encodeURIComponent(order.customer.id)}`} className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-fono-light hover:underline lg:min-h-0" data-testid="pedido-ver-perfil">Ver perfil</Link>}
                </div>
              </div>
              {!esDemo && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {order.customer?.id ? (
                    <>
                      <Button type="button" variant="outline" className="h-9 px-3 text-xs" data-testid="pedido-cambiar-cliente" onClick={() => setClienteModal('asignar')}>Cambiar cliente</Button>
                      <Button type="button" variant="ghost" className="h-9 px-3 text-xs text-warn" data-testid="pedido-quitar-cliente" onClick={() => setQuitarCliente(true)}>Quitar cliente</Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" className="h-9 px-3 text-xs" data-testid="pedido-asignar-cliente" onClick={() => setClienteModal('asignar')}>Asignar cliente</Button>
                      <Button type="button" variant="outline" className="h-9 px-3 text-xs" data-testid="pedido-crear-ficha" onClick={() => setClienteModal('crear')}>Crear ficha</Button>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Entrega y dirección */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-entrega">
              <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="truck" className="h-3.5 w-3.5" /> Entrega</h3>
              <p className="text-xs text-mute">{metodoEntrega(order.deliveryType) === 'DELIVERY' ? 'Delivery' : 'Retiro en tienda'}</p>
              {(order.customer?.addresses || []).map(address => <p key={address.id || address.address} className="mt-1 break-words text-xs text-mute">{address.label}: {address.address}{address.city ? ` · ${address.city}` : ''}</p>)}
              {!order.customer?.addresses?.length && metodoEntrega(order.deliveryType) === 'DELIVERY' && <p className="mt-1 text-xs text-mute">Sin dirección cargada.</p>}
              {/* #461: a dónde y con quién sale el delivery, a la vista del pedido. */}
              {metodoEntrega(order.deliveryType) === 'DELIVERY' && (
                <div className="mt-1.5 space-y-0.5 text-xs" data-testid="pedido-entrega-delivery">
                  {(order.deliveryNotes || order.observacion) && <p className="break-words text-fore">{order.deliveryNotes || order.observacion}</p>}
                  <p className="text-mute">Repartidor: <b className="text-fore">{order.assignedTo?.name || 'Sin asignar'}</b>{order.assignedTo?.name ? '' : ' · se asigna desde Entregas'}</p>
                </div>
              )}
              {v2 && !anulado && (() => {
                const pasos = PASOS_ENTREGA(order.deliveryType)
                const actual = pasos.findIndex(([, estados]) => estados.includes(order.fulfillmentStatus || 'PENDING'))
                return (
                  <ol className="mt-2 grid grid-cols-2 gap-x-2" aria-label="Flujo de entrega">
                    {pasos.map(([paso], indice) => {
                      const activo = indice === actual
                      const hecho = actual > -1 && indice < actual
                      return (
                        <li key={`${paso}-${activo ? 'a' : hecho ? 'h' : 'p'}`} aria-current={activo ? 'step' : undefined} className={cn('flex items-center gap-2 border-b py-1.5 transition-colors duration-300', activo ? 'border-info text-fore' : 'border-ink-600 text-mute')}>
                          <span data-testid={activo ? 'paso-activo' : undefined} className={cn('v2-numero grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', activo && 'mobos-paso-entra', activo ? 'oc-paso-activo' : hecho ? 'bg-ok/15 text-ok' : 'bg-ink-700 text-mute')} aria-hidden>{hecho ? '✓' : indice + 1}</span>
                          <span className="min-w-0 truncate text-xs font-semibold">{paso}</span>
                        </li>
                      )
                    })}
                  </ol>
                )
              })()}
              {row.publicToken && !esDemo && <p className="mt-2 truncate font-mono text-[10px] text-mute">Token público: {order.publicToken || row.publicToken}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!esDemo && !anulado && <Select aria-label="Estado de entrega" className="max-w-full" value={order.fulfillmentStatus || 'PENDING'} disabled={busy || creditoRetiene} title={creditoRetiene ? 'Pendiente de autorización de crédito' : undefined} onChange={event => cambiarEntrega(event.target.value)}>{opcionesDeEntrega(order.deliveryType, order.fulfillmentStatus || 'PENDING').map(value => <option key={value} value={value}>{FULFILLMENT[value] || value}</option>)}</Select>}
                {!esDemo && ['IN_TRANSIT', 'SHIPPED', 'READY_TO_SHIP', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus) && <Button variant={order.notifiedAt || pendiente > 0 ? 'outline' : 'primary'} disabled={avisando} onClick={avisarPorWhatsApp}>{avisando ? 'Preparando…' : order.notifiedAt ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}</Button>}
                {order.customer?.phone && <WhatsAppMenu telefono={order.customer.phone} countryCode={order.customer.countryCode} category="ORDERS" contexto={contextoWhatsApp} onSent={esDemo ? undefined : enviarPlantilla} plantillas={esDemo ? DEMO_MESSAGE_TEMPLATES : undefined} disabled={avisando || busy} title={order.customer?.name} />}
                {order.notifiedAt && <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">Avisado {relativeDate(order.notifiedAt)}</span>}
              </div>
            </section>

            {/* Etiquetas */}
            {!esDemo && (
              <SeccionColapsable className="ventas-f3-detail-section" id={`pedido-${order.id}-etiquetas`} titulo="Etiquetas" icono="tag" resumen={tags.length ? `${tags.length} etiqueta${tags.length === 1 ? '' : 's'}` : 'Sin etiquetas'}>
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map(tag => <button key={tag} type="button" onClick={() => guardarTags(tags.filter(item => item !== tag))} className="group inline-flex items-center gap-1 rounded-full border border-fono/25 bg-fono/10 px-2.5 py-1 text-xs text-fono-light" title="Quitar etiqueta">{tag}<span className="text-mute group-hover:text-bad">×</span></button>)}
                  <form onSubmit={event => { event.preventDefault(); const tag = tagInput.trim(); if (!tag || tags.includes(tag) || tags.length >= 20) return; guardarTags([...tags, tag]); setTagInput('') }} className="flex items-center gap-1">
                    <Input aria-label="Nueva etiqueta" className="h-8 w-36 text-xs" maxLength={40} value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="Busca o crea etiquetas" />
                    <button type="submit" className="rounded-lg p-1.5 text-fono-light hover:bg-fono/10" aria-label="Agregar etiqueta"><Icon name="plus" className="h-4 w-4" /></button>
                  </form>
                </div>
              </SeccionColapsable>
            )}

          </aside>

          {/* Cliente ocasional (#149): asignar/cambiar la ficha o crear una
              desde el pedido, reutilizando el buscador/alta rápida del POS. */}
          <ClienteDelPedidoModal
            open={Boolean(clienteModal)}
            modo={clienteModal || 'asignar'}
            order={order}
            onClose={() => setClienteModal(null)}
            onSaved={() => { setClienteModal(null); load(); onChanged?.() }}
          />
          <ConfirmDialog
            open={quitarCliente}
            onCancel={() => setQuitarCliente(false)}
            onConfirm={() => { setQuitarCliente(false); accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: 'setCustomer', customerId: null }), 'Cliente quitado.') }}
            title="Quitar el cliente del pedido"
            description="El pedido queda como cliente ocasional. La ficha no se borra y el cambio queda en la cronología y la auditoría."
            confirmLabel="Quitar cliente"
          />

        </div>
      )}
      <ComprobantePreview order={ordenComprobante} open={comprobante} onClose={() => setComprobante(false)}  formatos={FORMATOS_PEDIDO} />
      {cobroAbierto && (
        <PagosPedido
          venta={esDemo ? (listVentas().find(venta => venta.id === order.id) || order) : ventaDesdeApi(order)}
          onClose={() => { setCobroAbierto(false); load(); onChanged?.() }}
        />
      )}
      <Modal open={anularOpen} onClose={() => { if (!anularBusy) setAnularOpen(false) }} title="Anular pedido" size="formulario">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {order.orderNumber ? `${codigoPedido(order.orderNumber)} · ` : ''}
            {puedeAnular
              ? 'El pedido queda anulado y las unidades vendidas vuelven a stock. Los pagos no se reembolsan automáticamente.'
              : 'Gerencia tiene que autorizar la anulación antes de ejecutarla.'}
          </p>
          <Textarea rows={3} maxLength={500} value={anularMotivo} onChange={event => setAnularMotivo(event.target.value)} placeholder="Indicá el motivo de la anulación (mínimo 3 caracteres)" />
          {!puedeAnular && (
            <AutorizacionBloque
              key={anularVersion}
              kind="ORDER_VOID"
              entity="ORDER"
              entityId={order.id}
              sinMonto
              soloEstado
              titulo="Autorización de anulación"
              descripcion="Pedí la autorización con el motivo; con una aprobada ejecutá la anulación."
              onSelect={setAnularAuth}
              bloqueado={anularBusy}
            />
          )}
          {anularError && <Aviso tono="error" compact>{anularError}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAnularOpen(false)} disabled={anularBusy}>Cancelar</Button>
            <Button type="button" onClick={confirmarAnular} disabled={anularBusy || anularMotivo.trim().length < 3}>
              {anularBusy ? 'Anulando…' : puedeAnular || anularAuth ? 'Anular pedido' : 'Solicitar autorización'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={entregaOpen} onClose={() => { if (!entregaBusy) setEntregaOpen(false) }} title="Entregar con saldo pendiente" size="formulario">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {order.orderNumber ? `${codigoPedido(order.orderNumber)} · ` : ''}
            El pedido tiene un saldo de {gs(pendiente)} y el cliente no tiene crédito habilitado. Gerencia tiene que autorizar la entrega antes de ejecutarla.
          </p>
          <Textarea rows={3} maxLength={500} value={entregaMotivo} onChange={event => setEntregaMotivo(event.target.value)} placeholder="Indicá el motivo de la entrega con saldo (mínimo 3 caracteres)" />
          <AutorizacionBloque
            key={entregaVersion}
            kind="ORDER_DELIVER_UNPAID"
            entity="ORDER"
            entityId={order.id}
            sinMonto
            soloEstado
            titulo="Autorización de entrega"
            descripcion="Pedí la autorización con el motivo; con una aprobada ejecutá la entrega."
            onSelect={setEntregaAuth}
            bloqueado={entregaBusy}
          />
          {entregaError && <Aviso tono="error" compact>{entregaError}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEntregaOpen(false)} disabled={entregaBusy}>Cancelar</Button>
            <Button type="button" onClick={confirmarEntregaConSaldo} disabled={entregaBusy || entregaMotivo.trim().length < 3}>
              {entregaBusy ? 'Registrando…' : entregaAuth ? 'Entregar pedido' : 'Solicitar autorización'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )

  // En modo página (URL /pedidos/<id>) el pedido se muestra en exclusiva, con
  // el aviso de quién más lo está viendo. En modo panel, el drawer de siempre.
  if (pagina) {
    return (
      <div className="ventas-f3 ventas-f3-detail space-y-4" data-testid="pedido-detalle-f3">
        <RecordHeader
          backLabel="Pedidos"
          onBack={onClose}
          title={codigoPedido(order.orderNumber || order.number) || 'Pedido'}
          mono
          metaEnLinea
          chip={
            <span className="flex flex-wrap items-center gap-1.5" data-testid="pedido-chips">
              {anulado
                ? <Badge color="red">Anulado</Badge>
                : <>
                    <Badge color={PAYMENT_TONE(estadoPago)}>{estadoPago === 'Pendiente' ? 'Pago pendiente' : estadoPago}</Badge>
                    {creditoRetiene
                      ? <Badge data-testid="estado-credito" color={credito.status === 'REJECTED' ? 'red' : 'orange'}>{credito.status === 'REJECTED' ? 'Crédito rechazado' : 'Pendiente de autorización de crédito'}</Badge>
                      : <Badge key={order.fulfillmentStatus || 'PENDING'} className="mobos-chip-cambia" color={tonoEntrega(order.fulfillmentStatus)}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || 'Pendiente'}</Badge>}
                  </>}
              {archivado && <Badge color="slate">Archivado</Badge>}
            </span>
          }
          meta={[order.createdAt || order.date ? fechaLegible(order.createdAt || order.date) : '', order.branch?.name, order.seller?.name].filter(Boolean).join(' · ')}
          actions={
            <>
              <PresenciaPedido pedidoId={order.id || row?.id} />
              {navegacion && (
                <span className="flex items-center" role="group" aria-label="Pedidos vecinos">
                  <button type="button" data-testid="pedido-anterior" aria-label="Pedido anterior" title="Pedido anterior" disabled={!navegacion.anterior} onClick={() => navegacion.onIr(navegacion.anterior)} className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore disabled:opacity-40 lg:h-9 lg:w-9"><Icon name="chevron" className="h-4 w-4 rotate-90" /></button>
                  <button type="button" data-testid="pedido-siguiente" aria-label="Pedido siguiente" title="Pedido siguiente" disabled={!navegacion.siguiente} onClick={() => navegacion.onIr(navegacion.siguiente)} className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore disabled:opacity-40 lg:h-9 lg:w-9"><Icon name="chevron" className="h-4 w-4 -rotate-90" /></button>
                </span>
              )}
              {!esDemo && !anulado && <Button type="button" variant="outline" data-testid="pedido-devolver" onClick={() => setCobroAbierto(true)}>Devolver</Button>}
              <Button type="button" variant="outline" aria-label="Imprimir comprobante" title="Imprimir comprobante" onClick={() => setComprobante(true)}>
                <Icon name="printer" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Imprimir comprobante</span>
              </Button>
              {/* #275: después de confirmar la venta la app aterriza acá; desde el
                  detalle se vuelve al POS a cargar la próxima (carrito vacío). */}
              <Button type="button" variant="outline" data-testid="volver-al-pos" aria-label="Volver al POS" title="Volver al POS" onClick={() => navigate('/pos')}>
                <Icon name="receipt" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Volver al POS</span>
              </Button>
              <MenuDesplegable
                alineacion="right"
                ariaLabel="Más acciones del pedido"
                trigger={<span className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-fore lg:min-h-9">Más acciones<Icon name="chevron" className="h-3.5 w-3.5" /></span>}
                items={[
                  { id: 'nota-entrega', label: 'Nota de entrega', onClick: imprimirNotaEntrega },
                  ...(!esDemo ? [{ id: 'archivar', label: archivado ? 'Desarchivar' : 'Archivar', onClick: alternarArchivado }] : []),
                  ...(!esDemo && !anulado ? [{ separador: true }, { id: 'anular', label: 'Anular pedido', onClick: abrirAnular }] : []),
                ]}
              />
            </>
          }
        />
        {cuerpo}
      </div>
    )
  }

  return (
    <VentanaDetalle open onClose={onClose} title={codigoPedido(order.orderNumber || order.number) || 'Pedido'} className="ventas-f3 ventas-f3-detail" size="lg">
      {cuerpo}
    </VentanaDetalle>
  )
}
