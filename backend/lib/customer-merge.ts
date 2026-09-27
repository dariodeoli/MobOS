// Unificar clientes duplicados (#268): reglas puras del merge. La ficha
// principal manda; del duplicado solo se rellenan los huecos y se suman los
// saldos (puntos) y las etiquetas. El duplicado queda archivado con puntero.
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export const ROLES_MERGE = ['ADMIN', 'GERENTE'] as const

export function puedeUnificar(rol: string | null | undefined): boolean {
  return ROLES_MERGE.includes(String(rol || '') as (typeof ROLES_MERGE)[number])
}

const vacio = (valor: unknown) => valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')

type ClienteDb = Pick<typeof prisma,
  'order' | 'payment' | 'quote' | 'customerNote' | 'customerFollowUp' | 'customerNotice' | 'customerAddress' | 'customerBillingIdentity' |
  'customerPortalToken' | 'warrantyCase' | 'serviceOrder' | 'storeCredit' | 'loyaltyMovement' | 'inventoryUnit' | 'customerAuthorization' |
  'deviceReportShare' | 'marketingRecipient' | 'suspendedSale' | 'supplyNeed'>

/** Lo que se mueve si esa ficha queda como duplicada (sirve para el preview y
 *  para el resumen auditado del merge). */
export async function conteosDe(db: ClienteDb, customerId: string) {
  const [orders, payments, quotes, notes, followUps, notices, addresses, billingIdentities, portalTokens, warranties, serviceOrders, storeCredits, loyaltyMovements, reservations, authorizations, deviceReportShares, marketingRecipients, suspendedSales, supplyNeeds] = await Promise.all([
    db.order.count({ where: { customerId } }),
    db.payment.count({ where: { order: { customerId } } }),
    db.quote.count({ where: { customerId } }),
    db.customerNote.count({ where: { customerId } }),
    db.customerFollowUp.count({ where: { customerId } }),
    db.customerNotice.count({ where: { customerId } }),
    db.customerAddress.count({ where: { customerId } }),
    db.customerBillingIdentity.count({ where: { customerId } }),
    db.customerPortalToken.count({ where: { customerId, revokedAt: null } }),
    db.warrantyCase.count({ where: { customerId } }),
    db.serviceOrder.count({ where: { customerId } }),
    db.storeCredit.count({ where: { customerId, remainingPyg: { gt: 0 } } }),
    db.loyaltyMovement.count({ where: { customerId } }),
    db.inventoryUnit.count({ where: { reservationCustomerId: customerId } }),
    db.customerAuthorization.count({ where: { customerId } }),
    db.deviceReportShare.count({ where: { customerId } }),
    db.marketingRecipient.count({ where: { customerId } }),
    db.suspendedSale.count({ where: { customerId } }),
    db.supplyNeed.count({ where: { customerId } }),
  ])
  return { orders, payments, quotes, notes, followUps, notices, addresses, billingIdentities, portalTokens, warranties, serviceOrders, storeCredits, loyaltyMovements, reservations, authorizations, deviceReportShares, marketingRecipients, suspendedSales, supplyNeeds }
}

export type ClienteFusionable = {
  firstName?: string | null
  secondName?: string | null
  phone?: string | null
  countryCode?: string | null
  email?: string | null
  document?: string | null
  billingName?: string | null
  billingDocument?: string | null
  notes?: string | null
  publicNote?: string | null
  externalId?: string | null
  priceListId?: string | null
  creditLimitPyg?: number | null
  creditDays?: number | null
  insuranceEnabled?: boolean | null
  insuranceRatePct?: unknown
  loyaltyPointsPyg?: number | null
  acceptsEmailMarketing?: boolean | null
  acceptsSmsMarketing?: boolean | null
  acceptsWhatsappMarketing?: boolean | null
  taxExempt?: boolean | null
  tags?: string[] | null
}

/**
 * Datos que recibe la ficha principal al unificar: se respeta lo suyo y solo se
 * completa lo que estaba vacío. Puntos y etiquetas se suman/unen.
 */
export function fusionarEscalares(principal: ClienteFusionable, duplicado: ClienteFusionable) {
  const data: Record<string, unknown> = {}
  const rellenados: string[] = []
  const completar = (campo: keyof ClienteFusionable, columna = campo as string) => {
    if (vacio(principal[campo]) && !vacio(duplicado[campo])) {
      data[columna] = duplicado[campo]
      rellenados.push(columna)
    }
  }

  for (const campo of ['firstName', 'secondName', 'phone', 'email', 'document', 'billingName', 'billingDocument', 'notes', 'publicNote', 'externalId', 'priceListId', 'creditLimitPyg', 'creditDays', 'insuranceRatePct'] as const) {
    completar(campo)
  }
  // El seguro se hereda solo si el principal no lo tenía activado.
  if (!principal.insuranceEnabled && duplicado.insuranceEnabled) {
    data.insuranceEnabled = true
    rellenados.push('insuranceEnabled')
  }
  const etiquetas = [...new Set([...(principal.tags || []), ...(duplicado.tags || [])])]
  if (etiquetas.length !== (principal.tags || []).length) {
    data.tags = etiquetas
    rellenados.push('tags')
  }
  // Los puntos son un saldo: se suman (1 punto = 1 Gs. canjeable).
  const puntos = Number(principal.loyaltyPointsPyg || 0) + Number(duplicado.loyaltyPointsPyg || 0)
  if (puntos !== Number(principal.loyaltyPointsPyg || 0)) {
    data.loyaltyPointsPyg = puntos
  }
  // Consentimientos y exención: se conserva lo ya declarado (OR).
  for (const campo of ['acceptsEmailMarketing', 'acceptsSmsMarketing', 'acceptsWhatsappMarketing', 'taxExempt'] as const) {
    if (!principal[campo] && duplicado[campo]) data[campo] = true
  }
  return { data, rellenados }
}

export type ConteosMerge = Record<string, number>

/** Resumen legible para la auditoría y la cronología. */
export function resumenMerge(conteos: ConteosMerge = {}): string {
  const etiquetas: Record<string, [string, string]> = {
    orders: ['pedido', 'pedidos'],
    payments: ['pago', 'pagos'],
    quotes: ['cotización', 'cotizaciones'],
    notes: ['nota', 'notas'],
    followUps: ['seguimiento', 'seguimientos'],
    notices: ['mensaje', 'mensajes'],
    addresses: ['dirección', 'direcciones'],
    billingIdentities: ['titular', 'titulares'],
    portalTokens: ['enlace del portal', 'enlaces del portal'],
    warranties: ['garantía', 'garantías'],
    serviceOrders: ['orden de taller', 'órdenes de taller'],
    storeCredits: ['saldo a favor', 'saldos a favor'],
    loyaltyMovements: ['movimiento de puntos', 'movimientos de puntos'],
    reservations: ['reserva', 'reservas'],
    authorizations: ['autorización', 'autorizaciones'],
    deviceReportShares: ['informe compartido', 'informes compartidos'],
    marketingRecipients: ['envío de campaña', 'envíos de campaña'],
    suspendedSales: ['venta suspendida', 'ventas suspendidas'],
    supplyNeeds: ['necesidad de compra', 'necesidades de compra'],
  }
  const partes = Object.entries(conteos)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([clave, cantidad]) => {
      const [singular, plural] = etiquetas[clave] || [clave, clave]
      return `${cantidad} ${cantidad === 1 ? singular : plural}`
    })
  return partes.join(' · ')
}

/** Claves que se conservan al fusionar (para el preview de conflictos). */
export function conflictosDeContacto(principal: ClienteFusionable, duplicado: ClienteFusionable) {
  const conflictos: Array<{ campo: string; principal: string; duplicado: string }> = []
  const par = (campo: string, a: unknown, b: unknown) => {
    if (!vacio(a) && !vacio(b) && String(a).trim().toLowerCase() !== String(b).trim().toLowerCase()) conflictos.push({ campo, principal: String(a), duplicado: String(b) })
  }
  par('Teléfono', principal.phone, duplicado.phone)
  par('Correo', principal.email, duplicado.email)
  par('Documento', principal.document, duplicado.document)
  return conflictos
}
