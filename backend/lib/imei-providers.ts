/**
 * Registro y contrato común de proveedores de verificación IMEI (#585).
 *
 * Este módulo sólo describe capacidades y disponibilidad. No contiene secretos
 * ni hace llamadas de red. Los adaptadores reales se habilitan detrás de
 * credenciales del servidor y un flag explícito; sin configuración permanecen
 * `coming_soon` y el endpoint debe fallar cerrado.
 */

export type ImeiProviderId = 'imeicheck.net' | 'imei.info'
export type ImeiProviderAvailability = 'configured' | 'simulated' | 'coming_soon'

export type ImeiProviderCapability =
  | 'blacklist'
  | 'blacklist_history'
  | 'carrier_lock'
  | 'find_my'
  | 'sim_lock'
  | 'mdm'
  | 'warranty'
  | 'model'

export type ImeiProviderDefinition = {
  id: ImeiProviderId
  name: string
  availability: ImeiProviderAvailability
  /** Flag explícito que debe estar activo junto con la credencial del servidor. */
  liveFlag: string
  secretEnv: string
  capabilities: ImeiProviderCapability[]
  /** Nunca se muestra el secreto ni una URL con credenciales al navegador. */
  browserSafe: true
}

const CATALOG: readonly ImeiProviderDefinition[] = [
  {
    id: 'imeicheck.net',
    name: 'IMEIcheck.net',
    availability: 'simulated',
    liveFlag: 'IMEICHECK_LIVE',
    secretEnv: 'IMEICHECK_TOKEN',
    capabilities: ['blacklist', 'blacklist_history', 'carrier_lock', 'find_my', 'sim_lock', 'mdm', 'warranty', 'model'],
    browserSafe: true,
  },
  {
    id: 'imei.info',
    name: 'IMEI.info',
    availability: 'coming_soon',
    liveFlag: 'IMEI_INFO_LIVE',
    secretEnv: 'IMEI_INFO_TOKEN',
    capabilities: ['blacklist', 'carrier_lock', 'find_my', 'sim_lock', 'warranty', 'model'],
    browserSafe: true,
  },
]

export function imeiProviderCatalog(env: NodeJS.ProcessEnv = process.env): ImeiProviderDefinition[] {
  return CATALOG.map((provider) => ({
    ...provider,
    availability: provider.id === 'imeicheck.net'
      ? env.IMEICHECK_LIVE === '1' && Boolean(env.IMEICHECK_TOKEN) ? 'configured' : 'simulated'
      : env.IMEI_INFO_LIVE === '1' && Boolean(env.IMEI_INFO_TOKEN) ? 'configured' : 'coming_soon',
    capabilities: [...provider.capabilities],
  }))
}

export function findImeiProvider(id: unknown, env: NodeJS.ProcessEnv = process.env): ImeiProviderDefinition | undefined {
  return imeiProviderCatalog(env).find((provider) => provider.id === id)
}

export function providerCanRunLive(id: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  return findImeiProvider(id, env)?.availability === 'configured'
}

/** Proyección segura para respuestas HTTP: sólo datos públicos del catálogo. */
export function publicImeiProviders(env: NodeJS.ProcessEnv = process.env) {
  return imeiProviderCatalog(env).map(({ id, name, availability, capabilities, browserSafe }) => ({
    id, name, availability, capabilities, browserSafe,
    seleccionado: id === 'imeicheck.net',
  }))
}
