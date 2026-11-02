-- Rol Compras: quien compra ve «Por comprar» y el abastecimiento, sin caja ni
-- ventas. Aditiva, idempotente y re-ejecutable.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMPRAS';
