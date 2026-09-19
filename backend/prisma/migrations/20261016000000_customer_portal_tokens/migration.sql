-- Portal público del cliente: enlaces por nivel (rapido | completo) que el
-- cliente abre desde el QR para ver su resumen de cuenta sin sesión. Un token
-- vigente por nivel: regenerarlo revoca el anterior. Aditiva, idempotente y
-- re-ejecutable: la tabla puede existir por una corrida previa.
CREATE TABLE IF NOT EXISTS "CustomerPortalToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'rapido',
    "token" TEXT NOT NULL,
    "createdBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPortalToken_token_key" ON "CustomerPortalToken"("token");
CREATE INDEX IF NOT EXISTS "CustomerPortalToken_customerId_level_idx" ON "CustomerPortalToken"("customerId", "level");
CREATE INDEX IF NOT EXISTS "CustomerPortalToken_tenantId_level_idx" ON "CustomerPortalToken"("tenantId", "level");

DO $$ BEGIN
  ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
