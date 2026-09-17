-- Variante estructurada del producto: modelo, color y capacidad.
ALTER TABLE "Product" ADD COLUMN "model" TEXT,
                      ADD COLUMN "color" TEXT,
                      ADD COLUMN "capacity" TEXT;

-- Backfill conservador desde el nombre para productos con capacidad
-- (iPhone 7 128GB Negro → iPhone 7 · 128GB · Negro). Los nombres sin
-- capacidad (accesorios, servicios) quedan sin variante.
UPDATE "Product" SET
  "model" = btrim(regexp_replace("name", '\s*[0-9]+\s?(?:GB|TB).*$', '', 'i')),
  -- substring (no regexp_matches): las funciones que devuelven conjuntos no
  -- se permiten en UPDATE.
  "capacity" = upper(replace(substring("name" from '[0-9]+\s?(?:GB|TB)'), ' ', '')),
  "color" = nullif(btrim(regexp_replace("name", '^.*[0-9]+\s?(?:GB|TB)\s*', '', 'i')), '')
WHERE "name" ~* '[0-9]+\s?(GB|TB)';
