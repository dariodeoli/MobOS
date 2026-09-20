-- Búsqueda de auditoría por metadato (#61): columna denormalizada que mantiene
-- un trigger de la base (vale para cualquier ruta que escriba AuditLog, también
-- las que corren dentro de transacciones) y backfill de lo ya registrado.
-- Aditiva, idempotente y re-ejecutable.

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '';

UPDATE "AuditLog"
SET "searchText" = lower(concat_ws(' ', "action", "entity", "entityId", "metadata"::text))
WHERE "searchText" = '';

CREATE OR REPLACE FUNCTION "mobos_audit_search_text"() RETURNS trigger AS $$
BEGIN
  NEW."searchText" := lower(concat_ws(' ', NEW."action", NEW."entity", NEW."entityId", NEW."metadata"::text));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_search_text" ON "AuditLog";
CREATE TRIGGER "AuditLog_search_text"
BEFORE INSERT OR UPDATE OF "action", "entity", "entityId", "metadata" ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "mobos_audit_search_text"();

-- Índice trigram para que el ILIKE '%texto%' siga siendo rápido sobre una tabla
-- que crece con cada operación. Si la base no permite pg_trgm, la búsqueda
-- sigue funcionando sin índice; el chequeo base↔modelo avisa si falta.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm no disponible: la búsqueda de auditoría queda sin índice trigram.';
END
$$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "AuditLog_searchText_idx" ON "AuditLog" USING gin ("searchText" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo crear el índice trigram de auditoría.';
END
$$;
