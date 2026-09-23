import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PresenciaPedido from './PresenciaPedido'
import { Aviso, Badge, Button, Drawer, Input, Modal, Money, Select, Skeleton, Textarea, useToast } from '@/components/ui'
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
import { api, apiFetch } from '@/lib/api/client'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { opcionesDeEntrega, tonoEntrega } from './venta/entrega'
import { accessUrlFor, FORMATOS_PEDIDO, printDeliveryNote } from '@/components/shared/OrderReceipt'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { configImpresora } from '@/lib/printing/agent'
import { ticketNotaEntrega } from '@/lib/printing/tickets'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { DEMO_MESSAGE_TEMPLATES } from '@/components/customers/customerMessaging'
import { gs } from '@/utils/calculos'
import { useSesion } from '@/lib/sesion'
import { codigoPedido } from '@/utils/pedido'
import { getVendedores, ventaDesdeApi } from '@/lib/storage'
import PagosPedido from './PagosPedido'
import { consultaDeMencion, insertarMencion, tramosDeMencion } from '@/utils/menciones'
import { ROTULO_SECCION } from '@/components/shared/tabla'

const FULFILLMENT = FULFILLMENT_LABELS
const PAYMENT_TONE = (status) => status === 'Pagado' ? 'green' : status === 'Parcial' ? 'orange' : status === 'Anulado' ? 'slate' : 'red'
const PAYMENT_STATUS = { CONFIRMED: 'Confirmado', PENDING: 'Pendiente', REFUNDED: 'Reembolsado', REJECTED: 'Rechazado' }
const AUDIT_LABELS = {
  ORDER_FULFILLMENT_UPDATED: (meta) => `Entrega: ${FULFILLMENT[meta?.previous] || meta?.previous || '—'} → ${FULFILLMENT[meta?.current] || meta?.current || '—'}`,
  ORDER_SERIALS_ATTACHED: (meta) => `IMEI agregados al pedido: ${(meta?.serials || []).join(', ')}`,
  ORDER_BILLING_UPDATED: (meta) => meta?.billingName ? `Factura a nombre de ${meta.billingName}` : 'Datos de factura actualizados',
  ORDER_DISCOUNT_APPROVED: (meta) => <>Descuento aprobado: <Money value={Number(meta?.discountPyg || 0)} /></>,
  ORDER_DISCOUNT_AUTHORIZED: (meta) => <>Descuento autorizado: <Money value={Number(meta?.discountPyg || 0)} /> (máx. <Money value={Number(meta?.maxDiscountPyg || 0)} />)</>,
  ORDER_PRICE_AUTHORIZED: (meta) => <>Precio bajo lista autorizado: <Money value={Number(meta?.belowListPyg || 0)} /></>,
  ORDER_VOIDED: (meta) => `Pedido anulado${meta?.reason ? `: ${meta.reason}` : ''}${Number(meta?.restoredUnits || 0) > 0 ? ` · ${meta.restoredUnits} unidad(es) repuestas` : ''}`,
  ORDER_DELIVERED_UNPAID: (meta) => `Entrega con saldo autorizada${Number(meta?.pendingPyg || 0) > 0 ? ` · saldo ${gs(Number(meta.pendingPyg))}` : ''}`,
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
  return 'Sistema'
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

export default function PedidoDetalle({ row, esDemo, customerOrderCount = 0, onClose, onChanged, pagina = false }) {
  const toast = useToast()
  const { usuario, vendedores, sesion } = useSesion()
  const [accesos, setAccesos] = useState({})
  const [accesoBusy, setAccesoBusy] = useState(false)
  const [accesoMsg, setAccesoMsg] = useState('')
  const [comprobante, setComprobante] = useState(false)
  // Cobrar el saldo pendiente sin salir del detalle (mismo modal que Cobranzas).
  const [cobroAbierto, setCobroAbierto] = useState(false)
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
  const fileRef = useRef(null)
  // `order` se declara antes de los efectos: usarlo en un array de
  // dependencias después de su declaración es TDZ y rompía la vista en
  // producción ("Cannot access 'I' before initialization").
  const order = detail || row

  const load = useCallback(async () => {
    if (esDemo) { setDetail(row); setLoading(false); return }
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
  const payments = order.payments || []
  const paid = payments.filter(pago => pago.status === 'CONFIRMED').reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0)
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const pendiente = Math.max(0, total - paid)
  const clienteConCredito = Number(order.customer?.creditLimitPyg || 0) > 0 && Number(order.customer?.creditDays || 0) > 0
  const anulado = order.status === 'CANCELLED'
  const estadoPago = anulado ? 'Anulado' : (paid >= total && total > 0 ? 'Pagado' : (Number(order.creditDays || 0) > 0 && pendiente > 0 ? 'A crédito' : paid > 0 ? 'Parcial' : 'Pendiente'))
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
      {loading && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {error && <Aviso tono="error" className="mb-4 rounded-xl">{error}</Aviso>}
      {!loading && (
        <div className="space-y-3">
          {/* Estado y cabecera */}
          <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={PAYMENT_TONE(estadoPago)}>{estadoPago}</Badge>
              <Badge color={tonoEntrega(order.fulfillmentStatus)}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || 'Pendiente'}</Badge>
              {archivado && <Badge color="slate">Archivado</Badge>}
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
            <p className="mt-3 text-xs text-mute">
              {order.seller?.name ? `${order.seller.name} · ` : ''}{order.branch?.name || 'Sucursal'}{order.date || order.createdAt ? ` · ${relativeDate(order.createdAt || order.date)}` : ''}
            </p>
            {row.publicToken && !esDemo && <p className="mt-1 truncate font-mono text-[10px] text-mute">Token público: {order.publicToken || row.publicToken}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!esDemo && !anulado && <Select aria-label="Estado de entrega" className="max-w-[190px]" value={order.fulfillmentStatus || 'PENDING'} disabled={busy} onChange={event => cambiarEntrega(event.target.value)}>{opcionesDeEntrega(order.deliveryType, order.fulfillmentStatus || 'PENDING').map(value => <option key={value} value={value}>{FULFILLMENT[value] || value}</option>)}</Select>}
              {!esDemo && ['IN_TRANSIT', 'SHIPPED', 'READY_TO_SHIP', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus) && <Button variant={order.notifiedAt ? 'outline' : 'primary'} disabled={avisando} onClick={avisarPorWhatsApp}>{avisando ? 'Preparando…' : order.notifiedAt ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}</Button>}
              {order.customer?.phone && <WhatsAppMenu telefono={order.customer.phone} countryCode={order.customer.countryCode} category="ORDERS" contexto={contextoWhatsApp} onSent={esDemo ? undefined : enviarPlantilla} plantillas={esDemo ? DEMO_MESSAGE_TEMPLATES : undefined} disabled={avisando || busy} title={order.customer?.name} />}
              {order.notifiedAt && <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">Avisado {relativeDate(order.notifiedAt)}</span>}
              {!esDemo && !anulado && pendiente > 0 && <Button variant="outline" onClick={() => setCobroAbierto(true)}>Cobrar saldo · {gs(pendiente)}</Button>}
              <Button variant="outline" onClick={() => setComprobante(true)}>Imprimir comprobante</Button>
              <Button variant="outline" onClick={imprimirNotaEntrega}>Nota de entrega</Button>
              {!esDemo && !anulado && <Button variant="outline" onClick={abrirAnular}>Anular pedido</Button>}
              {!esDemo && <button type="button" disabled={busy} onClick={alternarArchivado} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">{archivado ? 'Desarchivar' : 'Archivar'}</button>}
            </div>
          </section>

          {/* Acceso del cliente: un enlace privado por nivel de información */}
          {!esDemo && (
            <section className="rounded-2xl border border-ink-600 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={cn('flex items-center gap-2', ROTULO_SECCION)}><Icon name="eye" className="h-3.5 w-3.5" /> Acceso del cliente</h3>
                <button type="button" disabled={accesoBusy} onClick={regenerarAccesoQr} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-warn hover:text-warn disabled:opacity-60">Regenerar acceso QR</button>
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
                            <button type="button" className="font-semibold text-fono-light hover:underline" onClick={() => copiarAcceso(token, label)}>Copiar enlace</button>
                            <button type="button" className="text-mute hover:text-warn" disabled={accesoBusy} onClick={() => generarAcceso(level, true)}>Regenerar</button>
                          </>
                        ) : (
                          <button type="button" className="font-semibold text-fono-light hover:underline" disabled={accesoBusy} onClick={() => generarAcceso(level, false)}>Generar enlace</button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              {accesoMsg && <p role="status" className="mt-2 text-xs text-fono-light">{accesoMsg}</p>}
            </section>
          )}

          {/* Etiquetas */}
          {!esDemo && (
            <SeccionColapsable id={`pedido-${order.id}-etiquetas`} titulo="Etiquetas" icono="tag" resumen={tags.length ? `${tags.length} etiqueta${tags.length === 1 ? '' : 's'}` : 'Sin etiquetas'}>
              <div className="flex flex-wrap items-center gap-2">
                {tags.map(tag => <button key={tag} type="button" onClick={() => guardarTags(tags.filter(item => item !== tag))} className="group inline-flex items-center gap-1 rounded-full border border-fono/25 bg-fono/10 px-2.5 py-1 text-xs text-fono-light" title="Quitar etiqueta">{tag}<span className="text-mute group-hover:text-bad">×</span></button>)}
                <form onSubmit={event => { event.preventDefault(); const tag = tagInput.trim(); if (!tag || tags.includes(tag) || tags.length >= 20) return; guardarTags([...tags, tag]); setTagInput('') }} className="flex items-center gap-1">
                  <Input aria-label="Nueva etiqueta" className="h-8 w-36 text-xs" maxLength={40} value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="Busca o crea etiquetas" />
                  <button type="submit" className="rounded-lg p-1.5 text-fono-light hover:bg-fono/10" aria-label="Agregar etiqueta"><Icon name="plus" className="h-4 w-4" /></button>
                </form>
              </div>
            </SeccionColapsable>
          )}

          {/* Artículos */}
          <SeccionColapsable id={`pedido-${order.id}-articulos`} titulo="Artículos preparados" icono="box" resumen={items.length ? `${items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} artículo(s) · ${gs(total)}` : 'Sin artículos detallados'}>
            <div className="divide-y divide-ink-600/70">
              {items.map((item, index) => {
                const serials = Array.isArray(item.serials) ? item.serials : []
                return (
                  <article key={item.id || index} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.description}</p>
                      <p className="mt-0.5 text-xs text-mute">{FULFILLMENT[order.fulfillmentStatus] || 'En tienda'} · {relativeDate(item.createdAt || order.createdAt || order.date)}</p>
                      {serials.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{serials.map(serial => <span key={serial} className="rounded border border-fono/25 bg-fono/10 px-1.5 py-0.5 font-mono text-[10px] text-fono-light">IMEI {serial}</span>)}</p>}
                      {(item.costPending || Number(item.serialsPending || 0) > 0) && <p className="mt-1 flex gap-2 text-[11px] text-warn">{Number(item.serialsPending || 0) > 0 && <span>{item.serialsPending} sin IMEI (sobre pedido)</span>}{item.costPending && <span>costo pendiente</span>}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold"><Money value={Number(item.totalPyg ?? 0)} /></p>
                      <p className="text-[11px] text-mute"><Money value={Number(item.unitPricePyg ?? 0)} /> × {item.quantity || 1}{Number(item.discountPyg || 0) > 0 ? <> · −<Money value={item.discountPyg} /></> : ''}</p>
                    </div>
                  </article>
                )
              })}
              {!items.length && <p className="py-3 text-sm text-mute">Sin artículos detallados.</p>}
            </div>
          </SeccionColapsable>

          {/* Información de pago */}
          <SeccionColapsable id={`pedido-${order.id}-pago`} titulo="Información de pago" icono="wallet" resumen={`${estadoPago} · total ${gs(total)}`}>
            <div className="space-y-1.5 text-sm">
              <p className="flex justify-between"><span className="text-mute">Subtotal · {items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} artículos</span><span className="tabular-nums"><Money value={Number(order.subtotalPyg ?? total)} /></span></p>
              {Number(order.discountPyg || 0) > 0 && <p className="flex justify-between text-warn"><span>Descuento</span><span className="tabular-nums">− <Money value={order.discountPyg} /></span></p>}
              {Number(order.deliveryPyg || 0) > 0 && <p className="flex justify-between"><span className="text-mute">Envío</span><span className="tabular-nums"><Money value={order.deliveryPyg} /></span></p>}
              <p className="flex justify-between border-t border-ink-600 pt-1.5 font-bold"><span>Total</span><span className="tabular-nums"><Money value={total} /></span></p>
              <p className="flex justify-between text-ok"><span>Pagado</span><span className="tabular-nums"><Money value={paid} /></span></p>
              {pendiente > 0 && <p className="flex justify-between text-warn"><span>{['Pendiente', Number(order.creditDays || 0) > 0 ? `plazo ${order.creditDays} días` : '', order.dueAt ? `vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : ''].filter(Boolean).join(' · ')}</span><span className="tabular-nums"><Money value={pendiente} /></span></p>}
            </div>
            {payments.length > 0 && <div className="mt-3 space-y-2 border-t border-ink-600 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Transacciones ({payments.length})</p>
              {payments.map(pago => <div key={pago.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-mute">{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method}{pago.accountSnapshot?.name ? ` · ${pago.accountSnapshot.name}` : ''}{pago.reference ? ` · ${pago.reference}` : ''}</span>
                <span className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 text-[10px] text-mute"><PersonaChip user={pago.user || { name: nombrePago(pago, order) }} size="sm" nombre={false} />Registrado por {nombreActor(nombrePago(pago, order))}</span><span className="tabular-nums font-semibold"><Money value={Number(pago.amountPyg || 0)} /></span><Badge color={pago.status === 'CONFIRMED' ? 'green' : pago.status === 'PENDING' ? 'orange' : 'slate'}>{PAYMENT_STATUS[pago.status] || pago.status}</Badge>{pago.settlesAt && <span className="text-[10px] text-mute">acredita {new Date(pago.settlesAt).toLocaleDateString('es-PY')}</span>}</span>
              </div>)}
            </div>}
          </SeccionColapsable>

          {/* Comprobantes de pago: archivos adjuntos a cada cobro */}
          {payments.some(pago => (pago.proofs || []).length > 0) && (
            <SeccionColapsable id={`pedido-${order.id}-comprobantes`} titulo="Comprobantes" icono="report" resumen={`${payments.reduce((sum, pago) => sum + (pago.proofs || []).length, 0)} archivo(s) de pago`}>
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

          {/* Cliente */}
          <SeccionColapsable
            id={`pedido-${order.id}-cliente`}
            titulo="Cliente"
            icono="user"
            resumen={[order.customer?.name || order.customer || 'Consumidor final', order.customer?.phone ? `${order.customer.countryCode || '+595'} ${order.customer.phone}` : ''].filter(Boolean).join(' · ')}
          >
            <div className="flex items-start gap-3">
              <Avatar user={{ name: order.customer?.name || order.customer || 'Consumidor final' }} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{order.customer?.name || order.customer || 'Consumidor final'}</p>
                <p className="mt-0.5 text-xs text-mute">{order.customer?.phone ? `${order.customer.countryCode || '+595'} ${order.customer.phone}` : 'Sin teléfono'}{order.customer?.email ? ` · ${order.customer.email}` : ''}</p>
                {order.customer?.document && <p className="text-xs text-mute">CI/RUC {order.customer.document}</p>}
                {customerOrderCount > 0 && <p className="mt-1 text-xs text-fono-light">{customerOrderCount} pedido{customerOrderCount === 1 ? '' : 's'}</p>}
                {(order.customer?.addresses || []).map(address => <p key={address.id || address.address} className="mt-1 text-xs text-mute">{address.label}: {address.address}{address.city ? ` · ${address.city}` : ''}</p>)}
                {!order.customer?.addresses?.length && <p className="mt-1 text-xs text-mute">Sin dirección cargada.</p>}
              </div>
            </div>
            {order.notes && !notaOpen && <p className="mt-3 rounded-lg bg-ink-700/60 px-3 py-2 text-xs text-mute">Nota: {order.notes}</p>}
            {!esDemo && (notaOpen ? (
              <div className="mt-3 space-y-2">
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
              <button type="button" className="mt-2 text-xs font-semibold text-fono-light hover:underline" onClick={() => { setNotaTexto(order.notes || ''); setNotaOpen(true) }}>
                {order.notes ? 'Editar nota' : '＋ Agregar nota'}
              </button>
            ))}
          </SeccionColapsable>

          {/* Cronología */}
          <SeccionColapsable id={`pedido-${order.id}-cronologia`} titulo="Cronología" icono="clock" resumen={events.length ? `${events.length} movimiento${events.length === 1 ? '' : 's'}` : 'Sin movimientos'}>
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
        </div>
      )}
      <ComprobantePreview order={{ ...order, timeline: timelineComprobante }} open={comprobante} onClose={() => setComprobante(false)}  formatos={FORMATOS_PEDIDO} />
      {cobroAbierto && (
        <PagosPedido
          venta={ventaDesdeApi(order)}
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" onClick={onClose}><Icon name="back" className="h-3.5 w-3.5" />Volver a pedidos</Button>
            <h1 className="font-mono text-sm font-bold text-fono-light">{codigoPedido(order.orderNumber || order.number) || 'Pedido'}</h1>
          </div>
          <PresenciaPedido pedidoId={order.id || row?.id} />
        </div>
        {cuerpo}
      </div>
    )
  }

  return (
    <Drawer open onClose={onClose} title={codigoPedido(order.orderNumber || order.number) || 'Pedido'} className="w-full sm:max-w-2xl">
      {cuerpo}
    </Drawer>
  )
}
