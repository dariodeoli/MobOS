-- Stock unificado (U1): tipo de stock por producto, baja real de unidades,
-- vínculo unidad -> línea de venta y unidad -> línea de compra.
-- Aditiva e idempotente: sin DROP, sin NOT NULL, cada backfill solo toca filas
-- con el campo todavía en NULL (el contenedor corre `prisma migrate deploy` en
-- cada arranque y un segundo paso no debe cambiar nada).

-- ── Tipo de stock ──
DO $$ BEGIN
  CREATE TYPE "StockKind" AS ENUM ('EQUIPO', 'ACCESORIO', 'REPUESTO', 'OTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stockKind" "StockKind";

CREATE INDEX IF NOT EXISTS "Product_tenantId_branchId_stockKind_idx" ON "Product"("tenantId", "branchId", "stockKind");

-- ── Unidades: baja real, venta y compra ──
ALTER TABLE "InventoryUnit"
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removedById" TEXT,
  ADD COLUMN IF NOT EXISTS "removedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "soldOrderItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "purchaseLineId" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_removedAt_idx" ON "InventoryUnit"("tenantId", "removedAt");
CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_soldAt_idx" ON "InventoryUnit"("tenantId", "soldAt");
CREATE INDEX IF NOT EXISTS "InventoryUnit_soldOrderItemId_idx" ON "InventoryUnit"("soldOrderItemId");
CREATE INDEX IF NOT EXISTS "InventoryUnit_purchaseLineId_idx" ON "InventoryUnit"("purchaseLineId");

DO $$ BEGIN
  ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_soldOrderItemId_fkey"
    FOREIGN KEY ("soldOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_purchaseLineId_fkey"
    FOREIGN KEY ("purchaseLineId") REFERENCES "SupplyPurchaseLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Backfill: Product.stockKind ──
-- EQUIPO si tiene alguna unidad; si no, por la categoría normalizada (misma
-- regla que backend/lib/stock-kind.ts); si no, OTRO.
UPDATE "Product" p
SET "stockKind" = (
  CASE
    WHEN EXISTS (SELECT 1 FROM "InventoryUnit" u WHERE u."productId" = p."id") THEN 'EQUIPO'
    WHEN translate(lower(btrim(coalesce(p."category", ''))), 'áéíóúüñ', 'aeiouun') ~ 'accesorio|cable|cargador|funda|vidrio|lamina|templado|adaptador|protector|soporte|audio|parlante|speaker|auricular|audifono|buds|earbuds' THEN 'ACCESORIO'
    WHEN translate(lower(btrim(coalesce(p."category", ''))), 'áéíóúüñ', 'aeiouun') ~ 'repuesto|pieza|pantalla|display|modulo|bateria' THEN 'REPUESTO'
    WHEN translate(lower(btrim(coalesce(p."category", ''))), 'áéíóúüñ', 'aeiouun') ~ 'iphone|mobile|celular|telefono|smartphone|macbook|imac|laptop|notebook|computadora|ipad|tablet|watch|reloj|airpods|\y(?:mac)\y' THEN 'EQUIPO'
    ELSE 'OTRO'
  END
)::"StockKind"
WHERE p."stockKind" IS NULL;

-- ── Backfill: baja real desde el último evento de baja/restauración ──
-- Historial completo (sin tope): gana el último evento por unidad y solo una
-- baja vigente deja removedAt.
UPDATE "InventoryUnit" u
SET "removedAt" = e."createdAt",
    "removedById" = e."userId",
    "removedReason" = NULLIF(btrim(e."metadata"->>'reason'), '')
FROM (
  SELECT DISTINCT ON ("tenantId", "entityId") "tenantId", "entityId", "action", "createdAt", "userId", "metadata"
  FROM "AuditLog"
  WHERE "entity" = 'InventoryUnit' AND "action" IN ('INVENTORY_UNIT_REMOVED', 'INVENTORY_UNIT_RESTORED') AND "entityId" IS NOT NULL
  ORDER BY "tenantId", "entityId", "createdAt" DESC, "id" DESC
) e
WHERE e."tenantId" = u."tenantId" AND e."entityId" = u."id"
  AND e."action" = 'INVENTORY_UNIT_REMOVED'
  AND u."removedAt" IS NULL;

-- ── Backfill: venta vigente de cada unidad SOLD (última orden por serial) ──
UPDATE "InventoryUnit" u
SET "soldOrderItemId" = v."itemId",
    "soldAt" = v."createdAt"
FROM (
  SELECT DISTINCT ON (o."tenantId", s."serial") o."tenantId", s."serial", i."id" AS "itemId", o."createdAt"
  FROM "OrderItemSerial" s
  JOIN "OrderItem" i ON i."id" = s."orderItemId"
  JOIN "Order" o ON o."id" = i."orderId"
  ORDER BY o."tenantId", s."serial", o."createdAt" DESC, o."id" DESC
) v
WHERE v."tenantId" = u."tenantId" AND v."serial" = u."serial"
  AND u."status" = 'SOLD'
  AND u."soldOrderItemId" IS NULL;

-- ── Backfill: línea de compra de abastecimiento ──
-- SupplyPurchaseSerial es único por (tenantId, serial): cada unidad apunta a lo
-- sumo a una línea. Sin fila de serial queda NULL (no se adivina).
UPDATE "InventoryUnit" u
SET "purchaseLineId" = sp."lineId"
FROM "SupplyPurchaseSerial" sp
WHERE sp."tenantId" = u."tenantId" AND sp."serial" = u."serial"
  AND u."purchaseLineId" IS NULL;
