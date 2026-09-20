-- Conciliación base ↔ modelo: el schema declara el índice GIN de metadatos de
-- auditoría con la opclass jsonb_path_ops
-- (`@@index([metadata(ops: JsonbPathOps)], type: Gin)`), pero la migración
-- 20261027000000 lo había rehecho con la opclass por defecto. Se vuelve a
-- jsonb_path_ops (la original de 20261023000000), que cubre las consultas de
-- contención del metadato. Aditiva, idempotente y re-ejecutable.
DROP INDEX IF EXISTS "AuditLog_metadata_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_metadata_idx" ON "AuditLog" USING gin ("metadata" jsonb_path_ops);
