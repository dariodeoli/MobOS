-- Conserva los IMEI/seriales exactos en la línea de venta sin duplicar el catálogo.
ALTER TABLE "OrderItem"
  ADD COLUMN "serials" JSONB NOT NULL DEFAULT '[]';
