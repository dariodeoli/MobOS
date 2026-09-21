-- Rendimiento con volumen (#177): índices de búsqueda difusa que faltaban.
-- Aditiva, idempotente y re-ejecutable (IF NOT EXISTS). Las búsquedas del POS
-- e Inventario usan ILIKE '%texto%': sin índice trigram recorren la tabla.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_sku_trgm_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_model_trgm_idx" ON "Product" USING GIN ("model" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_capacity_trgm_idx" ON "Product" USING GIN ("capacity" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_color_trgm_idx" ON "Product" USING GIN ("color" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_imei_trgm_idx" ON "Product" USING GIN ("imei" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "InventoryUnit_serial_trgm_idx" ON "InventoryUnit" USING GIN ("serial" gin_trgm_ops);
-- Listado de pedidos del POS: filtra por empresa y ordena por fecha.
CREATE INDEX IF NOT EXISTS "Order_tenantId_createdAt_idx" ON "Order" ("tenantId", "createdAt");
-- Kardex: los ítems del pedido se buscan por producto.
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem" ("productId");
