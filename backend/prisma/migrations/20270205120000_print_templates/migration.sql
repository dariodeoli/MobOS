CREATE TABLE IF NOT EXISTS "PrintTemplate" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "definition" JSONB NOT NULL,
 "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "archivedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PrintTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PrintTemplate_tenantId_kind_archivedAt_idx" ON "PrintTemplate"("tenantId", "kind", "archivedAt");
CREATE TABLE IF NOT EXISTS "PrintTemplateDefault" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "branchId" TEXT,
 "kind" TEXT NOT NULL, "templateId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PrintTemplateDefault_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "PrintTemplateDefault_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "PrintTemplateDefault_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrintTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PrintTemplateDefault_tenantId_scopeKey_kind_key" ON "PrintTemplateDefault"("tenantId", "scopeKey", "kind");
CREATE INDEX IF NOT EXISTS "PrintTemplateDefault_tenantId_branchId_idx" ON "PrintTemplateDefault"("tenantId", "branchId");
