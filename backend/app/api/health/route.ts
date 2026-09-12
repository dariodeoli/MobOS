import { prisma } from '../../../lib/prisma'

export async function GET() {
  const checkedAt = new Date().toISOString()
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({
      ok: true,
      service: 'mobos-backend',
      checkedAt,
      services: { api: 'operational', database: 'operational' },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({
      ok: false,
      service: 'mobos-backend',
      checkedAt,
      services: { api: 'operational', database: 'unavailable' },
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export function HEAD() {
  return new Response(null, { status: 200 })
}
