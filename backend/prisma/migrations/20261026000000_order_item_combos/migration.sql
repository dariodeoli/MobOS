-- Trazabilidad de combos en la venta: cada línea recuerda de qué combo salió.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "comboId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "comboName" TEXT;

CREATE INDEX IF NOT EXISTS "OrderItem_comboId_idx" ON "OrderItem"("comboId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_comboId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
