-- #240 · Repuestos no-OEM: vínculo orden de servicio ↔ unidad de stock.
-- Aditiva e idempotente: la orden guarda con qué unidad se vinculó y cuándo se
-- pasó su costo al costo real del equipo. El vínculo nace vacío (las órdenes
-- viejas siguen sin unidad) y se completa con la acción explícita del taller.
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "inventoryUnitId" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "repairsAppliedAt" TIMESTAMP(3);

ALTER TABLE "ServiceOrder" DROP CONSTRAINT IF EXISTS "ServiceOrder_inventoryUnitId_fkey";
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ServiceOrder_tenantId_inventoryUnitId_idx" ON "ServiceOrder"("tenantId", "inventoryUnitId");
