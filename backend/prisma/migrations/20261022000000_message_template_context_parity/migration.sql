-- Espejo context ↔ category en las plantillas de WhatsApp.
--
-- Las plantillas sembradas antes de que existiera la columna `category`
-- (20260912180000 + 20261001090000) recibieron el contexto por defecto
-- 'clientes', incluso las de pedidos y servicio. La búsqueda del aviso
-- automático es por clave (tenantId, key), así que este backfill solo alinea
-- el alias de contexto con la categoría: no toca key, body ni isActive.
--
-- Idempotente y re-ejecutable: en una base ya alineada no actualiza filas.
UPDATE "MessageTemplate" SET "context" = 'pedidos' WHERE "category" = 'ORDERS' AND "context" <> 'pedidos';
UPDATE "MessageTemplate" SET "context" = 'clientes' WHERE "category" = 'CUSTOMERS' AND "context" <> 'clientes';
UPDATE "MessageTemplate" SET "context" = 'servicio' WHERE "category" = 'SERVICE' AND "context" <> 'servicio';
