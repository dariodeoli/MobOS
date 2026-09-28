-- #286 · Sucursal efectiva: última sucursal usada por usuario. Aditiva e
-- idempotente (IF NOT EXISTS y FKs por nombre).
CREATE TABLE IF NOT EXISTS "UserBranchUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBranchUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserBranchUsage_userId_branchId_key" ON "UserBranchUsage"("userId", "branchId");
CREATE INDEX IF NOT EXISTS "UserBranchUsage_tenantId_userId_usedAt_idx" ON "UserBranchUsage"("tenantId", "userId", "usedAt");
DO $$ BEGIN
  ALTER TABLE "UserBranchUsage" ADD CONSTRAINT "UserBranchUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserBranchUsage" ADD CONSTRAINT "UserBranchUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserBranchUsage" ADD CONSTRAINT "UserBranchUsage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
