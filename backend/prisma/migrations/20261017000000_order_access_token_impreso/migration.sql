-- Token de impresión: el QR del comprobante impreso no muere cuando el panel
-- regenera el enlace del nivel. Aditiva, idempotente y re-ejecutable: la
-- columna puede existir por una corrida previa.
ALTER TABLE "OrderAccessToken" ADD COLUMN IF NOT EXISTS "impreso" BOOLEAN NOT NULL DEFAULT false;
