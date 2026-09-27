-- A3 (#279) · Aprobación autenticada de presupuestos: versión congelada,
-- desafío OTP y evidencia de la aprobación. Aditiva e idempotente: se puede
-- re-ejecutar sin tocar datos existentes.
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "QuoteVersion" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "quoteId"    TEXT NOT NULL,
  "version"    INTEGER NOT NULL,
  "hash"       TEXT NOT NULL,
  "snapshot"   JSONB NOT NULL,
  "frozenById" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuoteVersion_quoteId_version_key" ON "QuoteVersion"("quoteId", "version");
CREATE INDEX IF NOT EXISTS "QuoteVersion_tenantId_quoteId_version_idx" ON "QuoteVersion"("tenantId", "quoteId", "version");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteVersion_tenantId_fkey') THEN
    ALTER TABLE "QuoteVersion" ADD CONSTRAINT "QuoteVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteVersion_quoteId_fkey') THEN
    ALTER TABLE "QuoteVersion" ADD CONSTRAINT "QuoteVersion_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteVersion_frozenById_fkey') THEN
    ALTER TABLE "QuoteVersion" ADD CONSTRAINT "QuoteVersion_frozenById_fkey" FOREIGN KEY ("frozenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "QuoteApprovalChallenge" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "quoteId"         TEXT NOT NULL,
  "versionId"       TEXT NOT NULL,
  "channel"         TEXT NOT NULL,
  "destination"     TEXT NOT NULL,
  "destinationHash" TEXT NOT NULL,
  "codeHash"        TEXT NOT NULL,
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "usedAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteApprovalChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteApprovalChallenge_tenantId_quoteId_createdAt_idx" ON "QuoteApprovalChallenge"("tenantId", "quoteId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteApprovalChallenge_tenantId_destinationHash_createdAt_idx" ON "QuoteApprovalChallenge"("tenantId", "destinationHash", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApprovalChallenge_tenantId_fkey') THEN
    ALTER TABLE "QuoteApprovalChallenge" ADD CONSTRAINT "QuoteApprovalChallenge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApprovalChallenge_quoteId_fkey') THEN
    ALTER TABLE "QuoteApprovalChallenge" ADD CONSTRAINT "QuoteApprovalChallenge_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApprovalChallenge_versionId_fkey') THEN
    ALTER TABLE "QuoteApprovalChallenge" ADD CONSTRAINT "QuoteApprovalChallenge_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "QuoteApproval" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "quoteId"          TEXT NOT NULL,
  "versionId"        TEXT NOT NULL,
  "challengeId"      TEXT,
  "status"           TEXT NOT NULL DEFAULT 'APPROVED',
  "method"           TEXT NOT NULL,
  "destination"      TEXT NOT NULL,
  "versionHash"      TEXT NOT NULL,
  "signerName"       TEXT,
  "signerDocument"   TEXT,
  "signatureDataUrl" TEXT,
  "ipHash"           TEXT,
  "userAgent"        TEXT,
  "orderId"          TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteApproval_tenantId_quoteId_createdAt_idx" ON "QuoteApproval"("tenantId", "quoteId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApproval_tenantId_fkey') THEN
    ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApproval_quoteId_fkey') THEN
    ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApproval_versionId_fkey') THEN
    ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApproval_challengeId_fkey') THEN
    ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "QuoteApprovalChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuoteApproval_orderId_fkey') THEN
    ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
