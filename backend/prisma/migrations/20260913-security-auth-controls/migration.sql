-- Persistent, pseudonymous rate-limit buckets for unauthenticated flows.
-- `fingerprint` is a SHA-256 value derived in the API and never contains the
-- source IP, email address, password, or PIN in clear text.
CREATE TABLE "AuthAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "scope" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuthAttempt"
  ADD CONSTRAINT "AuthAttempt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuthAttempt_scope_fingerprint_createdAt_idx"
  ON "AuthAttempt"("scope", "fingerprint", "createdAt");
CREATE INDEX "AuthAttempt_tenantId_createdAt_idx"
  ON "AuthAttempt"("tenantId", "createdAt");
