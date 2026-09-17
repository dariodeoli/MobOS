-- Almacenamiento de adjuntos fuera de Postgres: clave relativa al volumen
-- MOBOS_STORAGE_DIR. Nullable para mantener compatibilidad con los registros
-- existentes, cuyos bytes siguen viviendo en la columna "data" (ByteA).

ALTER TABLE "OrderCommentPhoto" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "InventoryUnitCommentPhoto" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "PaymentProof" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "WarrantyPhoto" ADD COLUMN "storageKey" TEXT;
