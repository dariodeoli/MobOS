-- Estado "Listo p/ enviar" en pedidos (entre preparación y retiro/entrega).
ALTER TYPE "FulfillmentStatus" ADD VALUE IF NOT EXISTS 'READY_TO_SHIP';
