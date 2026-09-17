-- Garantía automática al vender: cobertura por producto y tipo de caso.
CREATE TYPE "WarrantyKind" AS ENUM ('SERVICE', 'COVERAGE');
ALTER TABLE "WarrantyCase" ADD COLUMN "kind" "WarrantyKind" NOT NULL DEFAULT 'SERVICE';
ALTER TABLE "Product" ADD COLUMN "warrantyDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "warrantyCoverage" TEXT;
ALTER TABLE "Product" ADD COLUMN "warrantyExclusions" TEXT;
CREATE INDEX "WarrantyCase_tenantId_kind_idx" ON "WarrantyCase"("tenantId", "kind");
