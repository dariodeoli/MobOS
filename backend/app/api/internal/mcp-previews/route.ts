import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { readBoundedBody } from '../../../../lib/mcp/request-body'
import { pruneMcpImagePreviews, retentionBatchLimit } from '../../../../lib/mcp/preview-retention'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function POST(request: Request) {
  const expected = process.env.MOBOS_MAINTENANCE_TOKEN
  if (!expected) return json({ error: 'maintenance_not_configured' }, 503)
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
  if (!supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return json({ error: 'unauthorized' }, 401)
  let limit: number
  try {
    const raw = await readBoundedBody(request, 4096)
    if (raw === null) return json({ error: 'request_too_large' }, 413)
    const body = raw ? JSON.parse(raw) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'limit')) return json({ error: 'invalid_arguments' }, 400)
    limit = retentionBatchLimit(body.limit)
  } catch { return json({ error: 'invalid_arguments' }, 400) }
  try { return json(await pruneMcpImagePreviews(prisma, { limit })) }
  catch { return json({ error: 'maintenance_unavailable' }, 503) }
}
