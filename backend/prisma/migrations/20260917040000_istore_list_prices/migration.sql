-- Precios de lista reales de iStore Paraguay (flyers actualizados, 16-09-2026).
-- Idempotente: un UPDATE por regla; cada regla matchea nombre ILIKE con
-- exclusiones, capacidad y condición. Las reglas específicas corren después
-- de las generales y pisan cualquier colisión.
DO $$
DECLARE
  v_tenant_id TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = 'cmtz36apy00002ephu1gv7tkt';
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  UPDATE "Product" p SET "pricePyg" = 2050000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 2350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 2590000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 2890000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3000000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13 pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3200000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 13 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 2240000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 2550000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4100000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 2650000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3100000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3290000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3550000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3850000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 14 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4300000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 4800000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 2950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3400000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" NOT ILIKE '%' || 'plus' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4400000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 5100000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 3300000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3900000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 plus' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3750000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4500000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4750000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 15 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3690000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" ILIKE '%' || '16e' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 2990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" ILIKE '%' || '16e' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 3690000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" ILIKE '%' || '16 e' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 2990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" ILIKE '%' || '16 e' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" NOT ILIKE '%' || '16e' || '%'
      AND p."name" NOT ILIKE '%' || '16 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 5290000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" NOT ILIKE '%' || '16e' || '%'
      AND p."name" NOT ILIKE '%' || '16 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 3990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16' || '%'
      AND p."name" NOT ILIKE '%' || '16e' || '%'
      AND p."name" NOT ILIKE '%' || '16 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 5400000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 plus' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 6150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 plus' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 4200000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 plus' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4800000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 5150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 5690000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 5990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 16 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 4790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" ILIKE '%' || '17e' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 5350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" ILIKE '%' || '17e' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 4790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" ILIKE '%' || '17 e' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 5350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" ILIKE '%' || '17 e' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 6000000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" NOT ILIKE '%' || '17e' || '%'
      AND p."name" NOT ILIKE '%' || '17 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 7150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" NOT ILIKE '%' || '17e' || '%'
      AND p."name" NOT ILIKE '%' || '17 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 5190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17' || '%'
      AND p."name" NOT ILIKE '%' || '17e' || '%'
      AND p."name" NOT ILIKE '%' || '17 e' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 6250000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 air' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 7790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 air' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 7950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 9290000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 6790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 7990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 8590000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 10350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 7190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 8800000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 17 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 12950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 14290000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 11790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 12990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro' || '%'
      AND p."name" NOT ILIKE '%' || 'pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 13590000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 15350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'NEW';

  UPDATE "Product" p SET "pricePyg" = 12190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro max' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 13800000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18 pro max' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%'
      AND p."condition"::text = 'USED';

  UPDATE "Product" p SET "pricePyg" = 20000000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'iphone 18' || '%'
      AND p."name" ILIKE '%' || 'duo' || '%';

  UPDATE "Product" p SET "pricePyg" = 5050000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook neo' || '%'
      AND p."name" ILIKE '%' || '8gb' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 5790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook neo' || '%'
      AND p."name" ILIKE '%' || '8gb' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 11390000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook air m4' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9560000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook air m5' || '%'
      AND p."name" ILIKE '%' || '16gb' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 10200000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook air m5' || '%'
      AND p."name" ILIKE '%' || '16gb' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 12570000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook air m5' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 11290000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m4' || '%'
      AND p."name" ILIKE '%' || '16gb' || '%'
      AND p."name" NOT ILIKE '%' || 'pro m4 pro' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 13850000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m4 pro' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 15850000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m4 pro' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 12850000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m5' || '%'
      AND p."name" ILIKE '%' || '16gb' || '%'
      AND p."name" NOT ILIKE '%' || 'pro m5 pro' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 13150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m5' || '%'
      AND p."name" ILIKE '%' || '16gb' || '%'
      AND p."name" NOT ILIKE '%' || 'pro m5 pro' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 14830000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m5' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" NOT ILIKE '%' || 'pro m5 pro' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 21190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'macbook pro m5 pro' || '%'
      AND p."name" ILIKE '%' || '24gb' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 3980000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad mini 7' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 4700000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad mini 7' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 3000000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad 11' || '%'
      AND p."name" ILIKE '%' || 'wifi' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 3600000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad 11' || '%'
      AND p."name" ILIKE '%' || 'wifi' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 4250000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad 11' || '%'
      AND p."name" ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 4950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad air m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 5950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad air m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 6350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad air m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 7150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad air m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 7450000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad air m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '128GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 7510000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 7990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9790000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 7950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9550000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 8600000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 10990000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m4' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 8050000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9590000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 11650000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '1TB' || '%';

  UPDATE "Product" p SET "pricePyg" = 8410000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9650000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '11' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 9110000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 10350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || '5g' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 10190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '256GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 11600000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'ipad pro m5' || '%'
      AND p."name" ILIKE '%' || '13' || '%'
      AND p."name" NOT ILIKE '%' || 'wifi' || '%'
      AND p."name" ILIKE '%' || '512GB' || '%';

  UPDATE "Product" p SET "pricePyg" = 1450000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch se 2024' || '%';

  UPDATE "Product" p SET "pricePyg" = 1850000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch se 2025' || '%'
      AND p."name" ILIKE '%' || '40' || '%';

  UPDATE "Product" p SET "pricePyg" = 1950000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch se 2025' || '%'
      AND p."name" ILIKE '%' || '44' || '%';

  UPDATE "Product" p SET "pricePyg" = 2400000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch series 11' || '%'
      AND p."name" ILIKE '%' || '42' || '%';

  UPDATE "Product" p SET "pricePyg" = 2580000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch series 11' || '%'
      AND p."name" ILIKE '%' || '46' || '%';

  UPDATE "Product" p SET "pricePyg" = 4510000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch ultra 2' || '%';

  UPDATE "Product" p SET "pricePyg" = 5150000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'watch ultra 3' || '%';

  UPDATE "Product" p SET "pricePyg" = 830000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airpods 4' || '%'
      AND p."name" NOT ILIKE '%' || 'cancel' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%';

  UPDATE "Product" p SET "pricePyg" = 1280000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airpods 4' || '%'
      AND p."name" ILIKE '%' || 'cancel' || '%'
      AND p."name" NOT ILIKE '%' || 'pro' || '%';

  UPDATE "Product" p SET "pricePyg" = 1550000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airpods pro 3' || '%';

  UPDATE "Product" p SET "pricePyg" = 3350000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airpods max' || '%'
      AND p."name" NOT ILIKE '%' || 'max 2' || '%';

  UPDATE "Product" p SET "pricePyg" = 3690000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airpods max 2' || '%';

  UPDATE "Product" p SET "pricePyg" = 190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airtag' || '%'
      AND p."name" NOT ILIKE '%' || 'airtag 2' || '%'
      AND p."name" NOT ILIKE '%' || 'pack' || '%';

  UPDATE "Product" p SET "pricePyg" = 550000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airtag' || '%'
      AND p."name" ILIKE '%' || 'pack' || '%'
      AND p."name" NOT ILIKE '%' || 'airtag 2' || '%';

  UPDATE "Product" p SET "pricePyg" = 280000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airtag 2' || '%'
      AND p."name" NOT ILIKE '%' || 'pack' || '%';

  UPDATE "Product" p SET "pricePyg" = 815000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'airtag 2' || '%'
      AND p."name" ILIKE '%' || 'pack' || '%';

  UPDATE "Product" p SET "pricePyg" = 820000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'pencil pro' || '%';

  UPDATE "Product" p SET "pricePyg" = 650000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'pencil' || '%'
      AND p."name" ILIKE '%' || '1ra' || '%';

  UPDATE "Product" p SET "pricePyg" = 590000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'pencil' || '%'
      AND p."name" ILIKE '%' || '2da' || '%';

  UPDATE "Product" p SET "pricePyg" = 620000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'pencil' || '%'
      AND p."name" ILIKE '%' || 'usb' || '%';

  UPDATE "Product" p SET "pricePyg" = 190000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'puntas' || '%';

  UPDATE "Product" p SET "pricePyg" = 250000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'cable usb-c a c' || '%'
      AND p."name" ILIKE '%' || 'original' || '%';

  UPDATE "Product" p SET "pricePyg" = 120000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'cable usb-c a c' || '%'
      AND p."name" ILIKE '%' || 'certificado' || '%';

  UPDATE "Product" p SET "pricePyg" = 210000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'cable usb-c' || '%'
      AND p."name" ILIKE '%' || 'original' || '%'
      AND p."name" NOT ILIKE '%' || 'a c' || '%';

  UPDATE "Product" p SET "pricePyg" = 90000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'cable usb-c' || '%'
      AND p."name" ILIKE '%' || 'certificado' || '%'
      AND p."name" NOT ILIKE '%' || 'a c' || '%';

  UPDATE "Product" p SET "pricePyg" = 70000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'cable usb-a' || '%'
      AND p."name" ILIKE '%' || 'certificado' || '%';

  UPDATE "Product" p SET "pricePyg" = 250000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'fuente 20w' || '%'
      AND p."name" ILIKE '%' || 'original' || '%';

  UPDATE "Product" p SET "pricePyg" = 120000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'fuente 20w' || '%'
      AND p."name" ILIKE '%' || 'certificado' || '%';

  UPDATE "Product" p SET "pricePyg" = 70000, "updatedAt" = now()
    WHERE p."tenantId" = v_tenant_id
      AND p."name" ILIKE '%' || 'fuente 5w' || '%'
      AND p."name" ILIKE '%' || 'original' || '%';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'istore_list_prices: ultima regla actualizo % productos', v_count;
END $$;
