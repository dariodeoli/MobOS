-- Adjuntos genéricos reutilizables por todos los módulos (gastos, compras,
-- pagos a proveedor, caja y transferencias). `entity` + `entityId` referencian
-- el documento dueño sin una FK por tabla. Los bytes viven en "data" (ByteA) y,
-- cuando MOBOS_STORAGE_DIR está configurado, además en el volumen vía
-- "storageKey"; "data" siempre queda como respaldo.
CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT,
  "data" BYTEA NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Attachment_tenantId_entity_entityId_idx" ON "Attachment"("tenantId", "entity", "entityId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
