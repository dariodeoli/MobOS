-- Plantillas por contexto y predeterminada por contexto.
ALTER TABLE "MessageTemplate" ADD COLUMN "context" TEXT NOT NULL DEFAULT 'clientes';
ALTER TABLE "MessageTemplate" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MessageTemplate_tenantId_context_idx" ON "MessageTemplate"("tenantId", "context");
