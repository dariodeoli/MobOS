-- Consultas de IMEI (#193): registro auditable por consulta. Aditiva,
-- idempotente y re-ejecutable.
CREATE TABLE IF NOT EXISTS "ImeiCheckQuery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "imei" TEXT NOT NULL,
    "imeiMasked" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'imeicheck.net',
    "serviceKey" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "costUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "responseRaw" JSONB,
    "normalized" JSONB NOT NULL DEFAULT '[]',
    "requestId" TEXT,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ImeiCheckQuery_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "imei" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "imeiMasked" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "serviceKey" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "serviceName" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "ImeiCheckQuery" ADD COLUMN IF NOT EXISTS "costUsd" DECIMAL(10,2) DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "ImeiCheckQuery_requestId_key" ON "ImeiCheckQuery" ("requestId");
CREATE INDEX IF NOT EXISTS "ImeiCheckQuery_tenantId_imei_requestedAt_idx" ON "ImeiCheckQuery" ("tenantId", "imei", "requestedAt");
CREATE INDEX IF NOT EXISTS "ImeiCheckQuery_tenantId_requestedAt_idx" ON "ImeiCheckQuery" ("tenantId", "requestedAt");
