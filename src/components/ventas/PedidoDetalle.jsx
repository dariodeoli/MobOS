import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PresenciaPedido from './PresenciaPedido'
import RecordHeader from '@/components/app/RecordHeader'
import { Aviso, Badge, Button, Input, MenuDesplegable, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/shared/popupKit'
import Popup from '@/components/shared/Popup'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { descargarArchivo } from '@/utils/descargarArchivo'
import Icon from '@/components/shared/Icon'
import Avatar from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import { internationalPhone, whatsappUrl } from '@/utils/telefono'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import AvisarPorCorreo from '@/components/shared/AvisarPorCorreo'
import { plantillaDeEntrega, variablesDeProducto } from '@/lib/avisos'
import { demoCorreoDePedido } from '@/lib/demoCorreoRequest'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import CreditoPedido from '@/components/ventas/venta/CreditoPedido'
import EntregaPregunta from '@/components/ventas/venta/EntregaPregunta'
import { creditoBloqueaEntrega, preguntaEntregaAplica } from '@/lib/credito'
import { api, apiFetch } from '@/lib/api/client'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { metodoEntrega, opcionesDeEntrega, tonoEntrega } from './venta/entrega'
import { accessUrlFor, FORMATOS_PEDIDO, printDeliveryNote, trackingUrlFor } from '@/components/shared/OrderReceipt'
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
import { buscarClienteDemo } from '@/lib/demoClientes'
import PagosPedido from './PagosPedido'
import { AvisoEntregaBloqueada } from './PagoVerificacion'
import { motivoEntregaBloqueada, necesitaRefrescoPagos, resumenVerificacionPedido } from '@/lib/verificacionPagos'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import PedidoArticulos from './pedido/PedidoArticulos'
import PedidoPago, { estadoDePago } from './pedido/PedidoPago'
import PedidoCronologia from './pedido/PedidoCronologia'
import BotonImprimir from './pedido/BotonImprimir'
import useImprimirPedido from './pedido/useImprimirPedido'
import { agregarComentarioDemo, conComentariosDemo } from '@/lib/demo/comentariosPedido'
import { relativeDate } from './pedido/eventos'
import { temaV2Activo } from '@/lib/temaV2'
import './ventasF3.css'
import { isNativeIOS } from '@/lib/plataforma'
import { compartirNativo } from '@/lib/nativo/compartir'
import { eventosPedidoDemo } from '@/lib/demo/historiaPedido'

const FULFILLMENT = FULFILLMENT_LABELS
// Estados que sacan la mercadería del local: un cobro en verificación los bloquea (el servidor lo exige igual).
const ESTADOS_QUE_ENTREGAN = ['DELIVERED', 'PICKED_UP', 'PARTIAL']
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

// Quién hizo el movimiento: el usuario real cuando existe; en pagos viejos
// (sin creador guardado) cae al vendedor del pedido antes que a "Sistema".
function nombrePago(pago, order) {
  if (pago?.user?.name) return pago.user.name
  if (pago?.createdBy?.name) return pago.createdBy.name
  if (order?.seller?.name) return order.seller.name
  // La fila del listado trae el vendedor como `sellerName` (no como objeto): sin esto salía «Sistema».
  if (order?.sellerName) return order.sellerName
  return ''
}


const NIVELES_ACCESO = [['rapido', 'Rápido'], ['completo', 'Completo'], ['detallado', 'Detallado']]

export default function PedidoDetalle({ row, esDemo, customerOrderCount = 0, onClose, onChanged, pagina = false, navegacion = null, abrirCobro = false }) {
  const toast = useToast()
  const navigate = useNavigate()
  const ubicacion = useLocation()
  const { usuario, vendedores, sesion, empresa, sucursal } = useSesion()
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
  // Menciones internas: "@Nombre" avisa a quien corresponde (el equipo sale de
  // la lista de usuarios de la tienda).
  // El equipo sale del contexto de la empresa (lo ven todos los roles) y, si
  // está hidratado, se completa con los usuarios de la tienda.
  const nombresEquipo = useMemo(() => {
    const delContexto = Array.isArray(vendedores) ? vendedores.map((v) => v.nombre || v.name) : []
    const deLaTienda = getVendedores().map((v) => v.nombre)
    return [...new Set([...delContexto, ...deLaTienda, sesion?.nombre].filter(Boolean))]
  }, [vendedores, sesion?.nombre])
  const [tagInput, setTagInput] = useState('')
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
  // `order` se declara antes de los efectos: usarlo en un array de
  // dependencias después de su declaración es TDZ y rompía la vista en
  // producción ("Cannot access 'I' before initialization").
  const order = detail || row

  const load = useCallback(async () => {
    if (esDemo) {
      // Demo: el cobro de saldo y las correcciones escriben en la venta local; el detalle
      // vuelve a leerla para que Pagado/Saldo no queden con la foto vieja de la fila.
      const viva = listVentas().find(venta => venta.id === row.id)
      const detalleBase = viva ? { ...row, payments: viva.pagos, pagos: viva.pagos, totalPagado: viva.totalPagado, totalPendiente: viva.totalPendiente, estadoPago: viva.estadoPago } : row
      // La fila del listado trae solo el nombre: se completa el contacto con la ficha demo del cliente.
      const ficha = buscarClienteDemo(viva?.clienteId || row.clienteId || row.customerId)
      const clienteBase = typeof detalleBase.customer === 'string' ? { name: detalleBase.customer } : (detalleBase.customer || {})
      const detalleDemo = ficha ? { ...detalleBase, customer: { ...clienteBase, name: clienteBase.name || ficha.name, phone: clienteBase.phone || ficha.phone, countryCode: clienteBase.countryCode || ficha.countryCode, email: clienteBase.email || ficha.email, document: clienteBase.document || ficha.document } } : detalleBase
      setDetail(detalleDemo)
      // Cronología derivada de la propia venta (pagos, entrega, anulación): sin API.
      setEvents(conComentariosDemo(row.id, eventosPedidoDemo(detalleDemo)))
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
  // Refresco silencioso de los pagos: sin parpadeo de carga, sin tocar la cronología.
  const refrescarPagos = useCallback(async () => {
    if (esDemo || !row?.id) return
    try { setDetail(await api.get(`/api/orders/${encodeURIComponent(row.id)}`, { cacheMs: 0 })) } catch { /* el próximo intento lo reintenta */ }
  }, [row?.id, esDemo])
  useEffect(() => {
    if (!esDemo && order?.id) cargarAccesos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, esDemo])

  const items = order.items || []
  const itemsCantidad = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
  const nombreCliente = order.customer?.name || (typeof order.customer === 'string' ? order.customer : '') || 'Consumidor final'
  const payments = useMemo(() => pagosDelPedido(order).map(normalizarPago), [order])
  const pagosPorVerificar = payments.filter(pago => pago.status === 'PENDING')
  // Cobros en verificación (PIX, transferencia…): bloquean la entrega y se revisan solos cada 15 s.
  const verificacion = useMemo(() => resumenVerificacionPedido(payments), [payments])
  const hayPagosEnVerificacion = necesitaRefrescoPagos(payments)
  const motivoBloqueoPago = motivoEntregaBloqueada(verificacion, gs)
  useEffect(() => {
    if (esDemo || !hayPagosEnVerificacion) return undefined
    const intervalo = window.setInterval(() => { if (document.visibilityState === 'visible') refrescarPagos() }, 15000)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescarPagos() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { window.clearInterval(intervalo); document.removeEventListener('visibilitychange', alVolver) }
  }, [esDemo, hayPagosEnVerificacion, refrescarPagos])
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
    empresa: empresa?.nombre || order.tenant?.name || '',
    pedido: order.orderNumber || '',
    total: gs(total),
    saldo_pendiente: gs(pendiente),
    sucursal: order.branch?.name || '',
    vendedor: order.seller?.name || '',
    fecha: order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-PY') : '',
    // Demo: el enlace lleva el resumen del pedido en el fragmento (#d=…), sin backend.
    seguimiento: esDemo ? trackingUrlFor(order) : order.publicToken ? `${globalThis.location?.origin || ''}/pedido/${order.publicToken}` : '',
    ...variablesDeProducto(order.items, order.createdAt),
  }
  const eventoAviso = plantillaDeEntrega(order.fulfillmentStatus)
  const estadoChipPago = estadoDePago({ anulado, estadoPago, pagosPorVerificar })
  // Roles que llegan a esas pantallas: sin permiso no se muestra el enlace (en vez de un muro).
  const puedeVerStock = Boolean(sesion?.esPropietario || ['ADMIN', 'GERENTE'].includes(usuario?.role))
  const puedeVerEquipo = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const usuarioActual = { id: usuario?.id, name: sesion?.nombre || usuario?.name, hasAvatar: usuario?.hasAvatar }
  const fechaDePago = (pago) => (pago.createdAt || pago.date || pago.fecha ? relativeDate(pago.createdAt || pago.date || pago.fecha) : (pago.hora ? `Hoy ${pago.hora}` : relativeDate(order.createdAt || order.date)))
  const impresion = useImprimirPedido({ order, ordenComprobante, esDemo, imprimirNotaEntrega })
  // Si «Avisar por correo» sería el único control de la fila de Entrega, va en el título de la sección.
  const accionesEntrega = [
    !esDemo && !anulado,
    !esDemo && ['IN_TRANSIT', 'SHIPPED', 'READY_TO_SHIP', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus),
    Boolean(order.customer?.phone),
    Boolean(order.notifiedAt),
  ].filter(Boolean).length
  const correoEnTitulo = accionesEntrega === 0
  const correoAviso = (
    <AvisarPorCorreo email={order.customer?.email || order.email} category="ORDERS" evento={eventoAviso} contexto={contextoWhatsApp} disabled={avisando || busy} title={order.customer?.name} demoCorreo={demoCorreoDePedido(order)} className="-my-2.5" />
  )

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
    // App de iPhone: hoja nativa de compartir (WhatsApp, Mensajes, Mail…).
    if (isNativeIOS()) { compartirNativo({ titulo: 'Pedido en MobOS', url, dialogo: 'Compartir enlace del pedido' }).then((ok) => { if (!ok) setAccesoMsg(url) }); return }
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
    if (motivoBloqueoPago && ESTADOS_QUE_ENTREGAN.includes(fulfillmentStatus)) {
      setError(motivoBloqueoPago)
      return
    }
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
  // Publicar un comentario interno: en la demo queda en la memoria de la pestaña; en una
  // cuenta real va al API (con tenant/sucursal) y vuelve a leer la cronología.
  async function publicarComentario({ texto, adjunto }) {
    if (esDemo) {
      const evento = agregarComentarioDemo(order.id, { texto, usuario: { id: usuario?.id, nombre: sesion?.nombre || usuario?.name, hasAvatar: usuario?.hasAvatar } })
      if (evento) { setEvents((actuales) => [evento, ...actuales]); onChanged?.() }
      return
    }
    const form = new FormData()
    if (texto) form.append('body', texto)
    if (adjunto) form.append('file', adjunto)
    await api.post(`/api/orders/${encodeURIComponent(order.id)}/comments`, form)
    await load(); onChanged?.()
  }
  // «Ver página de estado del pedido»: el enlace rápido del cliente (se genera si todavía no existe).
  async function verPaginaEstado() {
    if (esDemo) { window.open(trackingUrlFor(order), '_blank', 'noopener,noreferrer'); return }
    try {
      let token = accesos.rapido
      if (!token) {
        const data = await api.post(`/api/orders/${encodeURIComponent(order.id)}/access-tokens`, { level: 'rapido', regenerate: false })
        token = data.token
        setAccesos((actual) => ({ ...actual, rapido: token }))
      }
      const url = accessUrlFor(token)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else toast.error('No se pudo armar el enlace', 'Probá de nuevo.')
    } catch (cause) { toast.error('No se pudo abrir la página de estado', cause?.message || 'Probá de nuevo.') }
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
            {preguntaEntrega && !loading && !anulado && !motivoBloqueoPago && preguntaEntregaAplica({ ...order, creditAuthorization: credito }) && (
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
            {(order.isSpecialOrder || order.assignedTo?.name || order.offlineSyncedAt) && (
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
              </div>
            )}

            <PedidoArticulos items={items} cantidad={itemsCantidad} esDemo={esDemo} puedeVerStock={puedeVerStock} />

            <PedidoPago
              order={order}
              payments={payments}
              total={total}
              pagado={paid}
              pendiente={pendiente}
              estado={estadoChipPago}
              itemsCantidad={itemsCantidad}
              anulado={anulado}
              esDemo={esDemo}
              contextoAviso={contextoWhatsApp}
              fechaDe={fechaDePago}
              nombreDe={(pago) => nombrePago(pago, order)}
              onCobrar={() => setCobroAbierto(true)}
              onPagos={() => setCobroAbierto(true)}
              onSubido={refrescarPagos}
              onDescargarComprobante={descargarComprobante}
            />

            <PedidoCronologia orderId={order.id} events={events} esDemo={esDemo} nombresEquipo={nombresEquipo} usuarioActual={usuarioActual} onPublicar={publicarComentario} />

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
                              <button type="button" className="inline-flex min-h-11 -my-2 items-center font-semibold text-fono-light hover:underline" onClick={() => copiarAcceso(token, label)}>{isNativeIOS() ? 'Compartir enlace' : 'Copiar enlace'}</button>
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
              <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="edit" className="h-3.5 w-3.5" /> Notas{!anulado && !notaOpen && <button type="button" aria-label={order.notes ? 'Editar nota' : 'Agregar nota'} title={order.notes ? 'Editar nota' : 'Agregar nota'} data-testid="pedido-nota-lapiz" className="-my-2.5 ml-auto grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore" onClick={() => { setNotaTexto(order.notes || ''); setNotaOpen(true) }}><Icon name={order.notes ? 'edit' : 'plus'} className="h-3.5 w-3.5" /></button>}</h3>
              {order.notes && !notaOpen && <p className="whitespace-pre-wrap text-sm text-fore">{order.notes}</p>}
              {!order.notes && !notaOpen && <p className="text-xs text-mute">Sin notas.</p>}
              {!anulado && (notaOpen ? (
                <div className="mt-2 space-y-2" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setNotaOpen(false) } }}>
                  <Textarea autoFocus rows={2} maxLength={2000} value={notaTexto} onChange={(event) => setNotaTexto(event.target.value)} placeholder="Nota interna del pedido" aria-label="Nota del pedido" />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setNotaOpen(false)}>Cancelar</Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (esDemo) { setDetail({ ...order, notes: notaTexto.trim() || null }); onChanged?.(); setNotaOpen(false); toast.success('Nota guardada.'); return }
                        accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { notes: notaTexto }), 'Nota guardada.').then(() => setNotaOpen(false))
                      }}
                    >
                      Guardar nota
                    </Button>
                  </div>
                </div>
              ) : null)}
            </section>

            {/* Cliente */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-cliente">
              <h3 className="ventas-f3-card-title !px-0 !pt-0">
                <Icon name="user" className="h-3.5 w-3.5" /> Cliente
                {!esDemo && order.customer?.id && !anulado && (
                  <span className="-my-2.5 ml-auto flex items-center">
                    <button type="button" aria-label="Cambiar cliente" title="Cambiar cliente" data-testid="pedido-cambiar-cliente" className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore" onClick={() => setClienteModal('asignar')}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Quitar cliente" title="Quitar cliente" data-testid="pedido-quitar-cliente" className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-warn" onClick={() => setQuitarCliente(true)}><Icon name="close" className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </h3>
              <div className="flex items-start gap-1">
                {order.customer?.id && !esDemo ? (
                  <Link to={`/clientes?cliente=${encodeURIComponent(order.customer.id)}`} state={{ volverA: `${ubicacion.pathname}${ubicacion.search}` }} aria-label={`Ver ficha de ${nombreCliente}`} data-testid="pedido-ver-perfil" className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:bg-ink-700/60">
                    <Avatar user={{ name: nombreCliente }} size="md" />
                    <span className="min-w-0 flex-1"><span className="ventas-f3-name block">{nombreCliente}</span></span>
                    <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-mute" />
                  </Link>
                ) : (
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
                    <Avatar user={{ name: nombreCliente }} size="md" />
                    <p className="ventas-f3-name min-w-0 flex-1">{nombreCliente}</p>
                  </div>
                )}
                {(order.customer?.phone || order.customer?.email) && (
                  <div className="flex shrink-0 items-center" data-testid="pedido-cliente-contacto">
                    {order.customer?.phone && <a href={whatsappUrl(order.customer.phone, '', order.customer.countryCode || '+595')} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp al cliente" title="WhatsApp" className="grid h-11 w-11 place-items-center rounded-lg text-fono-light hover:bg-fono/10"><Icon name="send" className="h-4 w-4" /></a>}
                    {order.customer?.phone && <a href={`tel:${internationalPhone(order.customer.phone, order.customer.countryCode || '+595')}`} aria-label="Llamar al cliente" title="Llamar" className="grid h-11 w-11 place-items-center rounded-lg text-fono-light hover:bg-fono/10"><Icon name="phone" className="h-4 w-4" /></a>}
                    {order.customer?.email && <a href={`mailto:${order.customer.email}`} aria-label="Escribir un correo al cliente" title="Correo" className="grid h-11 w-11 place-items-center rounded-lg text-fono-light hover:bg-fono/10"><Icon name="mail" className="h-4 w-4" /></a>}
                  </div>
                )}
              </div>
              <div className="min-w-0 pl-1">
                {customerOrderCount > 0 && (order.customer?.id && !esDemo
                  ? <Link to={`/pedidos?q=${encodeURIComponent(nombreCliente)}`} data-testid="pedido-cliente-pedidos" className="inline-flex min-h-11 items-center text-xs font-semibold text-ok hover:underline lg:min-h-0">{customerOrderCount} pedido{customerOrderCount === 1 ? '' : 's'}</Link>
                  : <p className="text-xs text-ok">{customerOrderCount} pedido{customerOrderCount === 1 ? '' : 's'}</p>)}
                {order.customer?.phone
                  ? <p className="mt-0.5 break-words text-xs text-mute">{order.customer.countryCode || '+595'} {order.customer.phone}</p>
                  : (order.customer?.id && !esDemo
                    ? <Link to={`/clientes?cliente=${encodeURIComponent(order.customer.id)}&tab=datos`} state={{ volverA: `${ubicacion.pathname}${ubicacion.search}` }} data-testid="pedido-agregar-telefono" className="inline-flex min-h-11 items-center text-xs font-semibold text-fono-light hover:underline lg:min-h-0">＋ Agregar teléfono</Link>
                    : <p className="mt-0.5 text-xs text-mute">Sin teléfono</p>)}
                {order.customer?.email && <p className="break-all text-xs text-mute">{order.customer.email}</p>}
                {order.customer?.document && <p className="text-xs text-mute">CI/RUC {order.customer.document}</p>}
              </div>
              {!esDemo && !order.customer?.id && !anulado && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button type="button" className="h-9 px-3 text-xs" data-testid="pedido-asignar-cliente" onClick={() => setClienteModal('asignar')}>Asignar cliente</Button>
                  <Button type="button" variant="outline" className="h-9 px-3 text-xs" data-testid="pedido-crear-ficha" onClick={() => setClienteModal('crear')}>Crear ficha</Button>
                </div>
              )}
            </section>

            {/* Dirección de entrega */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-entrega">
              <h3 className="ventas-f3-card-title flex items-center justify-between gap-2 !px-0 !pt-0"><span className="inline-flex items-center gap-1.5"><Icon name="truck" className="h-3.5 w-3.5" /> {metodoEntrega(order.deliveryType) === 'DELIVERY' ? 'Dirección de entrega' : 'Entrega'}</span>{correoEnTitulo && correoAviso}</h3>
              <p className="text-xs text-mute">{metodoEntrega(order.deliveryType) === 'DELIVERY' ? 'Delivery' : `Retiro en tienda${order.branch?.name ? ` · ${order.branch.name}` : ''}`}</p>
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
                {!esDemo && !anulado && <Select aria-label="Estado de entrega" className="max-w-full" value={order.fulfillmentStatus || 'PENDING'} disabled={busy || creditoRetiene} title={creditoRetiene ? 'Pendiente de autorización de crédito' : motivoBloqueoPago || undefined} onChange={event => cambiarEntrega(event.target.value)}>{opcionesDeEntrega(order.deliveryType, order.fulfillmentStatus || 'PENDING').map(value => <option key={value} value={value} disabled={Boolean(motivoBloqueoPago) && ESTADOS_QUE_ENTREGAN.includes(value)}>{FULFILLMENT[value] || value}</option>)}</Select>}
                {!esDemo && ['IN_TRANSIT', 'SHIPPED', 'READY_TO_SHIP', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus) && <Button variant={order.notifiedAt || pendiente > 0 ? 'outline' : 'primary'} disabled={avisando} onClick={avisarPorWhatsApp}>{avisando ? 'Preparando…' : order.notifiedAt ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}</Button>}
                {order.customer?.phone && <WhatsAppMenu telefono={order.customer.phone} countryCode={order.customer.countryCode} category="ORDERS" preferKey={eventoAviso} contexto={contextoWhatsApp} onSent={esDemo ? undefined : enviarPlantilla} plantillas={esDemo ? DEMO_MESSAGE_TEMPLATES : undefined} disabled={avisando || busy} title={order.customer?.name} />}
                {!correoEnTitulo && correoAviso}
                {order.notifiedAt && <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">Avisado {relativeDate(order.notifiedAt)}</span>}
              </div>
              {!anulado && <AvisoEntregaBloqueada motivo={motivoBloqueoPago} />}
            </section>

            {/* Datos de facturación */}
            <section className="ventas-f3-detail-section p-3" data-testid="pedido-facturacion">
              <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="receipt" className="h-3.5 w-3.5" /> Datos de facturación</h3>
              {order.billingName || order.billingDocument
                ? (
                  <div className="space-y-0.5 text-xs">
                    {order.billingName && <p className="break-words text-sm text-fore">{order.billingName}</p>}
                    {order.billingDocument && <p className="text-mute">RUC {order.billingDocument}</p>}
                  </div>
                )
                : <p className="text-xs text-mute">{order.customer?.document ? `A nombre del cliente · CI/RUC ${order.customer.document}` : 'Sin datos de facturación.'}</p>}
            </section>

            {/* Etiquetas */}
            {!esDemo && (
              <section className="ventas-f3-detail-section p-3" data-testid="pedido-etiquetas">
                <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="tag" className="h-3.5 w-3.5" /> Etiquetas</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map(tag => <button key={tag} type="button" onClick={() => guardarTags(tags.filter(item => item !== tag))} className="group inline-flex min-h-11 items-center gap-1 rounded-full border border-fono/25 bg-fono/10 px-2.5 py-1 text-xs text-fono-light md:min-h-0" title="Quitar etiqueta">{tag}<span className="text-mute group-hover:text-bad">×</span></button>)}
                  <form onSubmit={event => { event.preventDefault(); const tag = tagInput.trim(); if (!tag || tags.includes(tag) || tags.length >= 20) return; guardarTags([...tags, tag]); setTagInput('') }} className="flex items-center gap-1">
                    <Input aria-label="Nueva etiqueta" className="h-8 w-36 text-xs" maxLength={40} value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="Busca o crea etiquetas" />
                    <button type="submit" className="grid h-11 w-11 place-items-center rounded-lg text-fono-light hover:bg-fono/10" aria-label="Agregar etiqueta"><Icon name="plus" className="h-4 w-4" /></button>
                  </form>
                </div>
              </section>
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
      <ComprobantePreview order={ordenComprobante} open={comprobante} onClose={() => setComprobante(false)} formatos={FORMATOS_PEDIDO} />
      {cobroAbierto && (
        <PagosPedido
          venta={esDemo ? (listVentas().find(venta => venta.id === order.id) || order) : ventaDesdeApi(order)}
          open={!comprobante}
          onVerComprobante={() => setComprobante(true)}
          onClose={() => { setCobroAbierto(false); load(); onChanged?.() }}
        />
      )}
      <Popup
        open={anularOpen}
        onClose={() => { if (!anularBusy) setAnularOpen(false) }}
        tipo="confirmar"
        title="Anular pedido"
        description={`${order.orderNumber ? `${codigoPedido(order.orderNumber)} · ` : ''}${puedeAnular
          ? 'El pedido queda anulado y las unidades vendidas vuelven a stock. Los pagos no se reembolsan automáticamente.'
          : 'Gerencia tiene que autorizar la anulación antes de ejecutarla.'}`}
        busy={anularBusy}
        testId="anular-pedido"
        acciones={{
          secundaria: { label: 'Cancelar', onClick: () => setAnularOpen(false), disabled: anularBusy },
          peligro: { label: anularBusy ? 'Anulando…' : puedeAnular || anularAuth ? 'Anular pedido' : 'Solicitar autorización', onClick: confirmarAnular, disabled: anularBusy || anularMotivo.trim().length < 3 },
        }}
      >
        <div className="space-y-3">
          <Textarea rows={3} maxLength={500} aria-label="Motivo de la anulación" value={anularMotivo} onChange={event => setAnularMotivo(event.target.value)} placeholder="Indicá el motivo de la anulación (mínimo 3 caracteres)" />
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
        </div>
      </Popup>
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
    const tituloPedido = codigoPedido(order.orderNumber || order.number) || 'Pedido'
    const vendedorNombre = order.seller?.name || order.sellerName || ''
    const vendedorId = order.seller?.id || order.sellerId || ''
    const subtitulo = [
      order.billingDocument ? 'Factura' : 'Comprobante',
      order.createdAt || order.date ? fechaLegible(order.createdAt || order.date) : '',
      order.branch?.name || (typeof order.sucursal === 'string' ? order.sucursal : '') || sucursal?.nombre,
    ].filter(Boolean)
    return (
      <div className="ventas-f3 ventas-f3-detail ped-rd space-y-4" data-testid="pedido-detalle-f3">
        <RecordHeader
          backLabel="Pedidos"
          onBack={onClose}
          title={tituloPedido.startsWith('#') ? tituloPedido : `#${tituloPedido}`}
          mono
          metaEnLinea
          chip={
            <span className="flex flex-wrap items-center gap-1.5" data-testid="pedido-chips">
              {anulado
                ? <Badge color="red">Anulado</Badge>
                : <>
                    <Badge data-testid="pedido-chip-pago" color={estadoChipPago.tono}>{estadoChipPago.texto}</Badge>
                    {creditoRetiene
                      ? <Badge data-testid="estado-credito" color={credito.status === 'REJECTED' ? 'red' : 'orange'}>{credito.status === 'REJECTED' ? 'Crédito rechazado' : 'Pendiente de autorización de crédito'}</Badge>
                      : <Badge key={order.fulfillmentStatus || 'PENDING'} className="mobos-chip-cambia" color={tonoEntrega(order.fulfillmentStatus)}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || 'Pendiente'}</Badge>}
                  </>}
              {archivado && <Badge color="slate">Archivado</Badge>}
            </span>
          }
          meta={(
            <span data-testid="pedido-subtitulo">
              {subtitulo.join(' · ')}
              {vendedorNombre && (
                <>
                  {subtitulo.length > 0 ? ' · ' : ''}
                  {puedeVerEquipo && !esDemo && vendedorId
                    ? <Link to={`/configuracion/equipo?miembro=${encodeURIComponent(vendedorId)}`} state={{ volverA: `${ubicacion.pathname}${ubicacion.search}` }} data-testid="pedido-vendedor-ficha" className="font-semibold text-fono-light hover:underline">{vendedorNombre}</Link>
                    : vendedorNombre}
                </>
              )}
            </span>
          )}
          actions={
            <div data-testid="pedido-acciones" className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
              <PresenciaPedido pedidoId={order.id || row?.id} />
              {navegacion && (
                <span className="flex items-center" role="group" aria-label="Pedidos vecinos">
                  <button type="button" data-testid="pedido-anterior" aria-label="Pedido anterior" title="Pedido anterior" disabled={!navegacion.anterior} onClick={() => navegacion.onIr(navegacion.anterior)} className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore disabled:opacity-40"><Icon name="chevron" className="h-4 w-4 rotate-90" /></button>
                  <button type="button" data-testid="pedido-siguiente" aria-label="Pedido siguiente" title="Pedido siguiente" disabled={!navegacion.siguiente} onClick={() => navegacion.onIr(navegacion.siguiente)} className="grid h-11 w-11 place-items-center rounded-lg text-mute hover:bg-ink-700 hover:text-fore disabled:opacity-40"><Icon name="chevron" className="h-4 w-4 -rotate-90" /></button>
                </span>
              )}
              {/* #275: después de confirmar la venta la app aterriza acá; desde el
                  detalle se vuelve al POS a cargar la próxima (carrito vacío). */}
              <Button type="button" variant="outline" className="min-h-11 min-w-11 justify-center px-3" data-testid="volver-al-pos" aria-label="Volver al POS" title="Volver al POS" onClick={() => navigate('/pos')}>
                <Icon name="receipt" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Volver al POS</span>
              </Button>
              <BotonImprimir
                formatoActual={impresion.formatoActual}
                etiquetaActual={impresion.etiquetaActual}
                formatos={impresion.formatos}
                imprimiendo={impresion.imprimiendo}
                onImprimir={impresion.imprimir}
                onVistaPrevia={() => setComprobante(true)}
              />
              <MenuDesplegable
                alineacion="right"
                ariaLabel="Más acciones del pedido"
                trigger={<span className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-ink-500 px-3 text-xs font-semibold leading-none text-fore">Más acciones<Icon name="chevron" className="h-3.5 w-3.5" /></span>}
                items={[
                  ...(!esDemo && !anulado ? [{ id: 'devolver', label: 'Devolver / postventa', onClick: () => setCobroAbierto(true) }] : []),
                  { id: 'pagina-estado', label: 'Ver página de estado del pedido', onClick: verPaginaEstado },
                  ...(!esDemo ? [{ id: 'archivar', label: archivado ? 'Desarchivar' : 'Archivar', onClick: alternarArchivado }] : []),
                  { separador: true },
                  { id: 'imprimir-a4', label: 'Imprimir comprobante A4', onClick: () => impresion.imprimir('a4') },
                  { id: 'imprimir-ticket', label: 'Imprimir ticket 80 mm', onClick: () => impresion.imprimir('ticket-80') },
                  { id: 'nota-entrega', label: 'Imprimir nota de entrega', onClick: () => impresion.imprimir('nota-entrega') },
                  { id: 'imprimir-pagina', label: 'Imprimir página del pedido', onClick: () => impresion.imprimir('pagina') },
                  ...(!esDemo && !anulado ? [{ separador: true }, { id: 'anular', label: 'Anular pedido', peligro: true, onClick: abrirAnular }] : []),
                ]}
              />
            </div>
          }
        />
        {cuerpo}
      </div>
    )
  }

  return (
    <VentanaDetalle open onClose={onClose} title={codigoPedido(order.orderNumber || order.number) || 'Pedido'} className="ventas-f3 ventas-f3-detail ped-rd" size="lg">
      {cuerpo}
    </VentanaDetalle>
  )
}
