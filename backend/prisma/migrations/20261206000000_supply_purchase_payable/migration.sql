-- #254 · FIN: la compra del Centro de Abastecimiento registra su condición de
-- pago y genera su cuenta a pagar al proveedor (contado = pagada al recibir,
-- crédito = con vencimiento). Aditiva, idempotente y re-ejecutable.
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "paymentCondition" TEXT NOT NULL DEFAULT 'CONTADO';
ALTER TABLE "SupplyPurchase" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "SupplierPayable" ADD COLUMN IF NOT EXISTS "supplyPurchaseId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPayable_supplyPurchaseId_key" ON "SupplierPayable"("supplyPurchaseId");
ALTER TABLE "SupplierPayable" DROP CONSTRAINT IF EXISTS "SupplierPayable_supplyPurchaseId_fkey";
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_supplyPurchaseId_fkey" FOREIGN KEY ("supplyPurchaseId") REFERENCES "SupplyPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
