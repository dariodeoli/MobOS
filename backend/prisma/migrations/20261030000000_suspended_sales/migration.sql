-- Ventas suspendidas: borradores de carrito recuperables por sucursal.
CREATE TABLE IF NOT EXISTS "SuspendedSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "label" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SuspendedSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SuspendedSale_tenantId_branchId_createdAt_idx" ON "SuspendedSale"("tenantId", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "SuspendedSale_tenantId_userId_idx" ON "SuspendedSale"("tenantId", "userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SuspendedSale_tenantId_fkey') THEN
    ALTER TABLE "SuspendedSale" ADD CONSTRAINT "SuspendedSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SuspendedSale_branchId_fkey') THEN
    ALTER TABLE "SuspendedSale" ADD CONSTRAINT "SuspendedSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SuspendedSale_customerId_fkey') THEN
    ALTER TABLE "SuspendedSale" ADD CONSTRAINT "SuspendedSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SuspendedSale_userId_fkey') THEN
    ALTER TABLE "SuspendedSale" ADD CONSTRAINT "SuspendedSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
