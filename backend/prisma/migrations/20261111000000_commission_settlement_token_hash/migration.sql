-- #172/#178: el token del comprobante de comisiones deja de guardarse en
-- claro. Aditiva, idempotente y re-ejecutable: se puede correr sobre una base
-- con tokens legacy y vuelve a hashear lo que falte.

-- La columna cruda pasa a legacy (nullable, sin default): el código nuevo no
-- la escribe.
ALTER TABLE "CommissionSettlement" ALTER COLUMN "verificationToken" DROP NOT NULL;
ALTER TABLE "CommissionSettlement" ALTER COLUMN "verificationToken" DROP DEFAULT;

ALTER TABLE "CommissionSettlement" ADD COLUMN IF NOT EXISTS "verificationTokenHash" TEXT;
ALTER TABLE "CommissionSettlement" ADD COLUMN IF NOT EXISTS "verificationTokenIssuedAt" TIMESTAMP(3);

-- Backfill: sha256 del token legacy para que los QR ya impresos sigan
-- verificando (el endpoint público busca por hash). `sha256(bytea)` es builtin
-- de PostgreSQL 11+.
UPDATE "CommissionSettlement"
   SET "verificationTokenHash" = encode(sha256(convert_to("verificationToken", 'UTF8')), 'hex')
 WHERE "verificationTokenHash" IS NULL
   AND "verificationToken" IS NOT NULL;

UPDATE "CommissionSettlement"
   SET "verificationTokenIssuedAt" = "createdAt"
 WHERE "verificationTokenIssuedAt" IS NULL
   AND "verificationTokenHash" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionSettlement_verificationTokenHash_key"
  ON "CommissionSettlement"("verificationTokenHash");

-- El crudo no se conserva: un dump de la tabla no permite abrir comprobantes.
UPDATE "CommissionSettlement" SET "verificationToken" = NULL WHERE "verificationToken" IS NOT NULL;
