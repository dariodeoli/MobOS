DROP INDEX IF EXISTS "McpChangePreview_tenantId_userId_idempotencyKey_key";
ALTER TABLE "McpChangePreview" ADD COLUMN "grantId" TEXT;
ALTER TABLE "McpChangePreview" ADD COLUMN "clientId" TEXT;
ALTER TABLE "McpChangePreview" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "McpChangePreview" ADD CONSTRAINT "McpChangePreview_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "McpClientGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "McpChangePreview_grantId_idempotencyKey_key" ON "McpChangePreview"("grantId", "idempotencyKey");
CREATE INDEX "McpChangePreview_grantId_status_expiresAt_idx" ON "McpChangePreview"("grantId", "status", "expiresAt");
