-- Factura a otro titular, ventas sobre pedido sin IMEI, costo pendiente y PIX.
ALTER TABLE "Order" ADD COLUMN "billingName" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingDocument" TEXT;
ALTER TABLE "Order" ADD COLUMN "notes" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "serialsPending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "costPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "PaymentMethod" ADD VALUE 'PIX';
ALTER TYPE "PaymentAccountKind" ADD VALUE 'PIX';
