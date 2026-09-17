-- Cierre del traslado: hasta ahora no había forma de saber si las unidades
-- llegaron a destino (solo se infería del estado de cada unidad). Se completa
-- cuando todas las unidades del traslado dejaron de estar en tránsito.
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
