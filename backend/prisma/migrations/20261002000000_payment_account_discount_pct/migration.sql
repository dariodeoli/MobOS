-- Descuento sugerido por medio de cobro (el POS lo usa para proponer el descuento).
ALTER TABLE "PaymentAccount" ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5, 2) NOT NULL DEFAULT 0;
