// Cotizaciones de moneda extranjera (#401): modelo normalizado y contrato de
// proveedor. Cada fuente (casa de cambio o BCP) se resuelve por un proveedor;
// hoy todas salen de dolar.melizeche.com, que agrega las casas paraguayas.

export type FxCurrency = 'USD' | 'BRL' | 'ARS' | 'EUR'
export type FxSide = 'compra' | 'venta'
export type FxPurpose = 'sales' | 'costs'

/** Cotización normalizada: lo único que consumen rutas y pantallas. */
export type FxQuote = {
  source: string
  currency: FxCurrency
  compra: number
  venta: number
  /** Momento que declara el proveedor (ISO 8601); null si no lo informa. */
  updatedAt: string | null
  /** Referencial diario del BCP, si la fuente lo trae. */
  referencial?: number | null
}

/** Un proveedor trae todas las cotizaciones que conoce en una sola consulta. */
export interface FxProvider {
  id: string
  fetchAll(signal?: AbortSignal): Promise<FxQuote[]>
}

export class FxUnavailableError extends Error {
  code: 'fx_unavailable' | 'fx_currency_unavailable'
  constructor(message: string, code: 'fx_unavailable' | 'fx_currency_unavailable' = 'fx_unavailable') {
    super(message)
    this.code = code
  }
}
