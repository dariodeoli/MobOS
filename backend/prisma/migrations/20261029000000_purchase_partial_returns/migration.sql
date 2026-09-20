-- Recepción parcial de compras y devolución a proveedor.
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

ALTER TABLE "PurchaseLine" ADD COLUMN IF NOT EXISTS "receivedQty" INTEGER NOT NULL DEFAULT 0;

-- Backfill: las compras ya recibidas antes de esta migración tienen todo su
-- pedido como recibido; sin esto quedarían con 0 y no se podrían devolver.
UPDATE "PurchaseLine" pl SET "receivedQty" = pl."quantity"
WHERE pl."receivedQty" = 0
  AND pl."purchaseId" IN (SELECT po."id" FROM "PurchaseOrder" po WHERE po."status" = 'RECEIVED');

CREATE TABLE IF NOT EXISTS "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "reason" TEXT NOT NULL,
    "totalPyg" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PurchaseReturnLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostPyg" INTEGER NOT NULL,
    "totalPyg" INTEGER NOT NULL,
    CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchaseReturn_tenantId_purchaseId_idx" ON "PurchaseReturn"("tenantId", "purchaseId");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_tenantId_supplierId_idx" ON "PurchaseReturn"("tenantId", "supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseReturnLine_returnId_idx" ON "PurchaseReturnLine"("returnId");
CREATE INDEX IF NOT EXISTS "PurchaseReturnLine_productId_idx" ON "PurchaseReturnLine"("productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturn_tenantId_fkey') THEN
    ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturn_purchaseId_fkey') THEN
    ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturnLine_tenantId_fkey') THEN
    ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturnLine_returnId_fkey') THEN
    ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturnLine_productId_fkey') THEN
    ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
