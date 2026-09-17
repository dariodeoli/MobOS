-- Descuento por pagar con un medio (efectivo/transferencia): porcentaje sugerido.
ALTER TABLE "PaymentAccount" ADD COLUMN "discountPct" DECIMAL(5, 2) NOT NULL DEFAULT 0;
