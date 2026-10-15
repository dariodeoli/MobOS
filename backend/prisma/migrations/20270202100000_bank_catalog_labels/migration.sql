-- #363: equivalencias exactas de la MISMA institución. No cambia identidades
-- ambiguas (El Comercio, Finexpar, Regional), titulares, números ni pagos.
-- Respaldo auditable de banco anterior/nuevo por tenant ANTES de actualizar.
BEGIN;
WITH aliases(previous, canonical) AS (VALUES
  ('Banco Interfisa', 'Interfisa Banco'),
  ('Banco Itaú Paraguay', 'Itaú'),
  ('Banco Sudameris', 'Sudameris'),
  ('Citibank Paraguay', 'Citi'),
  ('Cooperativa Medalla Milagrosa', 'Medalla Milagrosa'),
  ('Cooperativa San Cristóbal', 'San Cristóbal'),
  ('Cooperativa Universitaria', 'Universitaria')
), candidates AS (
  SELECT account."id", account."tenantId", account."bank" AS previous, aliases.canonical
  FROM "PaymentAccount" account JOIN aliases ON account."bank" = aliases.previous
), backed_up AS (
  INSERT INTO "AuditLog" ("id", "tenantId", "action", "entity", "entityId", "metadata")
  SELECT 'bank363-' || md5("id" || previous), "tenantId", 'PAYMENT_ACCOUNT_BANK_CATALOG_NORMALIZED',
    'PaymentAccount', "id", jsonb_build_object('before', previous, 'after', canonical, 'migration', '20270202100000_bank_catalog_labels')
  FROM candidates
  ON CONFLICT ("id") DO UPDATE SET "metadata" = "AuditLog"."metadata"
  RETURNING "entityId", "tenantId"
)
UPDATE "PaymentAccount" account SET "bank" = candidates.canonical
FROM candidates JOIN backed_up ON backed_up."entityId" = candidates."id" AND backed_up."tenantId" = candidates."tenantId"
WHERE account."id" = candidates."id" AND account."tenantId" = candidates."tenantId" AND account."bank" = candidates.previous;
COMMIT;
