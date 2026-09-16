-- Persona ≠ tienda: la identidad Google deja de apuntar a un único tenant.
-- El vínculo persona ↔ tienda se materializa en la tabla GoogleStoreAccess.
-- El vínculo actual (una persona = dueña de su única tienda) se copia antes
-- de dropear tenantId. Las columnas name/picture ya existían y no se tocan.

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

-- Copia el vínculo actual antes de dropear la columna.
INSERT INTO "GoogleStoreAccess" ("subject", "tenantId", "owner")
SELECT "subject", "tenantId", true FROM "GoogleIdentity" WHERE "tenantId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "GoogleIdentity" DROP CONSTRAINT "GoogleIdentity_tenantId_fkey";

-- DropIndex
DROP INDEX "GoogleIdentity_tenantId_key";

-- AlterTable
ALTER TABLE "GoogleIdentity" DROP COLUMN "tenantId";
