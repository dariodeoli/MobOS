-- #152: la entrega separada del pago suma estados propios para retiro
-- (pendiente, retirado, parcial) y reparto (enviado, no entregado).
--
-- Aditiva e idempotente: `ADD VALUE IF NOT EXISTS` no falla si la migración se
-- re-ejecuta ni si otra rama ya agregó el valor. Postgres no permite *usar* un
-- valor nuevo en la misma transacción que lo crea: acá solo se crean.
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'NOT_DELIVERED';
