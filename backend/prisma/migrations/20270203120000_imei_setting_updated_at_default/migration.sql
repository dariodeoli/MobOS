-- #481: Prisma mantiene updatedAt mediante @updatedAt, sin default SQL.
-- Conciliación del esquema; no cambia créditos, movimientos ni filas existentes.
ALTER TABLE IF EXISTS "ImeiCreditSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
