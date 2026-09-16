-- Completa el seed de iStore: PIN de los 7 vendedores sembrados y precios de
-- venta reales del export (última venta minorista por producto). Idempotente.

DO $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = 'cmtz36apy00002ephu1gv7tkt' ORDER BY "createdAt" LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- PIN de cada vendedor sembrado (solo placeholders sin credenciales).
  UPDATE "User" SET "pinHash" = '$2b$10$nV/2ZHecEnmNKRhVRpNtj.ZOCL7jfKrwPtrnwcyzOjZrNxBUw14jS', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Sandra Sandoval' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$igr5TLyLBjIQUcY6EFuntuolkmGMZK5qouSYyoyjBRW8kK2PP3aMW', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Jadiyi Martinez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$ESs7NWgBXoRW4cnPy1NIVeXiRxfTL7SFUGAhDaYAcst84aqYImHpq', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Mateo Benitez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$7djKeNu2LhBx5vOX1d8j2.VOqHUWl7vmiWgV19BKimnqHYiMJsaUq', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Edgar Castillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$6Rb0BR8dkFwjluhODlnoOuquksG0iJ3hOxaNaszYABfNMEgh8Iwbm', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Claudia Carrillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$MVuataK5jXQLf5UdpMCAdeFxd9KUPMIYpmiLvAAnGC/sXnPU4IHEm', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Inara Oliveira' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$0v4sFV0iJIV5GpAKd6fWMelT/NoXlasixiNL3gfw9VQ3SkxdX/D8C', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Dulce Financiación' AND "pinHash" = 'no-login-seed';

  -- Precios de venta reales: última venta minorista por producto.
  UPDATE "Product" SET "pricePyg" = 1660000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-AIRPODSPRO3';
  UPDATE "Product" SET "pricePyg" = 246000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-AIRTAG';
  UPDATE "Product" SET "pricePyg" = 250000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'ACC-CARGADOR20WUSBC';
  UPDATE "Product" SET "pricePyg" = 1985000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-13-128GB-ROSA-USED';
  UPDATE "Product" SET "pricePyg" = 2240000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14-128GB-LILA-USED';
  UPDATE "Product" SET "pricePyg" = 2240000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14-128GB-MEDIANOCHE-USED';
  UPDATE "Product" SET "pricePyg" = 3290000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14PRO-256GB-NEGROESPACIAL-USED';
  UPDATE "Product" SET "pricePyg" = 3290000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-14PRO-256GB-PLATA-USED';
  UPDATE "Product" SET "pricePyg" = 2950000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15-128GB-VERDE-USED';
  UPDATE "Product" SET "pricePyg" = 3990000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15PRO-256GB-TITANIOAZUL-USED';
  UPDATE "Product" SET "pricePyg" = 4500000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15PROMAX-256GB-TITANIOAZUL-USED';
  UPDATE "Product" SET "pricePyg" = 4750000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-15PROMAX-512GB-TITANIOAZUL-USED';
  UPDATE "Product" SET "pricePyg" = 4821000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16-128GB-NEGRO-NEW';
  UPDATE "Product" SET "pricePyg" = 4821000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16-128GB-ROSA-NEW';
  UPDATE "Product" SET "pricePyg" = 5150000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-16PROMAX-256GB-NEGRO-USED';
  UPDATE "Product" SET "pricePyg" = 5850000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-BLANCO-NEW';
  UPDATE "Product" SET "pricePyg" = 5850000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17-256GB-NEGRO-NEW';
  UPDATE "Product" SET "pricePyg" = 7690000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-AZUL-NEW';
  UPDATE "Product" SET "pricePyg" = 6790000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-AZUL-USED';
  UPDATE "Product" SET "pricePyg" = 7355000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-NARANJA-NEW';
  UPDATE "Product" SET "pricePyg" = 7690000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PRO-256GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 8116606, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-256GB-AZUL-NEW';
  UPDATE "Product" SET "pricePyg" = 8116606, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-256GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 9700000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'IPH-17PROMAX-512GB-PLATA-NEW';
  UPDATE "Product" SET "pricePyg" = 1850000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'WTC-APPLEWATCHSE202540MM';
  UPDATE "Product" SET "pricePyg" = 1950000, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "sku" = 'WTC-APPLEWATCHSE202544MM';
END $$;
