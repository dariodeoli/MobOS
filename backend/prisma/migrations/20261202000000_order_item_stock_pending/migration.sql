-- #148 §11: unidades sobre pedido de productos sin serial (venta sin stock).
-- Aditiva e idempotente: las bases que ya la tengan no cambian.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "stockPending" INTEGER NOT NULL DEFAULT 0;
