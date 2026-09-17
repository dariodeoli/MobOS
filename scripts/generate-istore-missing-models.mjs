// Genera la migración SQL con los modelos que faltan en el catálogo de iStore
// Paraguay (tenant cmtz36apy00002ephu1gv7tkt) según la lista oficial de Dario
// del 17-09-2026 (colores incluidos en iPads y MacBooks).
// Uso: node scripts/generate-istore-missing-models.mjs [tenantId] [outputDir] [--diff]
// - Sin --diff escribe backend/prisma/migrations/<outputDir>/migration.sql.
// - Con --diff solo imprime el faltante contra el catálogo sembrado (dev).
// Reglas:
//  - iPhone 18 base se omite (aún sin lanzamiento oficial; pedido de Dario).
//  - Los modelos iPhone 7→18 ya están sembrados: no se re-insertan ni se
//    tocan sus colores (el catálogo usa su propia paleta).
//  - INSERT idempotente por SKU; stock 0 (mercadería sin serie).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const DIFF = args.includes('--diff')
const [TARGET_TENANT_ID = 'cmtz36apy00002ephu1gv7tkt', OUTPUT_DIR = '20261001010000_istore_missing_models'] = args.filter(arg => !arg.startsWith('--'))

const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
const uuid5 = name => {
  const hex = createHash('sha1').update(`mobos-seed:${name}`).digest('hex').slice(0, 32)
  const chars = hex.split('')
  chars[12] = '5'
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16)
  const u = chars.join('')
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`
}
const q = value => value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`

// ── iPads: [nombre base, wifi/5g, capacidad, precio, colores] ───────────────
const IPAD_COLORS = {
  mini: ['Gris Espacial', 'Azul', 'Púrpura', 'Blanco Estelar'],
  base: ['Plata', 'Azul', 'Rosa', 'Amarillo'],
  air: ['Azul', 'Púrpura', 'Blanco Estelar', 'Gris Espacial'],
  pro: ['Negro Espacial', 'Plata'],
}
const IPADS = [
  ['iPad Mini 7', 'WiFi', '128GB', 3980000, IPAD_COLORS.mini],
  ['iPad Mini 7', 'WiFi', '256GB', 4700000, IPAD_COLORS.mini],
  ['iPad 11 (A16)', 'WiFi', '128GB', 3000000, IPAD_COLORS.base],
  ['iPad 11 (A16)', 'WiFi', '256GB', 3600000, IPAD_COLORS.base],
  ['iPad 11 (A16)', '5G', '128GB', 4250000, IPAD_COLORS.base],
  ['iPad Air M4 11"', 'WiFi', '128GB', 4950000, IPAD_COLORS.air],
  ['iPad Air M4 11"', '5G', '128GB', 5950000, IPAD_COLORS.air],
  ['iPad Air M4 13"', 'WiFi', '128GB', 6350000, IPAD_COLORS.air],
  ['iPad Air M4 13"', 'WiFi', '256GB', 7150000, IPAD_COLORS.air],
  ['iPad Air M4 13"', '5G', '128GB', 7450000, IPAD_COLORS.air],
  ['iPad Pro M4 11"', 'WiFi', '256GB', 7510000, IPAD_COLORS.pro],
  ['iPad Pro M4 11"', 'WiFi', '512GB', 9150000, IPAD_COLORS.pro],
  ['iPad Pro M4 11"', '5G', '256GB', 7990000, IPAD_COLORS.pro],
  ['iPad Pro M4 11"', '5G', '512GB', 9790000, IPAD_COLORS.pro],
  ['iPad Pro M4 13"', 'WiFi', '256GB', 7950000, IPAD_COLORS.pro],
  ['iPad Pro M4 13"', 'WiFi', '512GB', 9550000, IPAD_COLORS.pro],
  ['iPad Pro M4 13"', '5G', '256GB', 8600000, IPAD_COLORS.pro],
  ['iPad Pro M4 13"', '5G', '512GB', 10990000, IPAD_COLORS.pro],
  ['iPad Pro M5 11"', 'WiFi', '256GB', 8050000, IPAD_COLORS.pro],
  ['iPad Pro M5 11"', 'WiFi', '512GB', 9590000, IPAD_COLORS.pro],
  ['iPad Pro M5 11"', 'WiFi', '1TB', 11650000, IPAD_COLORS.pro],
  ['iPad Pro M5 11"', '5G', '256GB', 8410000, IPAD_COLORS.pro],
  ['iPad Pro M5 11"', '5G', '512GB', 9650000, IPAD_COLORS.pro],
  ['iPad Pro M5 13"', 'WiFi', '256GB', 9110000, IPAD_COLORS.pro],
  ['iPad Pro M5 13"', 'WiFi', '512GB', 10350000, IPAD_COLORS.pro],
  ['iPad Pro M5 13"', '5G', '256GB', 10190000, IPAD_COLORS.pro],
  ['iPad Pro M5 13"', '5G', '512GB', 11600000, IPAD_COLORS.pro],
]

// ── MacBooks: [nombre, precio, colores] ─────────────────────────────────────
const MAC_COLORS = {
  neo: ['Plata', 'Índigo', 'Blush', 'Citrus'],
  air: ['Cielo Azul', 'Plata', 'Blanco Estelar', 'Medianoche'],
  pro: ['Negro Espacial', 'Plata'],
}
const MACS = [
  // Los Neo conservan el formato del catálogo sembrado (color antes de la pulgada).
  ['MacBook Neo A18 Pro 8GB/256GB', 5050000, MAC_COLORS.neo, color => `MacBook Neo A18 Pro 8GB/256GB ${color} 13"`],
  ['MacBook Neo A18 Pro 8GB/512GB', 5790000, MAC_COLORS.neo, color => `MacBook Neo A18 Pro 8GB/512GB ${color} 13"`],
  ['MacBook Air M4 13" 24GB/1TB', 11390000, MAC_COLORS.air],
  ['MacBook Air M5 13" 16GB/512GB', 9560000, MAC_COLORS.air],
  ['MacBook Air M5 13" 16GB/1TB', 10200000, MAC_COLORS.air],
  ['MacBook Air M5 13" 24GB/1TB', 12570000, MAC_COLORS.air],
  ['MacBook Air M5 15" 16GB/512GB', 10230000, MAC_COLORS.air],
  ['MacBook Air M5 15" 16GB/1TB', 11950000, MAC_COLORS.air],
  ['MacBook Pro M4 14" 16GB/512GB', 11290000, MAC_COLORS.pro],
  ['MacBook Pro M4 Pro 14" 24GB/512GB', 13850000, MAC_COLORS.pro],
  ['MacBook Pro M4 Pro 14" 24GB/1TB', 15850000, MAC_COLORS.pro],
  ['MacBook Pro M5 14" 16GB/512GB', 12850000, MAC_COLORS.pro],
  ['MacBook Pro M5 14" 16GB/1TB', 13150000, MAC_COLORS.pro],
  ['MacBook Pro M5 14" 24GB/1TB', 14830000, MAC_COLORS.pro],
  ['MacBook Pro M5 Pro 16" 24GB/1TB', 21190000, MAC_COLORS.pro],
]

// ── Apple Watch y accesorios: [nombre, precio] (sin colores) ────────────────
const WATCHES = [
  ['Apple Watch SE 2024 44mm', 1450000],
  ['Apple Watch SE 2025 40mm', 1850000],
  ['Apple Watch SE 2025 44mm', 1950000],
  ['Apple Watch Series 11 42mm', 2400000],
  ['Apple Watch Series 11 46mm', 2580000],
  ['Apple Watch Ultra 2 49mm', 4510000],
  ['Apple Watch Ultra 3 49mm', 5150000],
]
const ACCESSORIES = [
  ['AirPods 4', 830000],
  ['AirPods 4 ANC', 1280000],
  ['AirPods Pro 3', 1550000],
  ['AirPods Max', 3350000],
  ['AirPods Max 2', 3690000],
  ['AirTag', 190000],
  ['AirTag Pack de 4', 550000],
  ['AirTag 2', 280000],
  ['AirTag 2 Pack de 4', 815000],
  ['Apple Pencil Pro', 820000],
  ['Apple Pencil 1ra Generación', 650000],
  ['Apple Pencil 2da Generación', 590000],
  ['Apple Pencil USB-C', 620000],
  ['Puntas para Apple Pencil (4 unidades)', 190000],
  ['Cable USB-C Original', 210000],
  ['Cable USB-C Certificado', 90000],
  ['Cable USB-A Certificado', 70000],
  ['Cable USB-C a C Original', 250000],
  ['Cable USB-C a C Certificado', 120000],
  ['Fuente 20W Original', 250000],
  ['Fuente 20W Certificado', 120000],
  ['Fuente 5W Original', 70000],
]

function catalog() {
  const products = []
  for (const [base, conexion, cap, precio, colors] of IPADS) {
    for (const color of colors) products.push({ name: `${base} ${conexion} ${cap} ${color}`, sku: `IPD-${slug(`${base} ${conexion} ${cap} ${color}`)}`, category: 'iPad', cond: 'NEW', price: precio })
  }
  for (const [base, precio, colors, formato] of MACS) {
    for (const color of colors) {
      const name = formato ? formato(color) : `${base} ${color}`
      products.push({ name, sku: `MAC-${slug(name)}`, category: 'Mac', cond: 'NEW', price: precio })
    }
  }
  for (const [name, precio] of WATCHES) products.push({ name, sku: `WTC-${slug(name)}`, category: 'Apple Watch', cond: 'NEW', price: precio })
  for (const [name, precio] of ACCESSORIES) products.push({ name, sku: `ACC-${slug(name)}`, category: 'Accesorios', cond: 'NEW', price: precio })
  return products
}

// Configuraciones que la tienda ya tiene con otro nombre (catálogo sembrado):
// no se re-insertan para no duplicar variantes. Se revisan a mano contra el
// reseed; si el negocio renombra, se ajusta esta lista.
const YA_EN_LA_TIENDA = [
  // Configuraciones que la tienda ya tiene (catálogo sembrado), con su nombre.
  'iPad 11th A16 WiFi 128GB Plata', 'iPad 11th A16 WiFi 128GB Azul',
  'iPad 11th A16 WiFi 256GB Plata', 'iPad 11th A16 WiFi 256GB Azul', 'iPad 11th A16 WiFi 256GB Rosa',
  'iPad mini A17 Pro 128GB Lila',
  'iPad Pro M4 11" 256GB Negro', 'iPad Pro M4 13" 256GB Negro',
  'iPad Pro M5 11" WiFi 256GB Space Black',
  'MacBook Air M5 16GB/512GB Midnight', 'MacBook Pro M5 14" 16GB/512GB Negro',
  'MacBook Neo A18 Pro 8GB/256GB Citrus 13"', 'MacBook Neo A18 Pro 8GB/256GB Indigo 13"',
  'MacBook Neo A18 Pro 8GB/256GB Blush 13"', 'MacBook Neo A18 Pro 8GB/512GB Indigo 13"',
  'Apple Watch SE 2025 40mm', 'Apple Watch SE 2025 44mm',
  'Apple Watch Series 11 42mm', 'Apple Watch Series 11 46mm', 'Apple Watch Ultra 2 49mm',
  'AirPods 4', 'AirPods 4 ANC', 'AirPods Pro 3', 'AirPods Max', 'AirTag', 'AirTag 2da Gen', 'AirTag 2',
  'Apple Pencil Pro', 'Apple Pencil 2da Generación', 'Apple Pencil USB-C', 'Cable USB-C',
]

// Configuraciones completas ya presentes (se omiten todos sus colores).
const CONFIGS_YA_EN_LA_TIENDA = [
  'iPad 11 (A16) WiFi 128GB', 'iPad 11 (A16) WiFi 256GB',
  'iPad Mini 7 WiFi 128GB',
  'iPad Pro M4 11" WiFi 256GB', 'iPad Pro M4 13" WiFi 256GB',
  'iPad Pro M5 11" WiFi 256GB',
  'MacBook Air M5 13" 16GB/512GB',
  'MacBook Pro M5 14" 16GB/512GB',
]

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const PRODUCTS = catalog().filter(product => {
  const name = normalize(product.name)
  if (YA_EN_LA_TIENDA.some(existing => normalize(existing) === name)) return false
  if (CONFIGS_YA_EN_LA_TIENDA.some(config => name.startsWith(normalize(config)))) return false
  return true
})
const RESEED_JSON = '/tmp/reseed-products.json'
const existing = new Set()
if (existsSync(RESEED_JSON)) {
  const rows = JSON.parse(readFileSync(RESEED_JSON, 'utf8'))
  for (const row of rows) existing.add(normalize(row.name))
}

const missing = PRODUCTS.filter(product => !existing.has(normalize(product.name)))

if (DIFF) {
  const byCategory = {}
  for (const product of missing) (byCategory[product.category] ||= []).push(product)
  for (const [category, rows] of Object.entries(byCategory)) {
    console.log(`\n=== ${category} (${rows.length}) ===`)
    for (const row of rows) console.log(`${row.name}  →  ${row.price}`)
  }
  console.log(`\nTotal del catálogo oficial: ${PRODUCTS.length} · faltantes: ${missing.length}`)
  process.exit(0)
}

const lines = missing.map(product => `  INSERT INTO "Product" ("id", "tenantId", "branchId", "sku", "name", "category", "condition", "pricePyg", "stock", "updatedAt") VALUES (${q(uuid5(product.sku))}, v_tenant_id, v_branch_id, ${q(product.sku)}, ${q(product.name)}, ${q(product.category)}, ${q(product.cond)}::"ProductCondition", ${product.price}, 0, now()) ON CONFLICT ("tenantId", "branchId", "sku") DO NOTHING;`).join('\n')

const sql = `-- Modelos que faltaban del catálogo iStore según la lista oficial del
-- 17-09-2026 (colores incluidos en iPads y MacBooks). No toca los iPhones ya
-- sembrados (7→18) ni el iPhone 18 base (aún sin lanzamiento). Idempotente:
-- ON CONFLICT por SKU, stock 0 (mercadería sin serie).
DO $$
DECLARE
  v_tenant_id TEXT;
  v_branch_id TEXT;
BEGIN
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE id = ${q(TARGET_TENANT_ID)} ORDER BY "createdAt" LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_branch_id FROM "Branch" WHERE "tenantId" = v_tenant_id AND "isActive" = true ORDER BY ((lower(name) LIKE '%asu%') OR (lower(name) LIKE '%asunc%')) DESC, "createdAt" LIMIT 1;
  IF v_branch_id IS NULL THEN RETURN; END IF;

${lines}
END $$;
`

const MIGRATION_DIR = join(ROOT, 'backend/prisma/migrations', OUTPUT_DIR)
mkdirSync(MIGRATION_DIR, { recursive: true })
writeFileSync(join(MIGRATION_DIR, 'migration.sql'), sql)
console.log(`Migración generada: backend/prisma/migrations/${OUTPUT_DIR}/migration.sql`)
console.log(`Productos: ${missing.length} de ${PRODUCTS.length} · tenant: ${TARGET_TENANT_ID}`)
