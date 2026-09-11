-- MobOS: auth sessions and order/payment snapshots.
-- Generated from HEAD schema to current schema with prisma migrate diff,
-- then adjusted so subtotalPyg is safe for an already-populated Order table.
-- Do not run this file automatically against production.

CREATE TYPE "SessionLevel" AS ENUM ('COMPANY', 'SELLER');

ALTER TABLE "Tenant"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "passwordHash" TEXT;

ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

ALTER TABLE "Order"
  ADD COLUMN "deliveryNotes" TEXT,
  ADD COLUMN "deliveryPyg" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryType" TEXT,
  ADD COLUMN "discountPyg" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "subtotalPyg" INTEGER;

UPDATE "Order" o
SET "subtotalPyg" = COALESCE(
  (SELECT SUM(oi."totalPyg") FROM "OrderItem" oi WHERE oi."orderId" = o."id"),
  o."totalPyg"
)
WHERE "subtotalPyg" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "subtotalPyg" SET NOT NULL;

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "level" "SessionLevel" NOT NULL DEFAULT 'COMPANY',
  "deviceId" TEXT NOT NULL,
  "branchId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_tenantId_userId_idx" ON "Session"("tenantId", "userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
