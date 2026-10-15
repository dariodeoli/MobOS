-- Llegada de mercadería (#408, unidad E): alcance de la conciliación. Aditiva e
-- idempotente: envío esperado y proveedores del lote (opcionales).
ALTER TABLE "StockArrival" ADD COLUMN IF NOT EXISTS "shipmentId" TEXT;
ALTER TABLE "StockArrival" ADD COLUMN IF NOT EXISTS "supplierIds" JSONB;
