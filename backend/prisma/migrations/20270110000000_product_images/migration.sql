-- #404: fotos de producto y categorías de accesorios. Solo cambios aditivos.
ALTER TABLE "Product" ADD COLUMN "accessoryCategory" TEXT;
ALTER TABLE "Product" ADD COLUMN "compatibleModels" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "storagePath" TEXT,
    "thumbPath" TEXT,
    "data" BYTEA,
    "thumbData" BYTEA,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductImage_tenantId_productId_position_idx" ON "ProductImage"("tenantId", "productId", "position");

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
