-- Presencia en vivo y consumo por pestaña. Aditiva e idempotente: puede correr
-- después de la migración de otro agente sin duplicar objetos.
CREATE TABLE IF NOT EXISTS "PresenceTab" (
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tabId" UUID NOT NULL,
  "scope" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PresenceTab_pkey" PRIMARY KEY ("tenantId", "userId", "tabId")
);
CREATE INDEX IF NOT EXISTS "PresenceTab_tenantId_lastSeenAt_idx" ON "PresenceTab"("tenantId", "lastSeenAt" DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PresenceTab_tenantId_fkey') THEN
    ALTER TABLE "PresenceTab" ADD CONSTRAINT "PresenceTab_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PresenceTab_userId_fkey') THEN
    ALTER TABLE "PresenceTab" ADD CONSTRAINT "PresenceTab_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "UsageSession" (
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  "wasActive" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "UsageSession_pkey" PRIMARY KEY ("tenantId", "userId", "sessionKey")
);
CREATE INDEX IF NOT EXISTS "UsageSession_tenantId_lastSeenAt_idx" ON "UsageSession"("tenantId", "lastSeenAt" DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageSession_tenantId_fkey') THEN
    ALTER TABLE "UsageSession" ADD CONSTRAINT "UsageSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageSession_userId_fkey') THEN
    ALTER TABLE "UsageSession" ADD CONSTRAINT "UsageSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
