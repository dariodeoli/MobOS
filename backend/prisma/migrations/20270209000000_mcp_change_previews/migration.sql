CREATE TABLE "McpChangePreview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    CONSTRAINT "McpChangePreview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpChangePreview_tenantId_userId_idempotencyKey_key" ON "McpChangePreview"("tenantId", "userId", "idempotencyKey");
CREATE INDEX "McpChangePreview_tenantId_userId_status_expiresAt_idx" ON "McpChangePreview"("tenantId", "userId", "status", "expiresAt");
ALTER TABLE "McpChangePreview" ADD CONSTRAINT "McpChangePreview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpChangePreview" ADD CONSTRAINT "McpChangePreview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
