import { json } from '../../../lib/http'
import { MOBOS_IDENTITY } from '../../../lib/identity'

// Configuración pública para la app de iPhone: versión mínima y enlaces legales.
export const dynamic = 'force-dynamic'
export async function GET() {
  const site = MOBOS_IDENTITY.urls.website
  const env = (name: string, fallback: string) => (process.env[name] || '').trim() || fallback
  return json({
    minVersion: { ios: env('MOBOS_IOS_MIN_VERSION', '1.0.0') },
    supportUrl: env('MOBOS_SUPPORT_URL', `${site}/soporte`),
    privacyUrl: env('MOBOS_PRIVACY_URL', `${site}/privacidad`),
    termsUrl: env('MOBOS_TERMS_URL', `${site}/terminos`),
  })
}
