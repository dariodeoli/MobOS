CREATE TABLE "CashSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "openedById" TEXT NOT NULL,
  "closedById" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openingPyg" INTEGER NOT NULL,
  "countedPyg" INTEGER,
  "expectedPyg" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashSession_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "CashSession_openingPyg_check" CHECK ("openingPyg" >= 0),
  CONSTRAINT "CashSession_countedPyg_check" CHECK ("countedPyg" IS NULL OR "countedPyg" >= 0),
  CONSTRAINT "CashSession_expectedPyg_check" CHECK ("expectedPyg" IS NULL OR "expectedPyg" >= 0)
);
CREATE INDEX "CashSession_tenantId_branchId_openedAt_idx" ON "CashSession"("tenantId", "branchId", "openedAt");
CREATE UNIQUE INDEX "CashSession_one_open_per_branch" ON "CashSession"("tenantId", "branchId") WHERE "status" = 'OPEN';
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
