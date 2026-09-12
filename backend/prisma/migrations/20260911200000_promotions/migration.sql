CREATE TABLE "Promotion" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "value" INTEGER NOT NULL, "productId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "maxUnits" INTEGER, "usedUnits" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_valid" CHECK (
    "kind" IN ('PERCENT', 'FIXED') AND "value" > 0 AND
    ("kind" <> 'PERCENT' OR "value" <= 100) AND "endsAt" > "startsAt" AND
    "usedUnits" >= 0 AND ("maxUnits" IS NULL OR ("maxUnits" > 0 AND "usedUnits" <= "maxUnits"))
  )
);
CREATE UNIQUE INDEX "Promotion_tenantId_code_key" ON "Promotion"("tenantId", "code");
ALTER TABLE "OrderItem" ADD COLUMN "promotionSnapshot" JSONB;
