-- Trazabilidad por unidad: el producto representa el modelo; el IMEI conserva
-- su condición, batería, proveedor, costo y compra sin multiplicar el catálogo.
ALTER TABLE "InventoryUnit"
  ADD COLUMN "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "batteryHealth" INTEGER,
  ADD COLUMN "supplierName" TEXT,
  ADD COLUMN "purchasedAt" TIMESTAMP(3),
  ADD COLUMN "costPyg" INTEGER,
  ADD COLUMN "costCurrency" "PaymentCurrency" NOT NULL DEFAULT 'PYG',
  ADD COLUMN "originalCost" DECIMAL(14,2),
  ADD COLUMN "exchangeRatePyg" DECIMAL(14,4),
  ADD COLUMN "notes" TEXT;

UPDATE "InventoryUnit" iu
SET "condition" = p."condition", "costPyg" = p."costPyg"
FROM "Product" p
WHERE p."id" = iu."productId";

ALTER TABLE "InventoryUnit"
  ADD CONSTRAINT "InventoryUnit_batteryHealth_range"
  CHECK ("batteryHealth" IS NULL OR ("batteryHealth" >= 0 AND "batteryHealth" <= 100));
