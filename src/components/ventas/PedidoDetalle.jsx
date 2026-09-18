import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer, Badge, Button, Input, Money, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import WhatsAppMenu from '@/components/shared/WhatsAppMenu'
import { api, API_URL } from '@/lib/api/client'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { accessUrlFor } from '@/components/shared/OrderReceipt'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { DEMO_MESSAGE_TEMPLATES } from '@/components/customers/customerMessaging'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'

const FULFILLMENT = FULFILLMENT_LABELS
const PAYMENT_TONE = (status) => status === 'Pagado' ? 'green' : status === 'Parcial' ? 'orange' : 'red'
const PAYMENT_STATUS = { CONFIRMED: 'Confirmado', PENDING: 'Pendiente', REFUNDED: 'Reembolsado', REJECTED: 'Rechazado' }
const AUDIT_LABELS = {
  ORDER_FULFILLMENT_UPDATED: (meta) => `Entrega: ${FULFILLMENT[meta?.previous] || meta?.previous || '—'} → ${FULFILLMENT[meta?.current] || meta?.current || '—'}`,
  ORDER_SERIALS_ATTACHED: (meta) => `IMEI agregados al pedido: ${(meta?.serials || []).join(', ')}`,
  ORDER_BILLING_UPDATED: (meta) => meta?.billingName ? `Factura a nombre de ${meta.billingName}` : 'Datos de factura actualizados',
  ORDER_DISCOUNT_APPROVED: (meta) => <>Descuento aprobado: <Money value={Number(meta?.discountPyg || 0)} /></>,
  ORDER_DISCOUNT_AUTHORIZED: (meta) => <>Descuento autorizado: <Money value={Number(meta?.discountPyg || 0)} /> (máx. <Money value={Number(meta?.maxDiscountPyg || 0)} />)</>,
  ORDER_TAGS_UPDATED: (meta) => (meta?.tags || []).length ? `Etiquetas: ${meta.tags.join(', ')}` : 'Etiquetas quitadas',
  ORDER_ARCHIVED: () => 'Pedido archivado',
  ORDER_UNARCHIVED: () => 'Pedido desarchivado',
  INVENTORY_UNITS_SOLD: (meta) => `Equipos vendidos: ${(meta?.serials || []).join(', ')}`,
  ORDER_NOTIFIED_WHATSAPP: () => 'Aviso enviado al cliente por WhatsApp',
  ORDER_COMMENTED: () => 'Comentario agregado',
}

// Sin foto, el cliente se identifica con el icono de persona (no iniciales).
function Avatar({ name, size = 'md' }) {
  return <span title={name || undefined} className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-fono to-fono-dark text-onbrand ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'}`}><Icon name="user" className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /></span>
}
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
  useEffect(() => {
    let active = true; let objectUrl = ''
    fetch(`${API_URL}/api/orders/${encodeURIComponent(orderId)}/comments/${encodeURIComponent(commentId)}/photos/${encodeURIComponent(photo.id)}`, { credentials: 'include' })
      .then(response => { if (!response.ok) throw new Error('sin foto'); return response.blob() })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [orderId, commentId, photo.id])
  if (photo.mimeType === 'application/pdf') {
    return <button type="button" className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2 py-1.5 text-xs text-fono-light" onClick={() => url && window.open(url, '_blank')}><Icon name="report" className="h-3.5 w-3.5" /> {photo.fileName}</button>
  }
  if (!url) return <span className="h-16 w-16 animate-pulse rounded-lg bg-ink-700" />
  return <button type="button" onClick={() => window.open(url, '_blank')} className="overflow-hidden rounded-lg border border-ink-600 transition hover:border-fono"><img src={url} alt={photo.fileName} className="h-16 w-16 object-cover" /></button>
}

const NIVELES_ACCESO = [['rapido', 'Rápido'], ['completo', 'Completo'], ['detallado', 'Detallado']]

export default function PedidoDetalle({ row, esDemo, customerOrderCount = 0, onClose, onChanged }) {
  const toast = useToast()
  const [accesos, setAccesos] = useState({})
  const [accesoBusy, setAccesoBusy] = useState(false)
  const [accesoMsg, setAccesoMsg] = useState('')
  const [comprobante, setComprobante] = useState(false)
  const [detail, setDetail] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(!esDemo)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [comentario, setComentario] = useState('')
  const [adjunto, setAdjunto] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [avisando, setAvisando] = useState(false)
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
  const estadoPago = paid >= total && total > 0 ? 'Pagado' : (Number(order.creditDays || 0) > 0 && pendiente > 0 ? 'A crédito' : paid > 0 ? 'Parcial' : 'Pendiente')
  const tags = Array.isArray(order.tags) ? order.tags : []
  const archivado = Boolean(order.archivedAt)
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
  function copiarAcceso(token) {
    const url = accessUrlFor(token)
    if (!url) { setAccesoMsg('No se pudo armar el enlace.'); return }
    navigator.clipboard?.writeText(url).then(() => setAccesoMsg('Enlace copiado.')).catch(() => setAccesoMsg(url))
  }
  const cambiarEntrega = (fulfillmentStatus) => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { fulfillmentStatus }), 'Entrega actualizada.')
  const alternarArchivado = () => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: archivado ? 'unarchive' : 'archive' }), archivado ? 'Pedido desarchivado.' : 'Pedido archivado.')
  const guardarTags = (next) => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { tags: next }), 'Etiquetas actualizadas.')
  // Descarga autenticada del comprobante de un pago (el endpoint exige sesión):
  // se pide el binario y se ofrece como archivo local, igual que en pagos.
  async function descargarComprobante(paymentId, proof) {
    try {
      const response = await fetch(`${API_URL}/api/payments/${encodeURIComponent(paymentId)}/proofs/${encodeURIComponent(proof.id)}`, { credentials: 'include' })
      if (!response.ok) throw new Error('No se pudo descargar el comprobante.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = proof.fileName || 'comprobante'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
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

  return (
    <Drawer open onClose={onClose} title={codigoPedido(order.orderNumber || order.number) || 'Pedido'} className="w-full sm:max-w-2xl">
      {loading && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {!loading && (
        <div className="space-y-5">
          {/* Estado y cabecera */}
          <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={PAYMENT_TONE(estadoPago)}>{estadoPago}</Badge>
              <Badge color={order.fulfillmentStatus === 'DELIVERED' ? 'green' : order.fulfillmentStatus === 'READY_TO_SHIP' ? 'blue' : order.fulfillmentStatus === 'READY_FOR_PICKUP' ? 'orange' : 'slate'}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || 'Preparando'}</Badge>
              {archivado && <Badge color="slate">Archivado</Badge>}
              {order.billingName && <Badge color="blue">Factura: {order.billingName}</Badge>}
            </div>
            <p className="mt-3 text-xs text-mute">
              {order.seller?.name ? `${order.seller.name} · ` : ''}{order.branch?.name || 'Sucursal'}{order.date || order.createdAt ? ` · ${relativeDate(order.createdAt || order.date)}` : ''}
            </p>
            {row.publicToken && !esDemo && <p className="mt-1 truncate font-mono text-[10px] text-mute">Token público: {row.publicToken}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!esDemo && <Select aria-label="Estado de entrega" className="max-w-[190px]" value={order.fulfillmentStatus || 'PROCESSING'} disabled={busy} onChange={event => cambiarEntrega(event.target.value)}>{Object.entries(FULFILLMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}
              {!esDemo && ['IN_TRANSIT', 'READY_TO_SHIP', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus) && <Button variant={order.notifiedAt ? 'outline' : 'primary'} disabled={avisando} onClick={avisarPorWhatsApp}>{avisando ? 'Preparando…' : order.notifiedAt ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}</Button>}
              {order.customer?.phone && <WhatsAppMenu telefono={order.customer.phone} countryCode={order.customer.countryCode} category="ORDERS" contexto={contextoWhatsApp} onSent={esDemo ? undefined : enviarPlantilla} plantillas={esDemo ? DEMO_MESSAGE_TEMPLATES : undefined} disabled={avisando || busy} title={order.customer?.name} />}
              {order.notifiedAt && <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">Avisado {relativeDate(order.notifiedAt)}</span>}
              <Button variant="outline" onClick={() => setComprobante(true)}>Imprimir comprobante</Button>
              {!esDemo && <button type="button" disabled={busy} onClick={alternarArchivado} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">{archivado ? 'Desarchivar' : 'Archivar'}</button>}
            </div>
          </section>

          {/* Acceso del cliente: un enlace privado por nivel de información */}
          {!esDemo && (
            <section className="rounded-2xl border border-ink-600 p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="eye" className="h-3.5 w-3.5" /> Acceso del cliente</h3>
              <p className="mt-1 text-xs text-mute">Cada nivel tiene su propio enlace privado. Regenerarlo invalida el anterior.</p>
              <div className="mt-3 space-y-2">
                {NIVELES_ACCESO.map(([level, label]) => {
                  const token = accesos[level]
                  return (
                    <div key={level} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2 text-xs">
                      <span className="font-semibold">{label}</span>
                      <span className="flex flex-wrap items-center gap-3">
                        {token ? (
                          <>
                            <button type="button" className="font-semibold text-fono-light hover:underline" onClick={() => copiarAcceso(token)}>Copiar enlace</button>
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
            <section className="rounded-2xl border border-ink-600 p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="tag" className="h-3.5 w-3.5" /> Etiquetas</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {tags.map(tag => <button key={tag} type="button" onClick={() => guardarTags(tags.filter(item => item !== tag))} className="group inline-flex items-center gap-1 rounded-full border border-fono/25 bg-fono/10 px-2.5 py-1 text-xs text-fono-light" title="Quitar etiqueta">{tag}<span className="text-mute group-hover:text-bad">×</span></button>)}
                <form onSubmit={event => { event.preventDefault(); const tag = tagInput.trim(); if (!tag || tags.includes(tag) || tags.length >= 20) return; guardarTags([...tags, tag]); setTagInput('') }} className="flex items-center gap-1">
                  <Input aria-label="Nueva etiqueta" className="h-8 w-36 text-xs" maxLength={40} value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="Busca o crea etiquetas" />
                  <button type="submit" className="rounded-lg p-1.5 text-fono-light hover:bg-fono/10" aria-label="Agregar etiqueta"><Icon name="plus" className="h-4 w-4" /></button>
                </form>
              </div>
            </section>
          )}

          {/* Artículos */}
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Artículos preparados</h3>
            <div className="mt-3 divide-y divide-ink-600/70">
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
          </section>

          {/* Información de pago */}
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Información de pago</h3>
            <div className="mt-3 space-y-1.5 text-sm">
              <p className="flex justify-between"><span className="text-mute">Subtotal · {items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} artículos</span><span className="tabular-nums"><Money value={Number(order.subtotalPyg ?? total)} /></span></p>
              {Number(order.discountPyg || 0) > 0 && <p className="flex justify-between text-warn"><span>Descuento</span><span className="tabular-nums">− <Money value={order.discountPyg} /></span></p>}
              {Number(order.deliveryPyg || 0) > 0 && <p className="flex justify-between"><span className="text-mute">Envío</span><span className="tabular-nums"><Money value={order.deliveryPyg} /></span></p>}
              <p className="flex justify-between border-t border-ink-600 pt-1.5 font-bold"><span>Total</span><span className="tabular-nums"><Money value={total} /></span></p>
              <p className="flex justify-between text-ok"><span>Pagado</span><span className="tabular-nums"><Money value={paid} /></span></p>
              {pendiente > 0 && <p className="flex justify-between text-warn"><span>{order.dueAt ? `Pendiente · vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : 'Pendiente'}</span><span className="tabular-nums"><Money value={pendiente} /></span></p>}
            </div>
            {payments.length > 0 && <div className="mt-3 space-y-2 border-t border-ink-600 pt-3">
              {payments.map(pago => <div key={pago.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-mute">{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method}{pago.accountSnapshot?.name ? ` · ${pago.accountSnapshot.name}` : ''}{pago.reference ? ` · ${pago.reference}` : ''}</span>
                <span className="flex flex-wrap items-center gap-2"><span className="text-[10px] text-mute">Registrado por {nombrePago(pago, order)}</span><span className="tabular-nums font-semibold"><Money value={Number(pago.amountPyg || 0)} /></span><Badge color={pago.status === 'CONFIRMED' ? 'green' : pago.status === 'PENDING' ? 'orange' : 'slate'}>{PAYMENT_STATUS[pago.status] || pago.status}</Badge>{pago.settlesAt && <span className="text-[10px] text-mute">acredita {new Date(pago.settlesAt).toLocaleDateString('es-PY')}</span>}</span>
              </div>)}
            </div>}
          </section>

          {/* Comprobantes de pago: archivos adjuntos a cada cobro */}
          {payments.some(pago => (pago.proofs || []).length > 0) && (
            <section className="rounded-2xl border border-ink-600 p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="report" className="h-3.5 w-3.5" /> Comprobantes</h3>
              <div className="mt-3 space-y-3">
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
            </section>
          )}

          {/* Cliente */}
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Cliente</h3>
            <div className="mt-3 flex items-start gap-3">
              <Avatar name={order.customer?.name || order.customer || '?'} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{order.customer?.name || order.customer || 'Consumidor final'}</p>
                <p className="mt-0.5 text-xs text-mute">{order.customer?.phone ? `${order.customer.countryCode || '+595'} ${order.customer.phone}` : 'Sin teléfono'}{order.customer?.email ? ` · ${order.customer.email}` : ''}</p>
                {order.customer?.document && <p className="text-xs text-mute">CI/RUC {order.customer.document}</p>}
                {customerOrderCount > 0 && <p className="mt-1 text-xs text-fono-light">{customerOrderCount} pedido{customerOrderCount === 1 ? '' : 's'}</p>}
                {(order.customer?.addresses || []).map(address => <p key={address.id || address.address} className="mt-1 text-xs text-mute">{address.label}: {address.address}{address.city ? ` · ${address.city}` : ''}</p>)}
                {!order.customer?.addresses?.length && <p className="mt-1 text-xs text-mute">Sin dirección cargada.</p>}
              </div>
            </div>
            {order.notes && <p className="mt-3 rounded-lg bg-ink-700/60 px-3 py-2 text-xs text-mute">Nota: {order.notes}</p>}
          </section>

          {/* Cronología */}
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="clock" className="h-3.5 w-3.5" /> Cronología</h3>
            {esDemo && <p className="mt-2 text-sm text-mute">La cronología con comentarios y fotos está disponible con una cuenta real.</p>}
            {!esDemo && (
              <>
                <form onSubmit={enviarComentario} className="mt-3 space-y-2">
                  <textarea aria-label="Comentario del pedido" rows={2} maxLength={2000} value={comentario} onChange={event => setComentario(event.target.value)} placeholder="Escribí un comentario para el equipo…" className="w-full rounded-xl border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-fore outline-none transition focus:border-fono" />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-mute transition hover:border-fono hover:text-fore">
                      <Icon name="image" className="h-3.5 w-3.5" />{adjunto ? adjunto.name : 'Adjuntar foto o PDF'}
                      <AttachmentInput inputRef={fileRef} className="hidden" onSelect={file => { setAdjunto(file); setError('') }} onError={setError} />
                    </label>
                    <Button type="submit" disabled={subiendo || (!comentario.trim() && !adjunto)}>{subiendo ? 'Enviando…' : 'Comentar'}</Button>
                    <span className="text-[10px] text-mute">Solo tú y otros empleados pueden ver los comentarios.</span>
                  </div>
                </form>
                <div className="mt-4 space-y-4">
                  {events.map(event => <article key={`${event.type}-${event.id}`} className="flex gap-3">
                    <span title={event.user?.name || 'Sistema'}><Avatar name={event.user?.name || 'Sistema'} size="sm" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-mute"><span className="font-semibold text-fore">{relativeDate(event.at)}</span></p>
                      {event.type === 'comment' && <>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{event.body}</p>
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
          </section>
        </div>
      )}
      <ComprobantePreview order={order} open={comprobante} onClose={() => setComprobante(false)} />
    </Drawer>
  )
}
