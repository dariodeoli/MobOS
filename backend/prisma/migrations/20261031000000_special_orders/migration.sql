-- Pedido especial con seña: marca y fecha esperada de entrega.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isSpecialOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "expectedAt" TIMESTAMP(3);
