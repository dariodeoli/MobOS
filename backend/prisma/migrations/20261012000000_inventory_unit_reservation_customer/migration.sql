-- La reserva guardaba el cliente como texto y la UI creaba fichas nuevas cada
-- vez que el nombre no coincidía con la heurística local. Ahora apunta a la
-- ficha real cuando se eligió un cliente existente; el nombre se conserva como
-- respaldo (reservas sin cliente o fichas borradas).
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "reservationCustomerId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryUnit_reservationCustomerId_fkey') THEN
    ALTER TABLE "InventoryUnit"
      ADD CONSTRAINT "InventoryUnit_reservationCustomerId_fkey"
      FOREIGN KEY ("reservationCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InventoryUnit_reservationCustomerId_idx" ON "InventoryUnit"("reservationCustomerId");
