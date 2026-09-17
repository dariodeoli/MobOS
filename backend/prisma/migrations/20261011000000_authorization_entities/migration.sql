-- Sujeto genérico de una autorización (unidad, pedido, producto). Las
-- condiciones comerciales del cliente lo dejan en null: su sujeto es la ficha.
ALTER TABLE "CustomerAuthorization" ADD COLUMN IF NOT EXISTS "entity" TEXT;
ALTER TABLE "CustomerAuthorization" ADD COLUMN IF NOT EXISTS "entityId" TEXT;

-- Una autorización pendiente por vendedor + tipo + sujeto.
CREATE INDEX IF NOT EXISTS "CustomerAuthorization_tenantId_entity_entityId_idx"
  ON "CustomerAuthorization" ("tenantId", "entity", "entityId");
