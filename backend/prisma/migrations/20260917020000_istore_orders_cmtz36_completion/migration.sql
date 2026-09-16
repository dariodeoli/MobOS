-- Completa el seed de iStore: PIN de los 7 vendedores sembrados y precios de
-- venta reales del export (última venta minorista por producto). Idempotente.

DO $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = 'cmtz36apy00002ephu1gv7tkt' ORDER BY "createdAt" LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- PIN de cada vendedor sembrado (solo placeholders sin credenciales).
  UPDATE "User" SET "pinHash" = '$2b$10$ylObffoiSzdNdEB.6FoZmO9pvH9OAg3ViEOsIjSI7jWyrBmt2Gix.', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Claudia Carrillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$HIZmKs0aE4ksx/vn6xKAauyATJ6ctag2EE8nLPtaj2qCnBcMAsNMC', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Dulce Financiación' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$TvlW.QtzEgVkOH8SS8KPGOa9mCo0/fRD3kxxu3QZIKFQK2wcbl7E6', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Inara Oliveira' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$3Gr7vnLCb12.5mgtwtczg.UI9B4.fvdgayktj5zlprQmGQRZYg48C', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Jadiyi Martinez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$McnhPBSVO32nsEOXgL.L3ObqzT/GyQPUNVAMFPtXcHZD.APiCuuh.', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Mateo Benitez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$E0X3KytloGYTJwPWbmI17e6XbKn1Cuazz9ULNNbnCE.lzDXO1smYu', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Edgar Castillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$pi3zzlQkz5kyPvksdBGViuGJFYoZJ19jSgTiwzjD3eNNKfiyi0hJ2', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Sandra Sandoval' AND "pinHash" = 'no-login-seed';

  -- Precios de venta reales: última venta minorista por producto.
  UPDATE "Product" SET "pricePyg" = 160000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-CARGADORAPPLEWATCH';
  UPDATE "Product" SET "pricePyg" = 190000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-CARGADORMAGSAFE';
  UPDATE "Product" SET "pricePyg" = 192000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-EARPODSC';
  UPDATE "Product" SET "pricePyg" = 155000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-POWERBANKXIAOMI10000MAH';
  UPDATE "Product" SET "pricePyg" = 1400000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-SAMSUNGGALAXYWATCH844MMNEGRO';
  UPDATE "Product" SET "pricePyg" = 3500000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPD-IPAD11THA16WIFI256GBAZUL';
  UPDATE "Product" SET "pricePyg" = 2050000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-13-128GB-ESTELAR-USED';
  UPDATE "Product" SET "pricePyg" = 2350000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-13-256GB-MEDIANOCHE-USED';
  UPDATE "Product" SET "pricePyg" = 2890000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-13PRO-256GB-AZULSIERRA-USED';
  UPDATE "Product" SET "pricePyg" = 2145000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14-128GB-AZUL-USED';
  UPDATE "Product" SET "pricePyg" = 1998000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14-128GB-LILA-USED';
  UPDATE "Product" SET "pricePyg" = 1980000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14-128GB-MEDIANOCHE-USED';
  UPDATE "Product" SET "pricePyg" = 3290000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14PRO-256GB-LILAOSCURO-USED';
  UPDATE "Product" SET "pricePyg" = 3290000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14PRO-256GB-NEGROESPACIAL-USED';
  UPDATE "Product" SET "pricePyg" = 3420000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14PROMAX-128GB-LILAOSCURO-USED';
  UPDATE "Product" SET "pricePyg" = 2640000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15-128GB-NEGRO-USED';
  UPDATE "Product" SET "pricePyg" = 2950000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15-128GB-VERDE-USED';
  UPDATE "Product" SET "pricePyg" = 3990000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15PRO-256GB-TITANIOAZUL-USED';
  UPDATE "Product" SET "pricePyg" = 3990000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16-128GB-TEAL-USED';
  UPDATE "Product" SET "pricePyg" = 2340000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16E-128GB-NEGRO-USED';
  UPDATE "Product" SET "pricePyg" = 4290000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16PRO-128GB-NATURAL-USED';
  UPDATE "Product" SET "pricePyg" = 5690000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16PROMAX-256GB-NEGRO-USED';
  UPDATE "Product" SET "pricePyg" = 6350000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-AZUL-NEW';
  UPDATE "Product" SET "pricePyg" = 4620000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-AZUL-USED';
  UPDATE "Product" SET "pricePyg" = 6000000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-BLANCO-NEW';
  UPDATE "Product" SET "pricePyg" = 6000000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-LILA-NEW';
  UPDATE "Product" SET "pricePyg" = 5900000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-NEGRO-NEW';
  UPDATE "Product" SET "pricePyg" = 7950000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 6790000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-PLATA-USED';
  UPDATE "Product" SET "pricePyg" = 8590000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-256GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 7100000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-256GB-PLATA-USED';
  UPDATE "Product" SET "pricePyg" = 7890000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-512GB-AZUL-USED';
  UPDATE "Product" SET "pricePyg" = 10350000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-512GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 9350000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'MAC-MACBOOKAIRM516GB512GBMIDNIGHT';
  UPDATE "Product" SET "pricePyg" = 1950000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'WTC-APPLEWATCHSE202544MM';
END $$;
