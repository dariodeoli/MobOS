import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

const WINDOW_MS = 60_000
export class McpAccessError extends Error {
  constructor(public code: 'mcp_rate_limited' | 'mcp_unavailable', public status: 429 | 503, public retryAfter?: number) { super(code) }
}
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex')

/** Two all-or-nothing PostgreSQL budgets. Missing infrastructure never grants access. */
export async function consumeMcpQuota(db: PrismaClient, grantId: string, tenantId: string) {
  const grantLimit = Number(process.env.MOBOS_MCP_GRANT_MINUTE_LIMIT ?? 120)
  const tenantLimit = Number(process.env.MOBOS_MCP_TENANT_MINUTE_LIMIT ?? 600)
  if (![grantLimit, tenantLimit].every(value => Number.isSafeInteger(value) && value > 0)) throw new McpAccessError('mcp_unavailable', 503)
  const budgets = [
    { scope: 'mcp:grant', key: fingerprint(`mcp:grant:${grantId}`), limit: grantLimit },
    { scope: 'mcp:tenant', key: fingerprint(`mcp:tenant:${tenantId}`), limit: tenantLimit },
  ]
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const key of budgets.map(value => `${value.scope}:${value.key}`).sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
      const clock = await tx.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
      const epochMs = Number(clock[0]?.nowMs)
      if (!Number.isSafeInteger(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) throw new Error('Invalid quota clock')
      const now = new Date(epochMs), since = new Date(epochMs - WINDOW_MS)
      for (const budget of budgets) {
        const where = { scope: budget.scope, fingerprint: budget.key, createdAt: { gte: since } }
        await tx.authAttempt.deleteMany({ where: { scope: budget.scope, fingerprint: budget.key, createdAt: { lt: since } } })
        if (await tx.authAttempt.count({ where }) >= budget.limit) {
          const first = await tx.authAttempt.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
          const retry = Math.max(1, Math.ceil(((first?.createdAt.getTime() ?? epochMs) + WINDOW_MS - epochMs) / 1000))
          throw new McpAccessError('mcp_rate_limited', 429, retry)
        }
        await tx.authAttempt.create({ data: { scope: budget.scope, fingerprint: budget.key, createdAt: now } })
      }
    }, { maxWait: 10_000, timeout: 10_000 })
  } catch (error) {
    if (error instanceof McpAccessError) throw error
    throw new McpAccessError('mcp_unavailable', 503)
  }
}

export function mcpAccessFailure(error: unknown) {
  const safe = error instanceof McpAccessError ? error : new McpAccessError('mcp_unavailable', 503)
  return Response.json({ error: safe.code }, { status: safe.status, headers: { 'Cache-Control': 'no-store', ...(safe.status === 429 && safe.retryAfter ? { 'Retry-After': String(safe.retryAfter) } : {}) } })
}
