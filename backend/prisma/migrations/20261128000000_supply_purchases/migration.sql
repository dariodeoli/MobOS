-- #250 Fase 2 (Centro de Abastecimiento): compra rápida y stock adicional.
-- Aditiva e idempotente: registra la compra (proveedor, costo/moneda, factura,
-- referencia, IMEIs ahora o pendientes) y las necesidades que cubre. **No mueve
-- stock**: las unidades aparecen recién en la recepción (F5).

-- 2) Cabecera de la compra.
CREATE TABLE IF NOT EXISTS "SupplyPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "currency" "PaymentCurrency" NOT NULL DEFAULT 'PYG',
    "originalCost" DECIMAL(14,2),
    "exchangeRatePyg" DECIMAL(14,4),
    "costPyg" INTEGER,
    "reference" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPRADA',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyPurchase_tenantId_code_key" ON "SupplyPurchase"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "SupplyPurchase_tenantId_status_createdAt_idx" ON "SupplyPurchase"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplyPurchase_tenantId_supplierId_createdAt_idx" ON "SupplyPurchase"("tenantId", "supplierId", "createdAt");

ALTER TABLE "SupplyPurchase" DROP CONSTRAINT IF EXISTS "SupplyPurchase_tenantId_fkey";
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchase" DROP CONSTRAINT IF EXISTS "SupplyPurchase_branchId_fkey";
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchase" DROP CONSTRAINT IF EXISTS "SupplyPurchase_supplierId_fkey";
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchase" DROP CONSTRAINT IF EXISTS "SupplyPurchase_createdById_fkey";
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Líneas: una por producto/condición; `needId` null = compra adicional.
CREATE TABLE IF NOT EXISTS "SupplyPurchaseLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "needId" TEXT,
    "productId" TEXT NOT NULL,
    "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
    "quantity" INTEGER NOT NULL,
    "unitCostPyg" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyPurchaseLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplyPurchaseLine_tenantId_purchaseId_idx" ON "SupplyPurchaseLine"("tenantId", "purchaseId");
CREATE INDEX IF NOT EXISTS "SupplyPurchaseLine_tenantId_needId_idx" ON "SupplyPurchaseLine"("tenantId", "needId");

ALTER TABLE "SupplyPurchaseLine" DROP CONSTRAINT IF EXISTS "SupplyPurchaseLine_tenantId_fkey";
ALTER TABLE "SupplyPurchaseLine" ADD CONSTRAINT "SupplyPurchaseLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchaseLine" DROP CONSTRAINT IF EXISTS "SupplyPurchaseLine_purchaseId_fkey";
ALTER TABLE "SupplyPurchaseLine" ADD CONSTRAINT "SupplyPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "SupplyPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchaseLine" DROP CONSTRAINT IF EXISTS "SupplyPurchaseLine_needId_fkey";
ALTER TABLE "SupplyPurchaseLine" ADD CONSTRAINT "SupplyPurchaseLine_needId_fkey" FOREIGN KEY ("needId") REFERENCES "SupplyNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchaseLine" DROP CONSTRAINT IF EXISTS "SupplyPurchaseLine_productId_fkey";
ALTER TABLE "SupplyPurchaseLine" ADD CONSTRAINT "SupplyPurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) IMEIs de la compra (pueden venir después: la línea queda sin seriales).
CREATE TABLE IF NOT EXISTS "SupplyPurchaseSerial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyPurchaseSerial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyPurchaseSerial_tenantId_serial_key" ON "SupplyPurchaseSerial"("tenantId", "serial");
CREATE INDEX IF NOT EXISTS "SupplyPurchaseSerial_tenantId_lineId_idx" ON "SupplyPurchaseSerial"("tenantId", "lineId");

ALTER TABLE "SupplyPurchaseSerial" DROP CONSTRAINT IF EXISTS "SupplyPurchaseSerial_tenantId_fkey";
ALTER TABLE "SupplyPurchaseSerial" ADD CONSTRAINT "SupplyPurchaseSerial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyPurchaseSerial" DROP CONSTRAINT IF EXISTS "SupplyPurchaseSerial_lineId_fkey";
ALTER TABLE "SupplyPurchaseSerial" ADD CONSTRAINT "SupplyPurchaseSerial_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SupplyPurchaseLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) La necesidad guarda con qué compra se resolvió (va al final: la tabla de
--    compras tiene que existir para la clave foránea).
ALTER TABLE "SupplyNeed" ADD COLUMN IF NOT EXISTS "purchaseId" TEXT;
CREATE INDEX IF NOT EXISTS "SupplyNeed_tenantId_purchaseId_idx" ON "SupplyNeed"("tenantId", "purchaseId");
ALTER TABLE "SupplyNeed" DROP CONSTRAINT IF EXISTS "SupplyNeed_purchaseId_fkey";
ALTER TABLE "SupplyNeed" ADD CONSTRAINT "SupplyNeed_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "SupplyPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
