-- Plantillas por contexto y predeterminada por contexto.
-- IF NOT EXISTS: en bases que ya aplicaron 20261004000000 (que agrega
-- isDefault), esta migración corre después y no debe fallar.
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "context" TEXT NOT NULL DEFAULT 'clientes';
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "MessageTemplate_tenantId_context_idx" ON "MessageTemplate"("tenantId", "context");
