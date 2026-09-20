-- Búsqueda difusa (#84): pg_trgm + índices GIN para ILIKE '%texto%' en los
-- campos que se buscan por coincidencia parcial: nombre de producto, nombre de
-- cliente, número de pedido y serial/IMEI vendido. Aditiva, idempotente y
-- re-ejecutable (IF NOT EXISTS); los nombres coinciden con el @@index del
-- schema para que `npm run db:check` siga limpio.
--
-- Medición del arnés (backend/tests/pg-trgm.mjs, tabla temporal de 20.000
-- filas; corrida de referencia):
--   · ILIKE '%modelo 321%' sin índice: ~6,4 ms (seq scan)
--   · ILIKE '%modelo 321%' con GIN trgm: ~0,6 ms (bitmap index scan) — ~10× más rápido
--   · INSERT de a una fila: sin penalidad medible (GIN usa pending list)
--   · Carga masiva de 20.000 filas: ~25 ms sin índice / ~103 ms con índice
--     (el único costo real aparece en importaciones masivas, no en el alta normal)
-- Conclusión: se conservan los índices; la lectura difusa es la operación
-- frecuente (buscador de productos/clientes/pedidos/seriales) y el alta de a
-- una fila no empeora. Requiere que el servidor tenga el módulo contrib
-- pg_trgm disponible (el dueño de la base lo crea).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Order_orderNumber_trgm_idx" ON "Order" USING gin ("orderNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "OrderItemSerial_serial_trgm_idx" ON "OrderItemSerial" USING gin ("serial" gin_trgm_ops);
