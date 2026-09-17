-- Pipeline de ventas: cotizaciones con vencimiento y conversión a pedido.
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'CANCELLED');
CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "subtotalPyg" INTEGER NOT NULL,
  "discountPyg" INTEGER NOT NULL DEFAULT 0,
  "totalPyg" INTEGER NOT NULL,
  "notes" TEXT,
  "validUntil" TIMESTAMP(3),
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Quote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Quote_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Quote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Quote_tenantId_number_key" ON "Quote"("tenantId", "number");
CREATE INDEX "Quote_tenantId_status_idx" ON "Quote"("tenantId", "status");
CREATE INDEX "Quote_tenantId_validUntil_idx" ON "Quote"("tenantId", "validUntil");
CREATE INDEX "Quote_branchId_idx" ON "Quote"("branchId");
