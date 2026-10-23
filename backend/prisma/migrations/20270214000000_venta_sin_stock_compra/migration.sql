-- Venta sin stock: compra, pago y costo (aditiva e idempotente).

-- Pago al proveedor de la compra de Por comprar.
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "paidById" TEXT;
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "paidAccountId" TEXT;
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "paymentPendingAccount" BOOLEAN NOT NULL DEFAULT false;

-- Estado de lo vendido sin stock en cada necesidad.
ALTER TABLE "SupplyNeed" ADD COLUMN IF NOT EXISTS "receivedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplyNeed" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
ALTER TABLE "SupplyNeed" ADD COLUMN IF NOT EXISTS "customerNotifiedAt" TIMESTAMP(3);

-- Costo imputado a la venta original y llegada de la línea.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "costSource" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "backorderArrivedAt" TIMESTAMP(3);
