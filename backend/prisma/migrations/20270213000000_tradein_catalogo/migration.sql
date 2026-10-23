-- Catálogo de modelos / valores de toma: datos del equipo que entrega el cliente.
-- Aditiva e idempotente (re-ejecutable).

-- Cotización: equipo que entrega el cliente (modelo, capacidad, condición y valor estimado).
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "tradeIn" JSONB;

-- Equipo recibido como parte de pago: color, capacidad, % de batería y fallas.
ALTER TABLE "TradeInDevice" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "TradeInDevice" ADD COLUMN IF NOT EXISTS "storage" TEXT;
ALTER TABLE "TradeInDevice" ADD COLUMN IF NOT EXISTS "batteryPct" INTEGER;
ALTER TABLE "TradeInDevice" ADD COLUMN IF NOT EXISTS "faults" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TradeInDevice" ADD COLUMN IF NOT EXISTS "faultsNote" TEXT;

-- Plantilla «Cotización enviada» de WhatsApp: las empresas que nunca la editaron pasan al formato nuevo
-- (secciones con emojis, equipo que entrega, faltante y aviso de revisión). Una plantilla editada no se toca.
UPDATE "MessageTemplate"
SET "body" = E'🧾 *Cotización {{cotizacion}}*\nHola {{cliente}}, te comparto tu cotización de {{empresa}}.\n\n{{detalle}}\n\n💰 *Total: {{total}}*\n{{equipo_entrega}}\n{{faltante}}\n{{validez}}\n{{contacto}}\n\n{{aviso_revision}}\n🔗 Ver y aprobar: {{enlace}}'
WHERE "key" = 'cotizacion_enviada'
  AND "channel" = 'whatsapp'
  AND "body" = '¡Hola {{cliente}}! 🧾 Te enviamos la cotización {{cotizacion}} por {{total}}, válida hasta {{vigencia}}. Podés verla y aprobarla acá: {{enlace}}. Cualquier duda, estamos para ayudarte. — {{empresa}}';
