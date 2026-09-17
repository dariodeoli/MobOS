import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer, Badge, Button, Input, Select, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api, API_URL } from '@/lib/api/client'
import { gs } from '@/utils/calculos'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { printOrderReceipt } from '@/components/shared/OrderReceipt'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'

const FULFILLMENT = FULFILLMENT_LABELS
const PAYMENT_TONE = (status) => status === 'Pagado' ? 'green' : status === 'Parcial' ? 'orange' : 'red'
const PAYMENT_STATUS = { CONFIRMED: 'Confirmado', PENDING: 'Pendiente', REFUNDED: 'Reembolsado', REJECTED: 'Rechazado' }
const AUDIT_LABELS = {
  ORDER_FULFILLMENT_UPDATED: (meta) => `Entrega: ${FULFILLMENT[meta?.previous] || meta?.previous || '—'} → ${FULFILLMENT[meta?.current] || meta?.current || '—'}`,
  ORDER_SERIALS_ATTACHED: (meta) => `IMEI agregados al pedido: ${(meta?.serials || []).join(', ')}`,
  ORDER_BILLING_UPDATED: (meta) => meta?.billingName ? `Factura a nombre de ${meta.billingName}` : 'Datos de factura actualizados',
  ORDER_DISCOUNT_APPROVED: (meta) => `Descuento aprobado: ${gs(Number(meta?.discountPyg || 0))}`,
  ORDER_TAGS_UPDATED: (meta) => (meta?.tags || []).length ? `Etiquetas: ${meta.tags.join(', ')}` : 'Etiquetas quitadas',
  ORDER_ARCHIVED: () => 'Pedido archivado',
  ORDER_UNARCHIVED: () => 'Pedido desarchivado',
  INVENTORY_UNITS_SOLD: (meta) => `Equipos vendidos: ${(meta?.serials || []).join(', ')}`,
  ORDER_NOTIFIED_WHATSAPP: () => 'Aviso enviado al cliente por WhatsApp',
}

function iniciales(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || '?'
}
function Avatar({ name, size = 'md' }) {
  return <span className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-fono to-fono-dark font-bold text-onbrand ${size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'}`}>{iniciales(name)}</span>
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

// Miniatura de una foto de comentario: se descarga con sesión y se muestra
// como vignette; al hacer clic se abre el archivo.
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

export default function PedidoDetalle({ row, esDemo, customerOrderCount = 0, onClose, onChanged }) {
  const toast = useToast()
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

  const order = detail || row
  const items = order.items || []
  const payments = order.payments || []
  const paid = payments.filter(pago => pago.status === 'CONFIRMED').reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0)
  const total = Number(order.totalPyg ?? order.total ?? 0)
  const pendiente = Math.max(0, total - paid)
  const estadoPago = paid >= total && total > 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente'
  const tags = Array.isArray(order.tags) ? order.tags : []
  const archivado = Boolean(order.archivedAt)

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

  async function accion(operation, success) {
    if (busy || esDemo) return
    setBusy(true); setError('')
    try { await operation(); toast.success(success); await load(); onChanged?.() } catch (cause) { setError(cause?.message || 'No se pudo actualizar el pedido.') } finally { setBusy(false) }
  }
  const cambiarEntrega = (fulfillmentStatus) => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { fulfillmentStatus }), 'Entrega actualizada.')
  const alternarArchivado = () => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { action: archivado ? 'unarchive' : 'archive' }), archivado ? 'Pedido desarchivado.' : 'Pedido archivado.')
  const guardarTags = (next) => accion(() => api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { tags: next }), 'Etiquetas actualizadas.')
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
    <Drawer open onClose={onClose} title={order.orderNumber || order.number || 'Pedido'} className="w-full sm:max-w-2xl">
      {loading && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {!loading && (
        <div className="space-y-5">
          {/* Estado y cabecera */}
          <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={PAYMENT_TONE(estadoPago)}>{estadoPago}</Badge>
              <Badge color={order.fulfillmentStatus === 'DELIVERED' ? 'green' : order.fulfillmentStatus === 'READY_FOR_PICKUP' ? 'orange' : 'slate'}>{FULFILLMENT[order.fulfillmentStatus] || order.fulfillmentStatus || 'Preparando'}</Badge>
              {archivado && <Badge color="slate">Archivado</Badge>}
              {order.billingName && <Badge color="blue">Factura: {order.billingName}</Badge>}
            </div>
            <p className="mt-3 text-xs text-mute">
              {order.seller?.name ? `${order.seller.name} · ` : ''}{order.branch?.name || 'Sucursal'}{order.date || order.createdAt ? ` · ${relativeDate(order.createdAt || order.date)}` : ''}
            </p>
            {row.publicToken && !esDemo && <p className="mt-1 truncate font-mono text-[10px] text-mute">Token público: {row.publicToken}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!esDemo && <Select aria-label="Estado de entrega" className="max-w-[190px]" value={order.fulfillmentStatus || 'PROCESSING'} disabled={busy} onChange={event => cambiarEntrega(event.target.value)}>{Object.entries(FULFILLMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}
              {!esDemo && ['IN_TRANSIT', 'READY_FOR_PICKUP'].includes(order.fulfillmentStatus) && <Button variant={order.notifiedAt ? 'outline' : 'primary'} disabled={avisando} onClick={avisarPorWhatsApp}>{avisando ? 'Preparando…' : order.notifiedAt ? 'Avisar de nuevo' : 'Avisar por WhatsApp'}</Button>}
              {order.notifiedAt && <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">Avisado {relativeDate(order.notifiedAt)}</span>}
              <Button variant="outline" onClick={() => printOrderReceipt(order)}>Imprimir comprobante</Button>
              {!esDemo && <button type="button" disabled={busy} onClick={alternarArchivado} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">{archivado ? 'Desarchivar' : 'Archivar'}</button>}
            </div>
          </section>

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
                      <p className="text-sm font-semibold">{gs(Number(item.totalPyg ?? 0))}</p>
                      <p className="text-[11px] text-mute">{gs(Number(item.unitPricePyg ?? 0))} × {item.quantity || 1}{Number(item.discountPyg || 0) > 0 ? ` · −${gs(item.discountPyg)}` : ''}</p>
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
              <p className="flex justify-between"><span className="text-mute">Subtotal · {items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} artículos</span><span className="tabular-nums">{gs(Number(order.subtotalPyg ?? total))}</span></p>
              {Number(order.discountPyg || 0) > 0 && <p className="flex justify-between text-warn"><span>Descuento</span><span className="tabular-nums">− {gs(order.discountPyg)}</span></p>}
              {Number(order.deliveryPyg || 0) > 0 && <p className="flex justify-between"><span className="text-mute">Envío</span><span className="tabular-nums">{gs(order.deliveryPyg)}</span></p>}
              <p className="flex justify-between border-t border-ink-600 pt-1.5 font-bold"><span>Total</span><span className="tabular-nums">{gs(total)}</span></p>
              <p className="flex justify-between text-ok"><span>Pagado</span><span className="tabular-nums">{gs(paid)}</span></p>
              {pendiente > 0 && <p className="flex justify-between text-warn"><span>{order.dueAt ? `Pendiente · vence ${new Date(order.dueAt).toLocaleDateString('es-PY')}` : 'Pendiente'}</span><span className="tabular-nums">{gs(pendiente)}</span></p>}
            </div>
            {payments.length > 0 && <div className="mt-3 space-y-2 border-t border-ink-600 pt-3">
              {payments.map(pago => <div key={pago.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-mute">{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method}{pago.accountSnapshot?.name ? ` · ${pago.accountSnapshot.name}` : ''}{pago.reference ? ` · ${pago.reference}` : ''}</span>
                <span className="flex items-center gap-2"><span className="tabular-nums font-semibold">{gs(Number(pago.amountPyg || 0))}</span><Badge color={pago.status === 'CONFIRMED' ? 'green' : pago.status === 'PENDING' ? 'orange' : 'slate'}>{PAYMENT_STATUS[pago.status] || pago.status}</Badge>{pago.settlesAt && <span className="text-[10px] text-mute">acredita {new Date(pago.settlesAt).toLocaleDateString('es-PY')}</span>}</span>
              </div>)}
            </div>}
          </section>

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
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={event => setAdjunto(event.target.files?.[0] || null)} />
                    </label>
                    <Button type="submit" disabled={subiendo || (!comentario.trim() && !adjunto)}>{subiendo ? 'Enviando…' : 'Comentar'}</Button>
                    <span className="text-[10px] text-mute">Solo tú y otros empleados pueden ver los comentarios.</span>
                  </div>
                </form>
                <div className="mt-4 space-y-4">
                  {events.map(event => <article key={`${event.type}-${event.id}`} className="flex gap-3">
                    <Avatar name={event.user?.name || 'Sistema'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{event.user?.name || 'Sistema'}<span className="ml-2 font-normal text-mute">{relativeDate(event.at)}</span></p>
                      {event.type === 'comment' && <>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{event.body}</p>
                        {(event.photos || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{event.photos.map(photo => <PhotoThumb key={photo.id} orderId={order.id} commentId={event.id} photo={photo} />)}</div>}
                      </>}
                      {event.type === 'payment' && <p className="mt-1 text-sm text-mute">{ETIQUETAS_MEDIO_PAGO[event.payment.method] || event.payment.method} · <b className="text-fore">{gs(Number(event.payment.amountPyg || 0))}</b> · {PAYMENT_STATUS[event.payment.status] || event.payment.status}{event.payment.accountSnapshot?.name ? ` · ${event.payment.accountSnapshot.name}` : ''}{event.payment.reference ? ` · ${event.payment.reference}` : ''}</p>}
                      {event.type === 'audit' && <p className="mt-1 text-sm text-mute">{AUDIT_LABELS[event.action]?.(event.metadata) || event.action}</p>}
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
    </Drawer>
  )
}
