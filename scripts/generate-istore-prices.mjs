// Genera la migración SQL de precios de lista reales de iStore Paraguay
// (flyers actualizados, 16-09-2026) para el tenant exacto.
// Uso: node scripts/generate-istore-prices.mjs [tenantId] [outputDir]
// Reglas: [like, like2, n1, n2, n3, cap, cond, precio] con ILIKE sobre el
// nombre; like2 = segundo patrón obligatorio; n1-n3 = exclusiones;
// cap '128GB'|'1TB'|null; cond 'NEW'|'USED'|null (null = cualquier condición).
// Un UPDATE por regla: determinista; las reglas específicas van después de las
// generales para que pisen cualquier colisión.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const [, , TARGET_TENANT_ID = 'cmtz36apy00002ephu1gv7tkt', OUTPUT_DIR = '20260917040000_istore_list_prices'] = process.argv

const q = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

// ── Precios de lista (fuente: flyers de Dario, 16-09-2026) ────────────────
const RULES = []
const add = (like, like2, n1, n2, n3, cap, cond, precio) => RULES.push([like, like2 ?? null, n1 ?? null, n2 ?? null, n3 ?? null, cap ?? null, cond ?? null, precio])

// iPhones
add('iphone 13', null, 'pro', null, null, '128GB', 'USED', 2050000); add('iphone 13', null, 'pro', null, null, '256GB', 'USED', 2350000)
add('iphone 13 pro', null, 'pro max', null, null, '128GB', 'USED', 2590000); add('iphone 13 pro', null, 'pro max', null, null, '256GB', 'USED', 2890000)
add('iphone 13 pro max', null, null, null, null, '128GB', 'USED', 3000000); add('iphone 13 pro max', null, null, null, null, '256GB', 'USED', 3200000)
add('iphone 14', null, 'pro', 'plus', null, '128GB', 'USED', 2240000); add('iphone 14', null, 'pro', 'plus', null, '256GB', 'USED', 2550000)
add('iphone 14 plus', null, 'pro', null, null, '128GB', 'NEW', 4100000); add('iphone 14 plus', null, 'pro', null, null, '128GB', 'USED', 2650000); add('iphone 14 plus', null, 'pro', null, null, '256GB', 'USED', 3350000)
add('iphone 14 pro', null, 'pro max', null, null, '128GB', 'USED', 3100000); add('iphone 14 pro', null, 'pro max', null, null, '256GB', 'USED', 3290000)
add('iphone 14 pro max', null, null, null, null, '128GB', 'USED', 3550000); add('iphone 14 pro max', null, null, null, null, '256GB', 'USED', 3850000)
add('iphone 15', null, 'pro', 'plus', null, '128GB', 'NEW', 4300000); add('iphone 15', null, 'pro', 'plus', null, '256GB', 'NEW', 4800000)
add('iphone 15', null, 'pro', 'plus', null, '128GB', 'USED', 2950000); add('iphone 15', null, 'pro', 'plus', null, '256GB', 'USED', 3400000)
add('iphone 15 plus', null, 'pro', null, null, '128GB', 'NEW', 4400000); add('iphone 15 plus', null, 'pro', null, null, '256GB', 'NEW', 5100000)
add('iphone 15 plus', null, 'pro', null, null, '128GB', 'USED', 3300000); add('iphone 15 plus', null, 'pro', null, null, '256GB', 'USED', 3900000)
add('iphone 15 pro', null, 'pro max', null, null, '128GB', 'USED', 3750000); add('iphone 15 pro', null, 'pro max', null, null, '256GB', 'USED', 3990000)
add('iphone 15 pro max', null, null, null, null, '256GB', 'USED', 4500000); add('iphone 15 pro max', null, null, null, null, '512GB', 'USED', 4750000)
add('iphone 16', '16e', null, null, null, '128GB', 'NEW', 3690000); add('iphone 16', '16e', null, null, null, '128GB', 'USED', 2990000)
add('iphone 16', '16 e', null, null, null, '128GB', 'NEW', 3690000); add('iphone 16', '16 e', null, null, null, '128GB', 'USED', 2990000)
add('iphone 16', null, '16e', '16 e', 'pro', '128GB', 'NEW', 4950000); add('iphone 16', null, '16e', '16 e', 'pro', '256GB', 'NEW', 5290000); add('iphone 16', null, '16e', '16 e', 'pro', '128GB', 'USED', 3990000)
add('iphone 16 plus', null, null, null, null, '128GB', 'NEW', 5400000); add('iphone 16 plus', null, null, null, null, '256GB', 'NEW', 6150000); add('iphone 16 plus', null, null, null, null, '128GB', 'USED', 4200000)
add('iphone 16 pro', null, 'pro max', null, null, '128GB', 'USED', 4800000); add('iphone 16 pro', null, 'pro max', null, null, '256GB', 'USED', 5150000)
add('iphone 16 pro max', null, null, null, null, '256GB', 'USED', 5690000); add('iphone 16 pro max', null, null, null, null, '512GB', 'USED', 5990000)
add('iphone 17', '17e', null, null, null, '256GB', 'NEW', 4790000); add('iphone 17', '17e', null, null, null, '512GB', 'NEW', 5350000)
add('iphone 17', '17 e', null, null, null, '256GB', 'NEW', 4790000); add('iphone 17', '17 e', null, null, null, '512GB', 'NEW', 5350000)
add('iphone 17', null, '17e', '17 e', 'pro', '256GB', 'NEW', 6000000); add('iphone 17', null, '17e', '17 e', 'pro', '512GB', 'NEW', 7150000); add('iphone 17', null, '17e', '17 e', 'pro', '256GB', 'USED', 5190000)
add('iphone 17 air', null, null, null, null, '256GB', 'NEW', 6250000); add('iphone 17 air', null, null, null, null, '512GB', 'NEW', 7790000)
add('iphone 17 pro', null, 'pro max', null, null, '256GB', 'NEW', 7950000); add('iphone 17 pro', null, 'pro max', null, null, '512GB', 'NEW', 9290000)
add('iphone 17 pro', null, 'pro max', null, null, '256GB', 'USED', 6790000); add('iphone 17 pro', null, 'pro max', null, null, '512GB', 'USED', 7990000)
add('iphone 17 pro max', null, null, null, null, '256GB', 'NEW', 8590000); add('iphone 17 pro max', null, null, null, null, '512GB', 'NEW', 10350000)
add('iphone 17 pro max', null, null, null, null, '256GB', 'USED', 7190000); add('iphone 17 pro max', null, null, null, null, '512GB', 'USED', 8800000)
// iPhone 18: Pro y Pro Max 5.000.000 más que los 17; 18 Duo 20.000.000
add('iphone 18 pro', null, 'pro max', null, null, '256GB', 'NEW', 12950000); add('iphone 18 pro', null, 'pro max', null, null, '512GB', 'NEW', 14290000)
add('iphone 18 pro', null, 'pro max', null, null, '256GB', 'USED', 11790000); add('iphone 18 pro', null, 'pro max', null, null, '512GB', 'USED', 12990000)
add('iphone 18 pro max', null, null, null, null, '256GB', 'NEW', 13590000); add('iphone 18 pro max', null, null, null, null, '512GB', 'NEW', 15350000)
add('iphone 18 pro max', null, null, null, null, '256GB', 'USED', 12190000); add('iphone 18 pro max', null, null, null, null, '512GB', 'USED', 13800000)
add('iphone 18', 'duo', null, null, null, null, null, 20000000)

// MacBooks
add('macbook neo', '8gb', null, null, null, '256GB', null, 5050000); add('macbook neo', '8gb', null, null, null, '512GB', null, 5790000)
add('macbook air m4', '24gb', null, null, null, '1TB', null, 11390000)
add('macbook air m5', '16gb', null, null, null, '512GB', null, 9560000); add('macbook air m5', '16gb', null, null, null, '1TB', null, 10200000); add('macbook air m5', '24gb', null, null, null, '1TB', null, 12570000)
add('macbook pro m4', '16gb', 'pro m4 pro', null, null, '512GB', null, 11290000)
add('macbook pro m4 pro', '24gb', null, null, null, '512GB', null, 13850000); add('macbook pro m4 pro', '24gb', null, null, null, '1TB', null, 15850000)
add('macbook pro m5', '16gb', 'pro m5 pro', null, null, '512GB', null, 12850000); add('macbook pro m5', '16gb', 'pro m5 pro', null, null, '1TB', null, 13150000); add('macbook pro m5', '24gb', 'pro m5 pro', null, null, '1TB', null, 14830000)
add('macbook pro m5 pro', '24gb', null, null, null, '1TB', null, 21190000)

// iPads — WiFi = pulgada + excluir '5g'; 5G = pulgada + excluir 'wifi'
add('ipad mini 7', null, null, null, null, '128GB', null, 3980000); add('ipad mini 7', null, null, null, null, '256GB', null, 4700000)
add('ipad 11', 'wifi', '5g', null, null, '128GB', null, 3000000); add('ipad 11', 'wifi', '5g', null, null, '256GB', null, 3600000); add('ipad 11', '5g', null, null, null, '128GB', null, 4250000)
add('ipad air m4', '11', '5g', null, null, '128GB', null, 4950000)
add('ipad air m4', '11', 'wifi', null, null, '128GB', null, 5950000)
add('ipad air m4', '13', '5g', null, null, '128GB', null, 6350000); add('ipad air m4', '13', '5g', null, null, '256GB', null, 7150000)
add('ipad air m4', '13', 'wifi', null, null, '128GB', null, 7450000)
add('ipad pro m4', '11', '5g', null, null, '256GB', null, 7510000); add('ipad pro m4', '11', '5g', null, null, '512GB', null, 9150000)
add('ipad pro m4', '11', 'wifi', null, null, '256GB', null, 7990000); add('ipad pro m4', '11', 'wifi', null, null, '512GB', null, 9790000)
add('ipad pro m4', '13', '5g', null, null, '256GB', null, 7950000); add('ipad pro m4', '13', '5g', null, null, '512GB', null, 9550000)
add('ipad pro m4', '13', 'wifi', null, null, '256GB', null, 8600000); add('ipad pro m4', '13', 'wifi', null, null, '512GB', null, 10990000)
add('ipad pro m5', '11', '5g', null, null, '256GB', null, 8050000); add('ipad pro m5', '11', '5g', null, null, '512GB', null, 9590000); add('ipad pro m5', '11', '5g', null, null, '1TB', null, 11650000)
add('ipad pro m5', '11', 'wifi', null, null, '256GB', null, 8410000); add('ipad pro m5', '11', 'wifi', null, null, '512GB', null, 9650000)
add('ipad pro m5', '13', '5g', null, null, '256GB', null, 9110000); add('ipad pro m5', '13', '5g', null, null, '512GB', null, 10350000)
add('ipad pro m5', '13', 'wifi', null, null, '256GB', null, 10190000); add('ipad pro m5', '13', 'wifi', null, null, '512GB', null, 11600000)

// Apple Watches
add('watch se 2024', null, null, null, null, null, null, 1450000)
add('watch se 2025', '40', null, null, null, null, null, 1850000); add('watch se 2025', '44', null, null, null, null, null, 1950000)
add('watch series 11', '42', null, null, null, null, null, 2400000); add('watch series 11', '46', null, null, null, null, null, 2580000)
add('watch ultra 2', null, null, null, null, null, null, 4510000); add('watch ultra 3', null, null, null, null, null, null, 5150000)

// AirPods, AirTags y accesorios
add('airpods 4', null, 'cancel', 'pro', null, null, null, 830000); add('airpods 4', 'cancel', 'pro', null, null, null, null, 1280000)
add('airpods pro 3', null, null, null, null, null, null, 1550000)
add('airpods max', null, 'max 2', null, null, null, null, 3350000); add('airpods max 2', null, null, null, null, null, null, 3690000)
add('airtag', null, 'airtag 2', 'pack', null, null, null, 190000); add('airtag', 'pack', 'airtag 2', null, null, null, null, 550000)
add('airtag 2', null, null, 'pack', null, null, null, 280000); add('airtag 2', 'pack', null, null, null, null, null, 815000)
add('pencil pro', null, null, null, null, null, null, 820000)
add('pencil', '1ra', null, null, null, null, null, 650000); add('pencil', '2da', null, null, null, null, null, 590000)
add('pencil', 'usb', null, null, null, null, null, 620000)
add('puntas', null, null, null, null, null, null, 190000)
add('cable usb-c a c', 'original', null, null, null, null, null, 250000); add('cable usb-c a c', 'certificado', null, null, null, null, null, 120000)
add('cable usb-c', 'original', 'a c', null, null, null, null, 210000); add('cable usb-c', 'certificado', 'a c', null, null, null, null, 90000)
add('cable usb-a', 'certificado', null, null, null, null, null, 70000)
add('fuente 20w', 'original', null, null, null, null, null, 250000); add('fuente 20w', 'certificado', null, null, null, null, null, 120000); add('fuente 5w', 'original', null, null, null, null, null, 70000)

// Un UPDATE por regla con las columnas en el WHERE directamente.
const lines = RULES.map((r) => {
  const where = [
    `p."tenantId" = v_tenant_id`,
    `p."name" ILIKE '%' || ${q(r[0])} || '%'`,
    r[1] ? `p."name" ILIKE '%' || ${q(r[1])} || '%'` : null,
    r[2] ? `p."name" NOT ILIKE '%' || ${q(r[2])} || '%'` : null,
    r[3] ? `p."name" NOT ILIKE '%' || ${q(r[3])} || '%'` : null,
    r[4] ? `p."name" NOT ILIKE '%' || ${q(r[4])} || '%'` : null,
    r[5] ? `p."name" ILIKE '%' || ${q(r[5])} || '%'` : null,
    r[6] ? `p."condition"::text = ${q(r[6])}` : null,
  ].filter(Boolean).join('\n      AND ')
  return `  UPDATE "Product" p SET "pricePyg" = ${r[7]}, "updatedAt" = now()
    WHERE ${where};`
}).join('\n\n')

const sql = `-- Precios de lista reales de iStore Paraguay (flyers actualizados, 16-09-2026).
-- Idempotente: un UPDATE por regla; cada regla matchea nombre ILIKE con
-- exclusiones, capacidad y condición. Las reglas específicas corren después
-- de las generales y pisan cualquier colisión.
DO $$
DECLARE
  v_tenant_id TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = '${TARGET_TENANT_ID}';
  IF v_tenant_id IS NULL THEN RETURN; END IF;

${lines}

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'istore_list_prices: ultima regla actualizo % productos', v_count;
END $$;
`

const MIGRATION_DIR = join(ROOT, 'backend/prisma/migrations', OUTPUT_DIR)
mkdirSync(MIGRATION_DIR, { recursive: true })
writeFileSync(join(MIGRATION_DIR, 'migration.sql'), sql)
console.log(`Migración generada: backend/prisma/migrations/${OUTPUT_DIR}/migration.sql`)
console.log(`Reglas: ${RULES.length} · tenant: ${TARGET_TENANT_ID}`)
