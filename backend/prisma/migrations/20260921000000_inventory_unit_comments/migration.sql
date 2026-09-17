-- Comentarios y fotos por unidad de inventario (misma experiencia premium que
-- los pedidos): cronología, evidencia y auditoría por IMEI/serial.
CREATE TABLE "InventoryUnitComment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryUnitComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryUnitComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryUnitComment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryUnitComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "InventoryUnitCommentPhoto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryUnitCommentPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryUnitCommentPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryUnitCommentPhoto_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "InventoryUnitComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InventoryUnitComment_tenantId_unitId_createdAt_idx" ON "InventoryUnitComment"("tenantId", "unitId", "createdAt");
CREATE INDEX "InventoryUnitComment_tenantId_createdAt_idx" ON "InventoryUnitComment"("tenantId", "createdAt");
CREATE INDEX "InventoryUnitCommentPhoto_tenantId_commentId_idx" ON "InventoryUnitCommentPhoto"("tenantId", "commentId");
