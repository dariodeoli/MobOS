-- #254 · FIN: costo unitario de la línea en la moneda de la compra (el Gs
-- convertido sigue en "unitCostPyg"). Aditiva, idempotente y re-ejecutable.
ALTER TABLE "SupplyPurchaseLine" ADD COLUMN IF NOT EXISTS "originalUnitCost" DECIMAL(14, 2);
