-- Panel de plataforma (/superadmin): los agregados por período recorren estas
-- tablas por fecha sin filtrar por empresa. Solo índices; aditiva, idempotente
-- y re-ejecutable (cada índice con IF NOT EXISTS). No toca datos.

CREATE INDEX IF NOT EXISTS "Tenant_createdAt_idx" ON "Tenant"("createdAt");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "UsageSession_lastSeenAt_idx" ON "UsageSession"("lastSeenAt");
