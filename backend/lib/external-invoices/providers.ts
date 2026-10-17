import { createHash } from 'node:crypto'
import type { InvoiceProvider, InvoiceProviderPayload, ProviderInvoiceResult } from './contracts'

/** Stable per tenant/order/provider key; a configured provider must honor it on retries. */
export function invoiceIdempotencyKey(tenantId: string, orderId: string, providerId: string) {
  return createHash('sha256').update(`${tenantId}:${orderId}:${providerId}`).digest('hex')
}

/** Deterministic test/development provider. It never contacts an external service or issues a fiscal document. */
export class SimulatedInvoiceProvider implements InvoiceProvider {
  readonly id = 'simulated'
  private readonly results = new Map<string, ProviderInvoiceResult>()

  async issue(payload: InvoiceProviderPayload, idempotencyKey: string): Promise<ProviderInvoiceResult> {
    const previous = this.results.get(idempotencyKey)
    if (previous) return previous
    const result = {
      providerDocumentId: `SIM-${createHash('sha256').update(`${idempotencyKey}:${payload.order.number}`).digest('hex').slice(0, 16)}`,
      documentNumber: null,
      documentUrl: null,
      simulated: true,
    }
    this.results.set(idempotencyKey, result)
    return result
  }
}

/** No real provider is registered until its API, credentials and contract are supplied. */
export function configuredInvoiceProvider(env: NodeJS.ProcessEnv = process.env): InvoiceProvider | null {
  if (env.MOBOS_EXTERNAL_INVOICE_PROVIDER === 'simulated' && env.NODE_ENV !== 'production') return new SimulatedInvoiceProvider()
  return null
}
