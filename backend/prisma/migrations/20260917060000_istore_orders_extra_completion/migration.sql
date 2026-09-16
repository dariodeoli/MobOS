-- Completa el seed de iStore: PIN de los 7 vendedores sembrados y precios de
-- venta reales del export (última venta minorista por producto). Idempotente.

DO $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = 'cmtz36apy00002ephu1gv7tkt' ORDER BY "createdAt" LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- PIN de cada vendedor sembrado (solo placeholders sin credenciales).
  UPDATE "User" SET "pinHash" = '$2b$10$cTkEWRJ.58M.NkV6z8tMp.RVVoZXYimMaTl6cCxpS./t7TMWzuBri', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Sandra Sandoval' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$4GKgspc1VGiHRD4LU9hnsePgzcL4ZRuH96svAby9WEzH5bHgyrYXa', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Jadiyi Martinez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$8XollrSQ5b68N6S5XErkVOz5LVO1o/cUBoeLdL46ZQD6rOXNA93ZO', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Mateo Benitez' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$7Wrle1g5mw34HcrEwrhEB.VpEyE4ygWQ5Rp5gMFr2ipfHE5g11TK2', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Edgar Castillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$XtEKAk4TsjTAHDH5hn8fLOPtgcvKAMwJ2yOwCxrcmYj2uqRWbb1oW', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Claudia Carrillo' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$TbKS5LwJTjSQfOXYLV/r7eVWgmM2uWuPcIsKY3Ic76253aruL2upO', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Inara Oliveira' AND "pinHash" = 'no-login-seed';
  UPDATE "User" SET "pinHash" = '$2b$10$3gFc8om464m.wX9bqNVWKe53xYpI1QMK8kFMpaeFSGLtC3fPjfRHO', "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "name" = 'Dulce Financiación' AND "pinHash" = 'no-login-seed';

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
