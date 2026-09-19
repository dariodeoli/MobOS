-- Paridad base ↔ modelo encontrada por scripts/check-db-schema.mjs:
-- 1) Promotion.tenantId tenía un FK distinto al del modelo: se re-crea con
--    ON DELETE CASCADE para que borrar una empresa no deje promociones huérfanas.
-- 2) InventoryUnit.lastVerifiedById no tenía FK: se agrega la que declara el modelo.
-- 3) InventoryUnit.updatedAt tenía un default que el modelo no declara.
-- 4) El índice de EmailOutbox quedó truncado con otro nombre: se renombra al
--    que Prisma espera. Idempotente y re-ejecutable.
ALTER TABLE "Promotion" DROP CONSTRAINT IF EXISTS "Promotion_tenantId_fkey";
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryUnit" DROP CONSTRAINT IF EXISTS "InventoryUnit_lastVerifiedById_fkey";
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_lastVerifiedById_fkey" FOREIGN KEY ("lastVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryUnit" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER INDEX IF EXISTS "EmailOutbox_sentAt_cancelledAt_failedAt_availableAt_createdAt_i" RENAME TO "EmailOutbox_sentAt_cancelledAt_failedAt_availableAt_created_idx";
