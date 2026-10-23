import { useEffect, useState } from 'react'
import { Money, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { apiFetch } from '@/lib/api/client'
import { FULFILLMENT_LABELS } from '@/lib/constants'
import { primerNombre } from '@/lib/utils'
import { gs } from '@/utils/calculos'

const FULFILLMENT = FULFILLMENT_LABELS
export const PAYMENT_STATUS = { CONFIRMED: 'Confirmado', PENDING: 'Por verificar', REFUNDED: 'Reembolsado', REJECTED: 'Rechazado' }
export const AUDIT_LABELS = {
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

export function nombreActor(name) {
  // Solo el primer nombre (#212): «Dario creó el pedido», no el nombre completo.
  const corto = primerNombre(String(name || '').trim())
  return corto ? corto.charAt(0).toUpperCase() + corto.slice(1) : 'Sistema'
}

export function relativeDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hoy = new Date(); const ayer = new Date(Date.now() - 86400000)
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === hoy.toDateString()) return `Hoy ${hora}`
  if (date.toDateString() === ayer.toDateString()) return `Ayer ${hora}`
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('-', ' ') + ` ${hora}`
}

export function PhotoThumb({ orderId, commentId, photo }) {
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
