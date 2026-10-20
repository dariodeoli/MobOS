-- #557 fase 1: saldos explícitos por ubicación para productos no serializados.
-- Aditiva e idempotente. No backfillea Product.stock: el stock histórico
-- permanece sin ubicación hasta una asignación autorizada.
CREATE TABLE IF NOT EXISTS "ProductLocationBalance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductLocationBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductLocationBalance_productId_locationId_key" ON "ProductLocationBalance"("productId", "locationId");
CREATE INDEX IF NOT EXISTS "ProductLocationBalance_tenantId_locationId_productId_idx" ON "ProductLocationBalance"("tenantId", "locationId", "productId");
CREATE INDEX IF NOT EXISTS "ProductLocationBalance_tenantId_productId_idx" ON "ProductLocationBalance"("tenantId", "productId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductLocationBalance_tenantId_fkey' AND conrelid = '"ProductLocationBalance"'::regclass) THEN
    ALTER TABLE "ProductLocationBalance" ADD CONSTRAINT "ProductLocationBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductLocationBalance_productId_fkey' AND conrelid = '"ProductLocationBalance"'::regclass) THEN
    ALTER TABLE "ProductLocationBalance" ADD CONSTRAINT "ProductLocationBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductLocationBalance_locationId_fkey' AND conrelid = '"ProductLocationBalance"'::regclass) THEN
    ALTER TABLE "ProductLocationBalance" ADD CONSTRAINT "ProductLocationBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
