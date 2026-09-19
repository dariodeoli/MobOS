-- Impresión remota: puentes (token hasheado), impresoras por empresa y cola de
-- trabajos. Aditiva e idempotente: puede correr después de la migración de otro
-- agente sin duplicar objetos y se puede re-ejecutar sin error.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintJobState') THEN
    CREATE TYPE "PrintJobState" AS ENUM ('PENDIENTE', 'RECLAMADO', 'ACEPTADO', 'INCIERTO', 'FALLIDO', 'CONFIRMADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintJobPath') THEN
    CREATE TYPE "PrintJobPath" AS ENUM ('LOCAL', 'REMOTO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PrintBridge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "pairingCodeHash" TEXT,
  "pairingExpiresAt" TIMESTAMP(3),
  "pairingUsedAt" TIMESTAMP(3),
  "pairingAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT,
  "version" TEXT,
  "platform" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintBridge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PrintBridge_tokenHash_key" ON "PrintBridge"("tokenHash");
CREATE INDEX IF NOT EXISTS "PrintBridge_tenantId_revokedAt_idx" ON "PrintBridge"("tenantId", "revokedAt");
CREATE INDEX IF NOT EXISTS "PrintBridge_pairingCodeHash_idx" ON "PrintBridge"("pairingCodeHash");

CREATE TABLE IF NOT EXISTS "PrintPrinter" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bridgeId" TEXT,
  "name" TEXT NOT NULL,
  "brand" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL DEFAULT '',
  "location" TEXT NOT NULL DEFAULT '',
  "connection" TEXT NOT NULL DEFAULT 'lan',
  "destination" TEXT NOT NULL,
  "width" INTEGER NOT NULL DEFAULT 80,
  "copies" INTEGER NOT NULL DEFAULT 1,
  "cut" BOOLEAN NOT NULL DEFAULT true,
  "density" INTEGER NOT NULL DEFAULT 3,
  "characters" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTest" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintPrinter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrintPrinter_tenantId_isActive_idx" ON "PrintPrinter"("tenantId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "PrintPrinter_tenantId_destination_key" ON "PrintPrinter"("tenantId", "destination");

CREATE TABLE IF NOT EXISTS "PrintJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bridgeId" TEXT,
  "printerId" TEXT,
  "destination" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" "PrintJobState" NOT NULL DEFAULT 'PENDIENTE',
  "path" "PrintJobPath" NOT NULL DEFAULT 'REMOTO',
  "payload" TEXT,
  "payloadBytes" INTEGER NOT NULL DEFAULT 0,
  "validation" TEXT NOT NULL DEFAULT '',
  "suffixHash" TEXT NOT NULL DEFAULT '',
  "reference" TEXT NOT NULL DEFAULT '',
  "requestedByUserId" TEXT,
  "requestedByName" TEXT NOT NULL DEFAULT '',
  "deviceName" TEXT NOT NULL DEFAULT '',
  "bridgeName" TEXT NOT NULL DEFAULT '',
  "tokenHint" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT '',
  "width" INTEGER NOT NULL DEFAULT 80,
  "copies" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "error" TEXT,
  "idempotencyKey" TEXT,
  "sourceJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrintJob_tenantId_state_createdAt_idx" ON "PrintJob"("tenantId", "state", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintJob_bridgeId_state_idx" ON "PrintJob"("bridgeId", "state");
CREATE INDEX IF NOT EXISTS "PrintJob_tenantId_createdAt_idx" ON "PrintJob"("tenantId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_tenantId_idempotencyKey_key" ON "PrintJob"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_tenantId_sourceJobId_key" ON "PrintJob"("tenantId", "sourceJobId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintBridge_tenantId_fkey') THEN
    ALTER TABLE "PrintBridge" ADD CONSTRAINT "PrintBridge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintBridge_createdByUserId_fkey') THEN
    ALTER TABLE "PrintBridge" ADD CONSTRAINT "PrintBridge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintPrinter_tenantId_fkey') THEN
    ALTER TABLE "PrintPrinter" ADD CONSTRAINT "PrintPrinter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintPrinter_bridgeId_fkey') THEN
    ALTER TABLE "PrintPrinter" ADD CONSTRAINT "PrintPrinter_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "PrintBridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_tenantId_fkey') THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_bridgeId_fkey') THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "PrintBridge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_printerId_fkey') THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "PrintPrinter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_requestedByUserId_fkey') THEN
    ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
