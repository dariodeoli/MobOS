-- Listas de precios por cliente y precios por cantidad (escalones).
-- Aditiva, idempotente y re-ejecutable: puede correr después de otra migración
-- sin duplicar objetos y se puede repetir sin error.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PriceListAdjustment') THEN
    CREATE TYPE "PriceListAdjustment" AS ENUM ('DISCOUNT', 'SURCHARGE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PriceList" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" "PaymentCurrency" NOT NULL DEFAULT 'PYG',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceList_tenantId_name_key" ON "PriceList"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "PriceList_tenantId_isActive_idx" ON "PriceList"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "PriceListItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "priceListId" TEXT NOT NULL,
  "productId" TEXT,
  "category" TEXT,
  "adjustment" "PriceListAdjustment" NOT NULL DEFAULT 'DISCOUNT',
  "valuePct" DECIMAL(6,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PriceListItem_tenantId_priceListId_idx" ON "PriceListItem"("tenantId", "priceListId");
CREATE INDEX IF NOT EXISTS "PriceListItem_productId_idx" ON "PriceListItem"("productId");

CREATE TABLE IF NOT EXISTS "PriceTier" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "minQuantity" INTEGER NOT NULL,
  "unitPricePyg" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceTier_tenantId_productId_minQuantity_key" ON "PriceTier"("tenantId", "productId", "minQuantity");
CREATE INDEX IF NOT EXISTS "PriceTier_tenantId_productId_idx" ON "PriceTier"("tenantId", "productId");

-- La ficha del cliente puede tener su propia lista (override de mayorista/minorista).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "priceListId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_tenantId_priceListId_idx" ON "Customer"("tenantId", "priceListId");

-- Foto congelada del origen del precio en la línea de venta (auditoría).
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "priceSource" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "priceListId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceList_tenantId_fkey') THEN
    ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceListItem_tenantId_fkey') THEN
    ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceListItem_priceListId_fkey') THEN
    ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceListItem_productId_fkey') THEN
    ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceTier_tenantId_fkey') THEN
    ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceTier_productId_fkey') THEN
    ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_priceListId_fkey') THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
