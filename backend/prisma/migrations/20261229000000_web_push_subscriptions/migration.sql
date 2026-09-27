-- A1 (#279) · Web Push: suscripciones por usuario y dispositivo. Aditiva e
-- idempotente (IF NOT EXISTS y FKs por nombre): otra migración pudo crearla.
CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "silencioDesde" INTEGER,
  "silencioHasta" INTEGER,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "WebPushSubscription_tenantId_userId_idx" ON "WebPushSubscription"("tenantId", "userId");
DO $$ BEGIN
  ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
