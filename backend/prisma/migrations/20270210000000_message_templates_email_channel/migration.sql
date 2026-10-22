-- Plantillas de mensajes listas (WhatsApp + correo).
--
-- Aditiva, idempotente y re-ejecutable:
--   * `channel` ('whatsapp' por defecto, 'email' para las versiones de correo;
--     sus claves llevan el prefijo `email.` y no tocan el único (tenantId, key)).
--   * `subject` (asunto, solo correo).
--   * La plantilla «recibido» pasa a llamarse «pedido_confirmado» (solo si la
--     empresa todavía no tiene esa clave): conserva el cuerpo que ya editó.
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "subject" TEXT;
CREATE INDEX IF NOT EXISTS "MessageTemplate_tenantId_channel_idx" ON "MessageTemplate"("tenantId", "channel");

UPDATE "MessageTemplate" AS t
SET "key" = 'pedido_confirmado',
    "name" = CASE WHEN t."name" = 'Pedido recibido' THEN 'Pedido confirmado' ELSE t."name" END
WHERE t."key" = 'recibido'
  AND NOT EXISTS (SELECT 1 FROM "MessageTemplate" x WHERE x."tenantId" = t."tenantId" AND x."key" = 'pedido_confirmado');
