-- Empresas/personas jurídicas privadas y titulares de cuentas (#143).
-- Aditiva, idempotente y re-ejecutable: cada objeto se crea o agrega solo si
-- no existe.

CREATE TABLE IF NOT EXISTS "PrivateCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "ruc" TEXT,
    "legalAddress" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrivateCompany_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "ruc" TEXT;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "legalAddress" TEXT;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PrivateCompany" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "PrivateCompany_tenantId_isActive_idx" ON "PrivateCompany"("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS "AccountHolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "otherName" TEXT,
    "lastName" TEXT NOT NULL,
    "secondLastName" TEXT,
    "document" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountHolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "middleName" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "otherName" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "secondLastName" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "document" TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "AccountHolder_tenantId_isActive_idx" ON "AccountHolder"("tenantId", "isActive");

-- Titular y empresa asociados a la cuenta de cobro.
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "holderId" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymentAccount_holderId_idx" ON "PaymentAccount"("holderId");
CREATE INDEX IF NOT EXISTS "PaymentAccount_companyId_idx" ON "PaymentAccount"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrivateCompany_tenantId_fkey') THEN
    ALTER TABLE "PrivateCompany" ADD CONSTRAINT "PrivateCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountHolder_tenantId_fkey') THEN
    ALTER TABLE "AccountHolder" ADD CONSTRAINT "AccountHolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAccount_holderId_fkey') THEN
    ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "AccountHolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAccount_companyId_fkey') THEN
    ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PrivateCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
