import type { FxCurrency, FxSide } from './types'

// Fuentes elegibles por empresa. `cambioschaco` es la predeterminada (#401).
export const FX_SOURCES: Record<string, string> = {
  cambioschaco: 'Cambios Chaco',
  bcp: 'BCP',
  set: 'SET',
  bonanza: 'Bonanza',
  cambiosalberdi: 'Cambios Alberdi',
  eurocambios: 'Eurocambios',
  familiar: 'Familiar',
  gnbfusion: 'GNB Fusión',
  lamoneda: 'La Moneda',
  mundialcambios: 'Mundial Cambios',
  mydcambios: 'MyD Cambios',
}
export const FX_CURRENCIES: FxCurrency[] = ['USD', 'BRL', 'ARS', 'EUR']
export const DEFAULT_FX_SOURCE = 'cambioschaco'
export const DEFAULT_FX_SIDE: FxSide = 'venta'

export const fxSourceLabel = (source: string): string => FX_SOURCES[source] || source
export const isFxSource = (value: unknown): value is string => typeof value === 'string' && Object.prototype.hasOwnProperty.call(FX_SOURCES, value)
export const isFxSide = (value: unknown): value is FxSide => value === 'compra' || value === 'venta'
export const isFxCurrency = (value: unknown): value is FxCurrency => typeof value === 'string' && (FX_CURRENCIES as string[]).includes(value)
