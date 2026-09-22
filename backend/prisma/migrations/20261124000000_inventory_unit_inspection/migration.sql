-- #240: checklist PhoneCheck por unidad (json con items, cosmético y resumen).
ALTER TABLE "InventoryUnit" ADD COLUMN IF NOT EXISTS "inspection" JSONB;
