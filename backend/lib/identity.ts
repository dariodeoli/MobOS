export const MOBOS_IDENTITY = {
  productName: 'MobOS',
  apiName: 'MobOS API',
  apiService: 'mobos-backend',
  description: 'Backend API for MobOS retail operations.',
  faviconPath: '/favicon.ico',
  faviconType: 'image/x-icon',
  urls: {
    website: 'https://moboss.online',
    app: 'https://app.moboss.online',
    api: 'https://api.moboss.online',
  },
} as const

export const MOBOS_LOCAL_APP_ORIGIN = 'http://localhost:5175'

// Keep the former API hostname as a redirect-only migration surface.
// Legacy app origins are intentionally not allowed to make credentialed requests.
export const MOBOS_LEGACY_API_HOSTS = new Set(['api.controlaria.online'])

export const MOBOS_ALLOWED_APP_ORIGINS = [
  MOBOS_IDENTITY.urls.app,
  MOBOS_IDENTITY.urls.website,
  MOBOS_LOCAL_APP_ORIGIN,
] as const

export const MOBOS_IDENTITY_HEADERS = {
  Link: `<${MOBOS_IDENTITY.faviconPath}>; rel="icon"; type="${MOBOS_IDENTITY.faviconType}"`,
} as const
