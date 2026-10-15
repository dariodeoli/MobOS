-- Créditos de verificación IMEI gestionados desde /superadmin. Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "ImeiCreditLot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "granted" INTEGER NOT NULL,
  "remaining" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "sourceRef" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImeiCreditLot_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ImeiCreditLot" DROP CONSTRAINT IF EXISTS "ImeiCreditLot_remaining_check";
ALTER TABLE "ImeiCreditLot" ADD CONSTRAINT "ImeiCreditLot_remaining_check" CHECK ("remaining" >= 0 AND "granted" >= 0);
ALTER TABLE "ImeiCreditLot" DROP CONSTRAINT IF EXISTS "ImeiCreditLot_source_check";
ALTER TABLE "ImeiCreditLot" ADD CONSTRAINT "ImeiCreditLot_source_check" CHECK ("source" IN ('FREE','GRANT','MONTHLY','ADJUST'));
CREATE INDEX IF NOT EXISTS "ImeiCreditLot_tenantId_remaining_expiresAt_idx" ON "ImeiCreditLot"("tenantId", "remaining", "expiresAt");

CREATE TABLE IF NOT EXISTS "ImeiCreditEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "lotId" TEXT,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "serviceKey" TEXT,
  "queryId" TEXT,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImeiCreditEntry_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ImeiCreditEntry" DROP CONSTRAINT IF EXISTS "ImeiCreditEntry_type_check";
ALTER TABLE "ImeiCreditEntry" ADD CONSTRAINT "ImeiCreditEntry_type_check" CHECK ("type" IN ('GRANT','CONSUME','REFUND','EXPIRE','ADJUST'));
CREATE UNIQUE INDEX IF NOT EXISTS "ImeiCreditEntry_tenantId_type_sourceRef_key" ON "ImeiCreditEntry"("tenantId", "type", "sourceRef");
CREATE INDEX IF NOT EXISTS "ImeiCreditEntry_tenantId_createdAt_idx" ON "ImeiCreditEntry"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImeiCreditEntry_queryId_idx" ON "ImeiCreditEntry"("queryId");

-- Libro solo de agregado: las filas no se modifican.
CREATE OR REPLACE FUNCTION "imei_credit_entry_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ImeiCreditEntry es solo de agregado';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ImeiCreditEntry_append_only" ON "ImeiCreditEntry";
CREATE TRIGGER "ImeiCreditEntry_append_only" BEFORE UPDATE OR DELETE ON "ImeiCreditEntry" FOR EACH ROW EXECUTE FUNCTION "imei_credit_entry_append_only"();

CREATE TABLE IF NOT EXISTS "ImeiCreditSetting" (
  "tenantId" TEXT NOT NULL,
  "monthlyAllowance" INTEGER NOT NULL DEFAULT 0,
  "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImeiCreditSetting_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "ImeiCreditSetting" DROP CONSTRAINT IF EXISTS "ImeiCreditSetting_allowance_check";
ALTER TABLE "ImeiCreditSetting" ADD CONSTRAINT "ImeiCreditSetting_allowance_check" CHECK ("monthlyAllowance" >= 0);

-- Una verificación gratis para toda empresa existente (re-ejecutable: ids fijos + ON CONFLICT).
INSERT INTO "ImeiCreditLot" ("id","tenantId","source","granted","remaining","sourceRef","note")
SELECT 'ilf_' || t."id", t."id", 'FREE', 1, 1, 'free', 'Verificación de bienvenida'
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "ImeiCreditEntry" e WHERE e."tenantId" = t."id" AND e."type" = 'GRANT' AND e."sourceRef" = 'free')
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "ImeiCreditEntry" ("id","tenantId","lotId","type","amount","sourceRef","note")
SELECT 'ice_free_' || t."id", t."id", 'ilf_' || t."id", 'GRANT', 1, 'free', 'Verificación de bienvenida'
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "ImeiCreditEntry" e WHERE e."tenantId" = t."id" AND e."type" = 'GRANT' AND e."sourceRef" = 'free')
ON CONFLICT DO NOTHING;
