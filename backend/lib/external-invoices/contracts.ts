export type InvoiceProviderPayload = {
  order: { id: string; number: string; currency: 'PYG'; subtotalPyg: number; discountPyg: number; deliveryPyg: number; totalPyg: number }
  customer: { name: string; ruc: string; address?: string; email?: string; phone?: string }
  lines: Array<{ description: string; quantity: number; unitPricePyg: number; totalPyg: number }>
}

export type ProviderInvoiceResult = {
  providerDocumentId: string
  documentNumber: string | null
  documentUrl: string | null
  simulated: boolean
}

export interface InvoiceProvider {
  readonly id: string
  issue(payload: InvoiceProviderPayload, idempotencyKey: string): Promise<ProviderInvoiceResult>
}

export class InvoicePayloadError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoicePayloadError' }
}

const money = (value: unknown, label: string) => {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) throw new InvoicePayloadError(`${label} no es un monto válido en guaraníes.`)
  return amount
}

/** Builds only from the frozen order and its linked customer; caller may supply the billing address. */
export function buildInvoicePayload(input: {
  order: { id: string; orderNumber: string; subtotalPyg: bigint | number; discountPyg: bigint | number; deliveryPyg: bigint | number; totalPyg: bigint | number; billingName?: string | null; billingDocument?: string | null; items: Array<{ description: string; quantity: number; unitPricePyg: bigint | number; totalPyg: bigint | number }> }
  customer?: { name?: string | null; document?: string | null; billingName?: string | null; billingDocument?: string | null; email?: string | null; phone?: string | null; addresses?: Array<{ address: string; city?: string | null; department?: string | null; isDefault?: boolean }> } | null
}): InvoiceProviderPayload {
  const { order, customer } = input
  const name = String(order.billingName || customer?.billingName || customer?.name || '').trim()
  const ruc = String(order.billingDocument || customer?.billingDocument || customer?.document || '').trim()
  if (!name) throw new InvoicePayloadError('Completá el nombre o razón social para facturar.')
  if (!ruc) throw new InvoicePayloadError('Completá el RUC para facturar.')
  if (!order.items.length) throw new InvoicePayloadError('El pedido no tiene productos para facturar.')
  const address = customer?.addresses?.slice().sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))[0]
  const addressText = [address?.address, address?.city, address?.department].filter(Boolean).join(', ').trim()
  const lines = order.items.map(item => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new InvoicePayloadError('Una línea del pedido tiene una cantidad inválida.')
    const description = String(item.description || '').trim()
    if (!description) throw new InvoicePayloadError('Una línea del pedido no tiene descripción.')
    return { description, quantity: item.quantity, unitPricePyg: money(item.unitPricePyg, 'El precio unitario'), totalPyg: money(item.totalPyg, 'El total de línea') }
  })
  const subtotalPyg = money(order.subtotalPyg, 'El subtotal')
  const discountPyg = money(order.discountPyg, 'El descuento')
  const deliveryPyg = money(order.deliveryPyg, 'El costo de entrega')
  const totalPyg = money(order.totalPyg, 'El total del pedido')
  if (lines.reduce((sum, line) => sum + line.totalPyg, 0) !== subtotalPyg || subtotalPyg - discountPyg + deliveryPyg !== totalPyg) {
    throw new InvoicePayloadError('Los importes del pedido no cierran; revisalo antes de facturar.')
  }
  return {
    order: {
      id: order.id, number: order.orderNumber, currency: 'PYG',
      subtotalPyg, discountPyg, deliveryPyg, totalPyg,
    },
    customer: {
      name, ruc,
      ...(addressText ? { address: addressText } : {}),
      ...(customer?.email?.trim() ? { email: customer.email.trim().toLowerCase() } : {}),
      ...(customer?.phone?.trim() ? { phone: customer.phone.trim() } : {}),
    },
    lines,
  }
}
