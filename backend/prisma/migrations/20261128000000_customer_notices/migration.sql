-- #240 → portal: mensajes de la tienda al cliente (con visto/no visto).
-- Aditiva e idempotente: si la tabla/índices ya existen, no hace nada.
CREATE TABLE IF NOT EXISTS "CustomerNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerNotice_tenantId_customerId_createdAt_idx" ON "CustomerNotice"("tenantId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerNotice_customerId_firstViewedAt_idx" ON "CustomerNotice"("customerId", "firstViewedAt");
CREATE INDEX IF NOT EXISTS "CustomerNotice_userId_idx" ON "CustomerNotice"("userId");

ALTER TABLE "CustomerNotice" DROP CONSTRAINT IF EXISTS "CustomerNotice_tenantId_fkey";
ALTER TABLE "CustomerNotice" ADD CONSTRAINT "CustomerNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNotice" DROP CONSTRAINT IF EXISTS "CustomerNotice_customerId_fkey";
ALTER TABLE "CustomerNotice" ADD CONSTRAINT "CustomerNotice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNotice" DROP CONSTRAINT IF EXISTS "CustomerNotice_userId_fkey";
ALTER TABLE "CustomerNotice" ADD CONSTRAINT "CustomerNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
