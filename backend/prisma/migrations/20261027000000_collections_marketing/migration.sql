-- Cobranzas por WhatsApp (recordatorios de cuota con mora) y campañas de
-- recompra/marketing. Aditiva, idempotente y re-ejecutable: cada objeto se
-- crea solo si falta, sin tocar datos existentes.

-- 1. Recargo diario por mora configurable por empresa (bp = puntos básicos,
--    100 bp = 1 % por día). Null/0 = sin recargo: reversible.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "collectionLateFeeBpPerDay" INTEGER;

-- 2. Última campaña de marketing registrada en la ficha del cliente.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingContactedAt" TIMESTAMP(3);

-- 3. Recordatorios de cuota por WhatsApp, separados de los flags del email
--    (un canal no consume el aviso del otro).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "whatsappRemindedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "whatsappOverdueRemindedAt" TIMESTAMP(3);

-- 4. Campaña y registro por destinatario.
CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "segment"        TEXT NOT NULL,
  "templateKey"    TEXT NOT NULL,
  "message"        TEXT NOT NULL,
  "segmentParams"  JSONB,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount"   INTEGER NOT NULL DEFAULT 0,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingRecipient" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel"    TEXT NOT NULL DEFAULT 'WHATSAPP',
  "phone"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingRecipient_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingCampaign_tenantId_fkey') THEN
    ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingCampaign_createdById_fkey') THEN
    ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingRecipient_campaignId_fkey') THEN
    ALTER TABLE "MarketingRecipient" ADD CONSTRAINT "MarketingRecipient_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketingRecipient_customerId_fkey') THEN
    ALTER TABLE "MarketingRecipient" ADD CONSTRAINT "MarketingRecipient_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MarketingCampaign_tenantId_createdAt_idx" ON "MarketingCampaign"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MarketingCampaign_createdById_idx" ON "MarketingCampaign"("createdById");
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingRecipient_campaignId_customerId_key" ON "MarketingRecipient"("campaignId", "customerId");
CREATE INDEX IF NOT EXISTS "MarketingRecipient_tenantId_customerId_idx" ON "MarketingRecipient"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "MarketingRecipient_tenantId_createdAt_idx" ON "MarketingRecipient"("tenantId", "createdAt" DESC);
