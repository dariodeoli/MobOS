-- Pedido premium: etiquetas, archivado y cronología con comentarios y fotos.
ALTER TABLE "Order" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Order" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE TABLE "OrderComment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderComment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "OrderCommentPhoto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCommentPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCommentPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderCommentPhoto_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "OrderComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderComment_tenantId_orderId_createdAt_idx" ON "OrderComment"("tenantId", "orderId", "createdAt");
CREATE INDEX "OrderComment_tenantId_createdAt_idx" ON "OrderComment"("tenantId", "createdAt");
CREATE INDEX "OrderCommentPhoto_tenantId_commentId_idx" ON "OrderCommentPhoto"("tenantId", "commentId");
CREATE INDEX "Order_tenantId_archivedAt_idx" ON "Order"("tenantId", "archivedAt");
