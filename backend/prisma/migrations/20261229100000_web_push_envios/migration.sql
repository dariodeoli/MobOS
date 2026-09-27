-- A1 (#279) · Registro de avisos Web Push (dedupe por usuario+clave y métricas).
-- Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "WebPushEnvio" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT,
  "resultado" TEXT NOT NULL,
  "enviados" INTEGER NOT NULL DEFAULT 0,
  "silenciados" INTEGER NOT NULL DEFAULT 0,
  "podados" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebPushEnvio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebPushEnvio_userId_clave_key" ON "WebPushEnvio"("userId", "clave");
CREATE INDEX IF NOT EXISTS "WebPushEnvio_tenantId_createdAt_idx" ON "WebPushEnvio"("tenantId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "WebPushEnvio" ADD CONSTRAINT "WebPushEnvio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WebPushEnvio" ADD CONSTRAINT "WebPushEnvio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
