-- Identificador comercial de pedidos por empresa (prefijo + número secuencial).
ALTER TABLE "Tenant" ADD COLUMN "orderPrefix" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "orderNextNumber" INTEGER;
