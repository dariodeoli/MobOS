ALTER TABLE "Tenant"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);

CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION');

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "purpose" "AuthTokenPurpose" NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_tenantId_purpose_expiresAt_idx" ON "EmailVerificationToken"("tenantId", "purpose", "expiresAt");
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'VENDEDOR',
  "branchId" TEXT,
  "permissions" JSONB,
  "inviterId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "resendAvailableAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_tenantId_email_idx" ON "UserInvitation"("tenantId", "email");
CREATE INDEX "UserInvitation_tenantId_expiresAt_idx" ON "UserInvitation"("tenantId", "expiresAt");
CREATE UNIQUE INDEX "UserInvitation_one_active_per_email" ON "UserInvitation"("tenantId", "email") WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmailOutbox" (
  -- Application-generated UUID; provider idempotency derives only from this job identity.
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  -- AES-256-GCM envelope; rendered credentials are never stored as plaintext.
  "payload" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");
CREATE INDEX "EmailOutbox_sentAt_cancelledAt_failedAt_availableAt_createdAt_idx" ON "EmailOutbox"("sentAt", "cancelledAt", "failedAt", "availableAt", "createdAt");
CREATE INDEX "EmailOutbox_aggregateType_aggregateId_createdAt_idx" ON "EmailOutbox"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "EmailOutbox_tenantId_createdAt_idx" ON "EmailOutbox"("tenantId", "createdAt");
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
