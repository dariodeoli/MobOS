-- Listas de precios por cliente (issue #28): listas con ítems por producto o
-- categoría, escalones por cantidad y asignación opcional a la ficha del
-- cliente. Aditiva, idempotente y re-ejecutable: los objetos pueden existir por
-- una corrida previa.

DO $$ BEGIN
  CREATE TYPE "PriceListCurrency" AS ENUM ('PYG', 'USD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PriceListScope" AS ENUM ('PRODUCT', 'CATEGORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PriceList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "PriceListCurrency" NOT NULL DEFAULT 'PYG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "scope" "PriceListScope" NOT NULL,
    "productId" TEXT,
    "category" TEXT,
    "unitPricePyg" INTEGER,
    "unitPriceUsd" DECIMAL(14,2),
    "discountPct" DECIMAL(5,2),

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PriceTier" (
    "id" TEXT NOT NULL,
    "priceListItemId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "unitPricePyg" INTEGER NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "priceListId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PriceList_tenantId_name_key" ON "PriceList"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "PriceList_tenantId_isActive_idx" ON "PriceList"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "PriceListItem_priceListId_idx" ON "PriceListItem"("priceListId");
CREATE INDEX IF NOT EXISTS "PriceListItem_productId_idx" ON "PriceListItem"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "PriceTier_priceListItemId_minQty_key" ON "PriceTier"("priceListItemId", "minQty");
CREATE INDEX IF NOT EXISTS "Customer_priceListId_idx" ON "Customer"("priceListId");

DO $$ BEGIN
  ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
