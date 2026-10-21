import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma'

export const MCP_PREVIEW_RETENTION_BATCH = 100
export const MCP_PREVIEW_RETENTION_MAX_BATCH = 200
export function retentionBatchLimit(value: unknown = MCP_PREVIEW_RETENTION_BATCH) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MCP_PREVIEW_RETENTION_MAX_BATCH) throw new Error('invalid_retention_batch')
  return value as number
}
/** Hash and result remain authoritative for replay; image bytes are not needed after commit. */
export function withoutMcpImageBytes(payload: Record<string, unknown>): Prisma.InputJsonObject {
  const { dataBase64: _bytes, ...metadata } = payload
  return metadata as Prisma.InputJsonObject
}

/** Platform maintenance only. Optional tenant scope is for controlled internal jobs/tests, never model arguments. */
export async function pruneMcpImagePreviews(db: typeof prisma, options: { limit?: number; tenantId?: string } = {}) {
  const limit = retentionBatchLimit(options.limit)
  if (options.tenantId !== undefined && (!options.tenantId || options.tenantId.length > 100)) throw new Error('invalid_retention_tenant')
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`
    const rows = await tx.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT p.id, p."tenantId" FROM "McpChangePreview" p
      LEFT JOIN "McpClientGrant" g ON g.id = p."grantId"
      LEFT JOIN "Session" s ON s.id = p."sessionId"
      WHERE p.action = 'product_images.write' AND p.payload ? 'dataBase64'
        AND (${options.tenantId ?? null}::text IS NULL OR p."tenantId" = ${options.tenantId ?? null})
        AND (p.status = 'COMMITTED' OR p."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
          OR g."revokedAt" IS NOT NULL OR s."revokedAt" IS NOT NULL OR s."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))
      ORDER BY p."expiresAt", p.id LIMIT ${limit} FOR UPDATE OF p SKIP LOCKED`
    let scrubbed = 0
    const counts = new Map<string, number>()
    for (const row of rows) {
      // Both eligibility and authoritative time are rechecked after obtaining the row lock.
      const changed = await tx.$executeRaw`
        UPDATE "McpChangePreview" p SET payload = p.payload - 'dataBase64'
        WHERE p.id = ${row.id} AND p."tenantId" = ${row.tenantId}
          AND p.action = 'product_images.write' AND p.payload ? 'dataBase64'
          AND (p.status = 'COMMITTED' OR p."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
            OR EXISTS (SELECT 1 FROM "McpClientGrant" g WHERE g.id = p."grantId" AND g."revokedAt" IS NOT NULL)
            OR EXISTS (SELECT 1 FROM "Session" s WHERE s.id = p."sessionId" AND (s."revokedAt" IS NOT NULL OR s."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))))`
      if (changed) { scrubbed += changed; counts.set(row.tenantId, (counts.get(row.tenantId) ?? 0) + changed) }
    }
    for (const [tenantId, count] of counts) await tx.auditLog.create({ data: { tenantId, action: 'MCP_IMAGE_PREVIEWS_SCRUBBED', entity: 'McpChangePreview', metadata: { count } } })
    return { scrubbed, batchLimit: limit, batchFull: rows.length === limit }
  }, { maxWait: 2000, timeout: 5000 })
}
