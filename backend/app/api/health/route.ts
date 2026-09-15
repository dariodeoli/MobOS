import { prisma } from '../../../lib/prisma'
import { MOBOS_IDENTITY, MOBOS_IDENTITY_HEADERS } from '../../../lib/identity'
import { emailTransportConfigured } from '../../../lib/email'

function healthHeaders() {
  return { 'Cache-Control': 'no-store', ...MOBOS_IDENTITY_HEADERS }
}

export async function GET() {
  const checkedAt = new Date().toISOString()
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({
      ok: true,
      service: MOBOS_IDENTITY.apiService,
      checkedAt,
      services: { api: 'operational', database: 'operational', email: emailTransportConfigured() ? 'configured' : 'unconfigured' },
    }, { headers: healthHeaders() })
  } catch {
    return Response.json({
      ok: false,
      service: MOBOS_IDENTITY.apiService,
      checkedAt,
      services: { api: 'operational', database: 'unavailable', email: emailTransportConfigured() ? 'configured' : 'unconfigured' },
    }, { status: 503, headers: healthHeaders() })
  }
}

export function HEAD() {
  return new Response(null, { status: 200, headers: healthHeaders() })
}
