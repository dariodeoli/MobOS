-- Comprobante congelado al emitir la venta (aditivo e idempotente).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receiptSnapshot" JSONB;
