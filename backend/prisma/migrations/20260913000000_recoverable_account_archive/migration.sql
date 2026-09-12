ALTER TABLE "Session"
  ADD COLUMN "reauthenticatedAt" TIMESTAMP(3);

CREATE INDEX "Session_tenantId_reauthenticatedAt_idx"
  ON "Session"("tenantId", "reauthenticatedAt");
