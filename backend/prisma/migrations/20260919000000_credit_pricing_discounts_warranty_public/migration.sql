-- Precios mayoristas por cliente, descuentos por línea, ventas a crédito con
-- control de mora, previsión de acreditación de tarjetas y garantía pública.
CREATE TYPE "CustomerPricing" AS ENUM ('RETAIL', 'WHOLESALE');
ALTER TABLE "Customer" ADD COLUMN "pricingTier" "CustomerPricing" NOT NULL DEFAULT 'RETAIL';
ALTER TABLE "Customer" ADD COLUMN "creditLimitPyg" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "creditDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "wholesalePricePyg" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "discountPyg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "discountPct" DECIMAL(5, 2);
ALTER TABLE "Order" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "creditDays" INTEGER;
ALTER TABLE "PaymentAccount" ADD COLUMN "settlementDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "settlesAt" TIMESTAMP(3);
ALTER TABLE "WarrantyCase" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "WarrantyCase" ADD COLUMN "warrantyDays" INTEGER;
ALTER TABLE "WarrantyCase" ADD COLUMN "coverage" TEXT;
ALTER TABLE "WarrantyCase" ADD COLUMN "exclusions" TEXT;
CREATE UNIQUE INDEX "WarrantyCase_publicToken_key" ON "WarrantyCase"("publicToken");
