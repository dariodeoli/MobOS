-- Categoría y plantilla predeterminada por contexto (pedidos, clientes, servicio).
-- Las plantillas existentes quedan en ORDERS y sin marca de predeterminada.
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'ORDERS';
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "MessageTemplate_tenantId_category_idx" ON "MessageTemplate"("tenantId", "category");
