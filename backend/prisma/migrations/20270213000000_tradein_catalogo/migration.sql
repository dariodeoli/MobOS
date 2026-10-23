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
