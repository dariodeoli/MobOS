// Envío de la cotización por correo (junto con POS/PRN): arma el mensaje con el
// detalle y el enlace público, y lo encola en la outbox (reintentos, auditoría)
// con una clave idempotente por cotización + versión, de modo que dos clics o
// dos requests del mismo envío no dupliquen el correo. Un `reintento` explícito
// (fallo definitivo o pedido del vendedor) usa una clave nueva.
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { actionLink, emailTransportConfigured, quoteEmail } from './email'
import { dispatchEmailOutboxJob, enqueueEmail, withEmailOutboxTransaction } from './email-outbox'
import { prisma } from './prisma'

export type CotizacionParaCorreo = {
  id: string
  number: string
  customerName: string
  customerId: string | null
  publicToken: string | null
  subtotalPyg: number
  discountPyg: number
  totalPyg: number
  validUntil: Date | null
  notes: string | null
  items: unknown
  status: string
  updatedAt: Date
}

export type EnvioCotizacion = {
  estado: 'enviado' | 'encolado' | 'duplicado' | 'fallido'
  outboxId: string
  to: string
  link: string
}

const patronCasilla = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Versión por **contenido** de la cotización: el cambio de estado no la mueve
 * (enviar marca SENT), pero editar ítems, totales, validez o cliente sí.
 */
export function versionCotizacion(cotizacion: Pick<CotizacionParaCorreo, 'number' | 'customerName' | 'items' | 'subtotalPyg' | 'discountPyg' | 'totalPyg' | 'validUntil' | 'notes'>): string {
  const crudo = JSON.stringify([
    cotizacion.number,
    cotizacion.customerName,
    itemsDeCotizacion(cotizacion.items),
    Number(cotizacion.subtotalPyg) || 0,
    Number(cotizacion.discountPyg) || 0,
    Number(cotizacion.totalPyg) || 0,
    cotizacion.validUntil ? new Date(cotizacion.validUntil).toISOString() : null,
    cotizacion.notes || '',
  ])
  return createHash('sha256').update(crudo).digest('hex').slice(0, 16)
}

/** Clave idempotente: misma cotización y mismo contenido ⇒ mismo envío. */
export function claveIdempotenciaCotizacion(quoteId: string, version: string, reintento = false): string {
  const base = `quote-email:${quoteId}:${version}`
  return (reintento ? `${base}:r${Date.now()}` : base).slice(0, 180)
}

export function enlacePublicoCotizacion(publicToken: string | null | undefined): string | null {
  if (!publicToken) return null
  return actionLink('/cotizacion', publicToken)
}

export function itemsDeCotizacion(items: unknown): Array<{ quantity: number; description: string; unitPricePyg: number }> {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => ({
      quantity: Math.max(0, Number((item as { quantity?: unknown })?.quantity) || 0),
      description: String((item as { description?: unknown })?.description || '').trim() || 'Ítem',
      unitPricePyg: Math.max(0, Number((item as { unitPricePyg?: unknown })?.unitPricePyg) || 0),
    }))
    .filter((item) => item.quantity > 0)
}

/**
 * Arma el correo de la cotización. Devuelve `null` cuando falta el correo del
 * cliente o el enlace público (la ruta traduce el motivo).
 */
export function armarCorreoCotizacion({ cotizacion, customerName, to, companyName = '', token }: { cotizacion: CotizacionParaCorreo; customerName: string; to: string; companyName?: string; token: string | null }) {
  if (!patronCasilla.test(String(to || '').trim())) return null
  const link = enlacePublicoCotizacion(token)
  if (!link) return null
  const items = itemsDeCotizacion(cotizacion.items)
  if (!items.length) return null
  return quoteEmail({
    to: String(to).trim(),
    customerName: String(customerName || cotizacion.customerName || '').trim(),
    number: cotizacion.number,
    items,
    subtotalPyg: Number(cotizacion.subtotalPyg) || 0,
    discountPyg: Number(cotizacion.discountPyg) || 0,
    totalPyg: Number(cotizacion.totalPyg) || 0,
    validUntil: cotizacion.validUntil,
    link,
    companyName: companyName.trim() || '',
    notes: cotizacion.notes,
  })
}

/**
 * Encola (y dispara) el correo de la cotización. Si ya existe un envío de la
 * misma versión, lo devuelve como `duplicado` sin volver a mandarlo.
 */
export async function enviarCotizacionPorCorreo({ tenantId, cotizacion, to, companyName = '', reintento = false }: { tenantId: string; cotizacion: CotizacionParaCorreo; to: string; companyName?: string; reintento?: boolean }): Promise<EnvioCotizacion> {
  if (!emailTransportConfigured()) throw new Error('EMAIL_TRANSPORT_NOT_CONFIGURED')
  const mensaje = armarCorreoCotizacion({ cotizacion, customerName: cotizacion.customerName, to, companyName, token: cotizacion.publicToken })
  const link = enlacePublicoCotizacion(cotizacion.publicToken) || ''
  if (!mensaje) throw new Error('EMAIL_QUOTE_INCOMPLETA')

  const clave = claveIdempotenciaCotizacion(cotizacion.id, versionCotizacion(cotizacion), reintento)
  const existente = await prisma.emailOutbox.findUnique({ where: { idempotencyKey: clave }, select: { id: true, sentAt: true, cancelledAt: true, failedAt: true } })
  if (existente?.sentAt) return { estado: 'duplicado', outboxId: existente.id, to: mensaje.to, link: link }
  if (existente && !existente.cancelledAt && !existente.failedAt) {
    // Ya hay un envío de esta versión en la cola: se intenta despachar (por si
    // ya venció el reintento) y, si sigue pendiente, se informa duplicado.
    const despachado = await dispatchEmailOutboxJob(existente.id)
    return { estado: despachado.state === 'sent' ? 'enviado' : 'duplicado', outboxId: existente.id, to: mensaje.to, link: link }
  }
  if (existente?.failedAt && !reintento) return { estado: 'fallido', outboxId: existente.id, to: mensaje.to, link: link }

  let outboxId = ''
  await withEmailOutboxTransaction('quote-email', async (tx: Prisma.TransactionClient) => {
    const fila = await enqueueEmail(tx, {
      tenantId,
      kind: 'quote',
      aggregateType: 'Quote',
      aggregateId: cotizacion.id,
      message: { to: mensaje.to, subject: mensaje.subject, html: mensaje.html, text: mensaje.text },
      idempotencyKey: clave,
    })
    outboxId = fila.id
  })
  const despachado = await dispatchEmailOutboxJob(outboxId)
  return {
    estado: despachado.state === 'sent' ? 'enviado' : despachado.state === 'failed' ? 'fallido' : 'encolado',
    outboxId,
    to: mensaje.to,
    link: link,
  }
}
