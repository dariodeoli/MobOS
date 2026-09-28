-- #279 A2 · Carrito POS privado — el borrador guardado (compartido) registra
-- quién lo retomó. Aditiva e idempotente: no toca los datos existentes.
ALTER TABLE "SuspendedSale" ADD COLUMN IF NOT EXISTS "resumedById" TEXT;
ALTER TABLE "SuspendedSale" ADD COLUMN IF NOT EXISTS "resumedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SuspendedSale_resumedById_fkey') THEN
    ALTER TABLE "SuspendedSale" ADD CONSTRAINT "SuspendedSale_resumedById_fkey" FOREIGN KEY ("resumedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SuspendedSale_tenantId_branchId_resumedAt_idx" ON "SuspendedSale"("tenantId", "branchId", "resumedAt");
