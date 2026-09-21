-- POS offline-first (Fase 1): marca de la venta cargada sin conexión y
-- sincronizada al reconectar. El stock pudo quedar laxo (se permitió la venta
-- con existencias viejas), así que el pedido queda señalado para revisión.
--
-- Aditiva e idempotente: se puede re-ejecutar sin romper nada.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "offlineSyncedAt" TIMESTAMP(3);
