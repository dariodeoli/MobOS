-- Aviso al cliente por WhatsApp: fecha en que se notificó el estado del pedido.
ALTER TABLE "Order" ADD COLUMN "notifiedAt" TIMESTAMP(3);
