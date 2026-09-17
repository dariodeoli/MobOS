-- Quién registró cada cobro: la cronología muestra la persona real.
ALTER TABLE "Payment" ADD COLUMN "userId" TEXT;
