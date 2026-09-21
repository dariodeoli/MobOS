-- Seguro de ventas por empresa (#162): porcentaje predeterminado sobre el
-- costo del producto que se suma al costo real para calcular el margen.
-- Aditiva e idempotente: la columna se agrega solo si no existe.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "insurancePct" INTEGER;
