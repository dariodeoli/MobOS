-- Acceso público por nivel del pedido: tokens aleatorios no enumerables,
-- revocables y regenerables. El nivel autoriza la vista (rapido|completo|detallado).
CREATE TABLE "OrderAccessToken" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'rapido',
  "token" TEXT NOT NULL,
  "createdBy" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAccessToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderAccessToken_token_key" ON "OrderAccessToken"("token");
CREATE INDEX "OrderAccessToken_orderId_level_idx" ON "OrderAccessToken"("orderId", "level");
CREATE INDEX "OrderAccessToken_tenantId_level_idx" ON "OrderAccessToken"("tenantId", "level");
ALTER TABLE "OrderAccessToken" ADD CONSTRAINT "OrderAccessToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAccessToken" ADD CONSTRAINT "OrderAccessToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
