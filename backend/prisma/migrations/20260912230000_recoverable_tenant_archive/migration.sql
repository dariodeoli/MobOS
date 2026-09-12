-- El cierre de una empresa es recuperable y conserva los movimientos.
ALTER TABLE "Tenant"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedReason" TEXT;

CREATE INDEX "Tenant_archivedAt_idx" ON "Tenant"("archivedAt");
