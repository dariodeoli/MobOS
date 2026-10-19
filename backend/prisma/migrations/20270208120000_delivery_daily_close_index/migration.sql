-- PostgreSQL truncates identifiers at 63 bytes. The original index name
-- collided after truncation with Prisma's canonical shortened name, so rename
-- the existing index and keep the schema check deterministic.
DROP INDEX IF EXISTS "DeliveryTrip_tenantId_branchId_driverId_performedOn_dailyCloseI";
CREATE INDEX IF NOT EXISTS "DeliveryTrip_tenantId_branchId_driverId_performedOn_dailyCl_idx"
  ON "DeliveryTrip"("tenantId", "branchId", "driverId", "performedOn", "dailyCloseId");
