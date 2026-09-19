-- Tombstone de adjuntos: un archivo eliminado no vuelve solo si un cliente
-- externo o un reintento sube los mismos bytes al mismo documento. Aditiva,
-- idempotente y re-ejecutable: la tabla puede existir por una corrida previa.
CREATE TABLE IF NOT EXISTS "AttachmentTombstone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttachmentTombstone_tenantId_entity_entityId_sha256_key" ON "AttachmentTombstone"("tenantId", "entity", "entityId", "sha256");
