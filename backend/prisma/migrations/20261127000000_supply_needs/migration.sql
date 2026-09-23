-- #250 Fase 1 (Centro de Abastecimiento): necesidades de abastecimiento — la
-- demanda del panel «Por comprar». Aditiva e idempotente: la tabla nace vacía,
-- nada la usa todavía (sin UI ni automatismos) y no crea stock (solo la
-- recepción lo hace).
CREATE TABLE IF NOT EXISTS "SupplyNeed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "productId" TEXT NOT NULL,
    "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "promisedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "orderItemId" TEXT,
    "customerId" TEXT,
    "assignedToId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyNeed_pkey" PRIMARY KEY ("id")
);

-- La clave de deduplicación evita filas repetidas de la misma demanda automática
-- (las manuales van sin clave); el índice de consolidación agrupa por
-- producto+condición y el resto ordena el panel por prioridad/fecha.
CREATE UNIQUE INDEX IF NOT EXISTS "SupplyNeed_tenantId_dedupeKey_key" ON "SupplyNeed"("tenantId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "SupplyNeed_tenantId_status_priority_createdAt_idx" ON "SupplyNeed"("tenantId", "status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplyNeed_tenantId_productId_condition_status_idx" ON "SupplyNeed"("tenantId", "productId", "condition", "status");
CREATE INDEX IF NOT EXISTS "SupplyNeed_tenantId_branchId_status_idx" ON "SupplyNeed"("tenantId", "branchId", "status");

-- Claves foráneas idempotentes (DROP + ADD): misma convención que el resto de
-- las migraciones del proyecto.
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_tenantId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_branchId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_productId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_orderId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_customerId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_assignedToId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_createdById_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
