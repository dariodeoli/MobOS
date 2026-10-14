import { DEFAULT_FX_SIDE, DEFAULT_FX_SOURCE, isFxSide, isFxSource } from './sources'
import type { FxPurpose, FxQuote, FxSide } from './types'

// Ajuste por empresa en Tenant.settings.fx: fuente y lado (compra|venta) para
// los cobros en moneda extranjera (sales) y para los costos (costs). Ausente =
// Cambios Chaco · compra para cobros (lo que la casa paga por los dólares que
// entrega el cliente) y Cambios Chaco · venta para costos (lo que cuesta
// conseguir los dólares para pagarle al proveedor).
export type FxRule = { source: string; side: FxSide }
export type FxSettings = { sales: FxRule; costs: FxRule }

const DEFAULT_SIDE_BY_PURPOSE: Record<FxPurpose, FxSide> = { sales: 'compra', costs: DEFAULT_FX_SIDE }

const asObject = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null)

function ruleFrom(value: unknown, purpose: FxPurpose): FxRule {
  const raw = asObject(value)
  return {
    source: raw && isFxSource(raw.source) ? raw.source : DEFAULT_FX_SOURCE,
    side: raw && isFxSide(raw.side) ? raw.side : DEFAULT_SIDE_BY_PURPOSE[purpose],
  }
}

export function fxSettingsFrom(settings: unknown): FxSettings {
  const fx = asObject(asObject(settings)?.fx)
  return { sales: ruleFrom(fx?.sales, 'sales'), costs: ruleFrom(fx?.costs, 'costs') }
}

/** Valida el cuerpo del PUT; devuelve el ajuste normalizado o el mensaje de error. */
export function validateFxSettings(body: unknown): { ok: true; value: FxSettings } | { ok: false; error: string } {
  const raw = asObject(body)
  if (!raw) return { ok: false, error: 'Indicá la fuente y el lado de la cotización.' }
  const out: Partial<FxSettings> = {}
  for (const purpose of ['sales', 'costs'] as FxPurpose[]) {
    const rule = asObject(raw[purpose])
    if (!rule || !isFxSource(rule.source)) return { ok: false, error: 'La fuente de cotización no es válida.' }
    if (!isFxSide(rule.side)) return { ok: false, error: 'Elegí compra o venta.' }
    out[purpose] = { source: rule.source, side: rule.side }
  }
  return { ok: true, value: out as FxSettings }
}

export function pickRate(quote: FxQuote, side: FxSide): number { return side === 'compra' ? quote.compra : quote.venta }
