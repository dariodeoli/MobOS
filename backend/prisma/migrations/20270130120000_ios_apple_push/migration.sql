-- App de iPhone: identidad de Apple y tokens APNs. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "AppleIdentity" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "email" TEXT,
  "isPrivateRelay" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "refreshTokenEnc" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppleIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppleIdentity_subject_key" ON "AppleIdentity"("subject");
CREATE INDEX IF NOT EXISTS "AppleIdentity_accountId_idx" ON "AppleIdentity"("accountId");
ALTER TABLE "AppleIdentity" DROP CONSTRAINT IF EXISTS "AppleIdentity_accountId_fkey";
ALTER TABLE "AppleIdentity" ADD CONSTRAINT "AppleIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DeviceToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'ios',
  "token" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "appVersion" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_tenantId_userId_idx" ON "DeviceToken"("tenantId", "userId");
ALTER TABLE "DeviceToken" DROP CONSTRAINT IF EXISTS "DeviceToken_tenantId_fkey";
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" DROP CONSTRAINT IF EXISTS "DeviceToken_userId_fkey";
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
