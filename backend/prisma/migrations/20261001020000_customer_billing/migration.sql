-- Datos de facturación habituales del cliente (factura a otro titular).
ALTER TABLE "Customer" ADD COLUMN "billingName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "billingDocument" TEXT;
