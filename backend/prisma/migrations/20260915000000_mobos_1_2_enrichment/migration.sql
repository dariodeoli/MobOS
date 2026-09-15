-- MobOS 1.2 (parte 1): inventario enriquecido, cliente 360° y comisiones.
-- Migración estrictamente aditiva: no se dropea ni altera nada existente.

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('CALL', 'WHATSAPP', 'VISIT', 'OTHER');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "reorderPoint" INTEGER;

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "dueAt" TIMESTAMP(3),
    "kind" "FollowUpKind" NOT NULL DEFAULT 'OTHER',
    "note" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "UserRole",
    "percentPyg" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "warrantyCaseId" TEXT NOT NULL,
    "label" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerNote_tenantId_customerId_createdAt_idx" ON "CustomerNote"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerNote_userId_idx" ON "CustomerNote"("userId");

-- CreateIndex
CREATE INDEX "CustomerFollowUp_tenantId_customerId_createdAt_idx" ON "CustomerFollowUp"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFollowUp_tenantId_dueAt_idx" ON "CustomerFollowUp"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "CustomerFollowUp_userId_idx" ON "CustomerFollowUp"("userId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_userId_idx" ON "CommissionRule"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_role_idx" ON "CommissionRule"("tenantId", "role");

-- CreateIndex
CREATE INDEX "WarrantyPhoto_tenantId_warrantyCaseId_createdAt_idx" ON "WarrantyPhoto"("tenantId", "warrantyCaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyPhoto" ADD CONSTRAINT "WarrantyPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyPhoto" ADD CONSTRAINT "WarrantyPhoto_warrantyCaseId_fkey" FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
