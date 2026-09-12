ALTER TABLE "Branch" ADD COLUMN "phone" TEXT;
ALTER TABLE "Branch" ADD COLUMN "instagram" TEXT;
ALTER TABLE "Customer" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT '+595';
ALTER TABLE "Order" ADD COLUMN "publicToken" TEXT;
CREATE TYPE "FulfillmentStatus" AS ENUM ('PROCESSING', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'DELIVERED');
ALTER TABLE "Order" ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PROCESSING';
UPDATE "Order" SET "publicToken" = 'ord_' || md5(random()::text || clock_timestamp()::text || "id") WHERE "publicToken" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");
CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "label" TEXT NOT NULL DEFAULT 'Principal',
  "address" TEXT NOT NULL, "city" TEXT, "notes" TEXT, "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerAddress_customerId_isDefault_idx" ON "CustomerAddress"("customerId", "isDefault");
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
  "body" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_tenantId_key_key" ON "MessageTemplate"("tenantId", "key");
CREATE INDEX "MessageTemplate_tenantId_isActive_idx" ON "MessageTemplate"("tenantId", "isActive");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
