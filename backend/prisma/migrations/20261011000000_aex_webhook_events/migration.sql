-- Eventos de webhook de AEX por guía. Aditiva e idempotente: la tabla puede
-- existir si otra corrida la creó antes.
CREATE TABLE IF NOT EXISTS "AexWebhookEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "transferId" TEXT,
  "guia" TEXT NOT NULL,
  "codigoEstado" TEXT,
  "estado" TEXT,
  "codigoTipoEvento" TEXT,
  "tipoEvento" TEXT,
  "observacion" TEXT,
  "codigoOperacion" TEXT,
  "fechaEvento" TIMESTAMP(3),
  "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AexWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AexWebhookEvent_guia_fechaEvento_idx" ON "AexWebhookEvent"("guia", "fechaEvento");
CREATE INDEX IF NOT EXISTS "AexWebhookEvent_tenantId_idx" ON "AexWebhookEvent"("tenantId");
