-- El índice GIN de auditoría usaba la opclass jsonb_path_ops, que Prisma no
-- refleja en el modelo (el chequeo base↔modelo pedía recrearlo). Se rehace con
-- la opclass por defecto: sirve igual para los filtros por metadata (`@>`) y
-- así la base coincide con `@@index([metadata], type: Gin)`.
DROP INDEX IF EXISTS "AuditLog_metadata_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_metadata_idx" ON "AuditLog" USING gin ("metadata");
