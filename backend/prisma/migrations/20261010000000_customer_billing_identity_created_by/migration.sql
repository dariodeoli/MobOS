-- La migración 20261005000000 intentó crear la tabla con createdById, pero
-- usó CREATE TABLE IF NOT EXISTS: como la tabla ya existía (migración
-- 20261001120000), la columna nunca se agregó. Esta migración la completa.

ALTER TABLE "CustomerBillingIdentity" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
