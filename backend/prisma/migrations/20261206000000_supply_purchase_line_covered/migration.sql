-- #250 F2 · Compra parcial: cuánto de la necesidad cubre cada línea.
-- Aditiva e idempotente: las líneas viejas quedan en null (se asumen completas).
ALTER TABLE "SupplyPurchaseLine" ADD COLUMN IF NOT EXISTS "coveredQuantity" INTEGER;
