-- Identidad multi-tienda: la persona (GoogleIdentity) se separa de la tienda.
-- GoogleStoreAccess vincula persona ↔ tienda (owner=true identifica al dueño).
-- Los accesos existentes se conservan: cada GoogleIdentity con tenantId se
-- migra como acceso owner antes de quitar la columna.

-- CreateTable
CREATE TABLE "GoogleStoreAccess" (
    "subject" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleStoreAccess_pkey" PRIMARY KEY ("subject","tenantId")
);

-- CreateIndex
CREATE INDEX "GoogleStoreAccess_tenantId_idx" ON "GoogleStoreAccess"("tenantId");

-- AddForeignKey
ALTER TABLE "GoogleStoreAccess" ADD CONSTRAINT "GoogleStoreAccess_subject_fkey" FOREIGN KEY ("subject") REFERENCES "GoogleIdentity"("subject") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleStoreAccess" ADD CONSTRAINT "GoogleStoreAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar accesos existentes antes de soltar la columna.
INSERT INTO "GoogleStoreAccess" ("subject", "tenantId", "owner", "createdAt")
SELECT "subject", "tenantId", true, now()
FROM "GoogleIdentity"
WHERE "tenantId" IS NOT NULL;

-- Quitar la relación 1:1 anterior (GoogleIdentity ya no pertenece a una tienda).
ALTER TABLE "GoogleIdentity" DROP CONSTRAINT "GoogleIdentity_tenantId_fkey";
DROP INDEX "GoogleIdentity_tenantId_key";
ALTER TABLE "GoogleIdentity" DROP COLUMN "tenantId";
