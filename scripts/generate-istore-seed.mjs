// Genera la migración SQL de catálogo y stock real de iStore Paraguay.
// Uso: node scripts/generate-istore-seed.mjs
// Escribe backend/prisma/migrations/20260916030000_istore_paraguay_real_stock/migration.sql
//
// Fuente: planilla de stock de Dario (16-09-2026). Estados:
//  - # / "Vendedor #" → VENDIDO (la nota conserva vendedor y número)
//  - nombre de vendedor sin # → RESERVADO (reservationCustomer = vendedor)
//  - lista de tránsito CDE→ASU → EN TRÁNSITO (se recibe con verificación física)
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION_DIR = join(ROOT, 'backend/prisma/migrations/20260916030000_istore_paraguay_real_stock')

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
const capLabel = cap => (cap === 1024 ? '1TB' : `${cap}GB`)

// ── Catálogo de iPhones 7 → 17 (no existe iPhone 18 todavía) ────────────────
const IPHONES = [
  { m: '7', colors: ['Negro', 'Plata', 'Oro', 'Oro Rosa', 'Rojo'], caps: [32, 128, 256], cond: ['USED'] },
  { m: '7 Plus', colors: ['Negro', 'Plata', 'Oro', 'Oro Rosa', 'Rojo'], caps: [32, 128, 256], cond: ['USED'] },
  { m: '8', colors: ['Gris Espacial', 'Plata', 'Oro', 'Rojo'], caps: [64, 256], cond: ['USED'] },
  { m: '8 Plus', colors: ['Gris Espacial', 'Plata', 'Oro', 'Rojo'], caps: [64, 256], cond: ['USED'] },
  { m: 'X', colors: ['Gris Espacial', 'Plata'], caps: [64, 256], cond: ['USED'] },
  { m: 'XR', colors: ['Negro', 'Blanco', 'Azul', 'Amarillo', 'Coral', 'Rojo'], caps: [64, 128, 256], cond: ['USED'] },
  { m: 'XS', colors: ['Gris Espacial', 'Plata', 'Oro'], caps: [64, 256, 512], cond: ['USED'] },
  { m: 'XS Max', colors: ['Gris Espacial', 'Plata', 'Oro'], caps: [64, 256, 512], cond: ['USED'] },
  { m: '11', colors: ['Negro', 'Blanco', 'Verde', 'Amarillo', 'Lila', 'Rojo'], caps: [64, 128, 256], cond: ['USED'] },
  { m: '11 Pro', colors: ['Gris Espacial', 'Plata', 'Oro', 'Verde Noche'], caps: [64, 256, 512], cond: ['USED'] },
  { m: '11 Pro Max', colors: ['Gris Espacial', 'Plata', 'Oro', 'Verde Noche'], caps: [64, 256, 512], cond: ['USED'] },
  { m: 'SE 2020', colors: ['Negro', 'Blanco', 'Rojo'], caps: [64, 128, 256], cond: ['USED'] },
  { m: '12 mini', colors: ['Negro', 'Blanco', 'Azul', 'Verde', 'Lila', 'Rojo'], caps: [64, 128, 256], cond: ['USED'] },
  { m: '12', colors: ['Negro', 'Blanco', 'Azul', 'Verde', 'Lila', 'Rojo'], caps: [64, 128, 256], cond: ['USED', 'NEW'] },
  { m: '12 Pro', colors: ['Grafito', 'Plata', 'Oro', 'Azul Pacífico'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '12 Pro Max', colors: ['Grafito', 'Plata', 'Oro', 'Azul Pacífico'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '13 mini', colors: ['Rosa', 'Azul', 'Medianoche', 'Estelar', 'Verde'], caps: [128, 256, 512], cond: ['USED'] },
  { m: '13', colors: ['Rosa', 'Azul', 'Medianoche', 'Estelar', 'Verde', 'Rojo'], caps: [128, 256, 512], cond: ['USED'] },
  { m: '13 Pro', colors: ['Grafito', 'Plata', 'Oro', 'Azul Sierra', 'Verde Alpino'], caps: [128, 256, 512, 1024], cond: ['USED'] },
  { m: '13 Pro Max', colors: ['Grafito', 'Plata', 'Oro', 'Azul Sierra', 'Verde Alpino'], caps: [128, 256, 512, 1024], cond: ['USED'] },
  { m: 'SE 2022', colors: ['Medianoche', 'Estelar', 'Rojo'], caps: [64, 128, 256], cond: ['USED'] },
  { m: '14', colors: ['Azul', 'Lila', 'Medianoche', 'Estelar', 'Amarillo', 'Rojo'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '14 Plus', colors: ['Azul', 'Lila', 'Medianoche', 'Estelar', 'Amarillo', 'Rojo'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '14 Pro', colors: ['Negro Espacial', 'Plata', 'Oro', 'Lila Oscuro'], caps: [128, 256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '14 Pro Max', colors: ['Negro Espacial', 'Plata', 'Oro', 'Lila Oscuro'], caps: [128, 256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '15', colors: ['Azul', 'Rosa', 'Amarillo', 'Verde', 'Negro'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '15 Plus', colors: ['Azul', 'Rosa', 'Amarillo', 'Verde', 'Negro'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '15 Pro', colors: ['Titanio Natural', 'Titanio Azul', 'Titanio Blanco', 'Titanio Negro'], caps: [128, 256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '15 Pro Max', colors: ['Titanio Natural', 'Titanio Azul', 'Titanio Blanco', 'Titanio Negro'], caps: [256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '16', colors: ['Azul Ultramar', 'Teal', 'Rosa', 'Blanco', 'Negro'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '16 Plus', colors: ['Azul Ultramar', 'Teal', 'Rosa', 'Blanco', 'Negro'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '16e', colors: ['Blanco', 'Negro'], caps: [128, 256, 512], cond: ['USED', 'NEW'] },
  { m: '16 Pro', colors: ['Desierto', 'Natural', 'Blanco', 'Negro'], caps: [128, 256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '16 Pro Max', colors: ['Desierto', 'Natural', 'Blanco', 'Negro'], caps: [256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '17', colors: ['Azul', 'Lila', 'Sage', 'Blanco', 'Negro'], caps: [256, 512], cond: ['USED', 'NEW'] },
  { m: '17 Air', colors: ['Azul', 'Blanco', 'Negro', 'Plata'], caps: [256, 512], cond: ['NEW'] },
  { m: '17 Pro', colors: ['Plata', 'Grafito', 'Azul', 'Negro'], caps: [256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '17 Pro Max', colors: ['Plata', 'Azul', 'Naranja', 'Grafito', 'Negro'], caps: [256, 512, 1024], cond: ['USED', 'NEW'] },
  { m: '17e', colors: ['Blanco', 'Negro'], caps: [128, 256, 512], cond: ['NEW'] },
]

// ── Catálogo de accesorios, iPad, Watch y Mac ───────────────────────────────
// stock > 0 = mercadería sin serie (no serializada); los serializados entran por unidades.
const ACCESORIOS = [
  ['EarPods C', 10, 22], ['EarPods Lightning', 3, 19.5], ['Cable Watch', 2, 15],
  ['AirPods 2', 0, null], ['AirPods 3', 0, null], ['AirPods Pro', 0, null], ['AirPods Pro 2', 0, null], ['AirPods Pro 3', 0, null],
  ['AirPods 4', 3, null], ['AirPods 4 ANC', 2, null], ['AirPods Max', 0, null], ['AirPods Max USB-C', 1, null],
  ['AirTag', 4, null], ['Cargador 20W USB-C', 5, null], ['Cargador 30W USB-C', 2, null], ['Cargador MagSafe', 1, null],
  ['Cable USB-C a Lightning', 4, null], ['Cable USB-C', 3, null], ['Apple Pencil USB-C', 1, null], ['Apple Pencil Pro', 1, null],
  ['Apple Pencil 2da Generación', 0, null], ['Magic Keyboard M5 11"', 0, null], ['Magic Keyboard M5 13"', 1, null],
  ['Magic Keyboard Folio iPad 10', 0, null], ['Magic Trackpad', 0, null], ['Magic Mouse', 1, null],
].map(([name, stock, costUsd]) => ({ name, sku: `ACC-${slug(name)}`, category: 'Accesorios', cond: 'NEW', stock, costUsd }))

const IPADS = [
  ['iPad 10th gen WiFi 64GB Plata', 0], ['iPad 10th gen WiFi 256GB Plata', 0],
  ['iPad 11th A16 WiFi 128GB Plata', 0], ['iPad 11th A16 WiFi 128GB Azul', 1], ['iPad 11th A16 WiFi 256GB Plata', 1],
  ['iPad Air M3 11" 128GB Azul', 2], ['iPad Air M3 11" 256GB Plata', 1], ['iPad Air M3 13" 256GB Plata', 1],
  ['iPad Pro M4 11" 256GB Negro', 1], ['iPad Pro M4 13" 256GB Negro', 1], ['iPad mini A17 Pro 128GB Lila', 2],
].map(([name, stock]) => ({ name, sku: `IPD-${slug(name)}`, category: 'iPad', cond: 'NEW', stock, costUsd: null }))

const WATCHES = [
  ['Apple Watch SE 2022 40mm', 0], ['Apple Watch SE 2022 44mm', 0], ['Apple Watch SE 2025 40mm', 2], ['Apple Watch SE 2025 44mm', 2],
  ['Apple Watch Series 9 41mm', 0], ['Apple Watch Series 9 45mm', 0], ['Apple Watch Series 10 42mm', 1], ['Apple Watch Series 10 46mm', 1],
  ['Apple Watch Series 11 42mm', 2], ['Apple Watch Series 11 46mm', 2],
  ['Apple Watch Ultra 2 49mm Natural', 0], ['Apple Watch Ultra 2 49mm Negro', 1],
].map(([name, stock]) => ({ name, sku: `WTC-${slug(name)}`, category: 'Apple Watch', cond: 'NEW', stock, costUsd: null }))

const MACS = [
  ['MacBook Air 13" M2 256GB', 0], ['MacBook Air 13" M3 256GB', 0], ['MacBook Air 15" M3 256GB', 0],
  ['MacBook Air 13" M4 256GB', 2], ['MacBook Air 15" M4 256GB', 1], ['MacBook Pro 14" M4 Pro 512GB', 1], ['MacBook Pro 16" M4 Max 1TB', 0],
  ['iMac 24" M4', 1], ['Mac mini M4 256GB', 2], ['Mac mini M4 Pro 512GB', 0], ['Mac Studio M4 Max', 0], ['Mac Pro M2', 0],
].map(([name, stock]) => ({ name, sku: `MAC-${slug(name)}`, category: 'Mac', cond: 'NEW', stock, costUsd: null }))

const PHONE_PRODUCTS = []
for (const model of IPHONES) {
  for (const cond of model.cond) {
    for (const color of model.colors) {
      for (const cap of model.caps) {
        PHONE_PRODUCTS.push({
          name: `iPhone ${model.m} ${capLabel(cap)} ${color}`,
          sku: `IPH-${slug(model.m)}-${cap === 1024 ? '1TB' : `${cap}GB`}-${slug(color)}-${cond}`,
          category: 'Celulares', cond, stock: 0, costUsd: null,
        })
      }
    }
  }
}
// Variante seminueva del Ultra 2 (la unidad de la planilla de semis).
WATCHES.push({ name: 'Apple Watch Ultra 2 49mm Natural', sku: 'WTC-APPLEWATCHULTRA249MMNATURAL-USED', category: 'Apple Watch', cond: 'USED', stock: 0, costUsd: null })

const PRODUCTS = [...PHONE_PRODUCTS, ...ACCESORIOS, ...IPADS, ...WATCHES, ...MACS]
const SKU_INDEX = new Map(PRODUCTS.map(product => [product.sku, product]))

// ── Stock real: unidades serializadas ───────────────────────────────────────
// [modelo|accesorio, color, cap, cond, fechaVerificación|null, serial, proveedor, costoUsd, batería, códigoVerif|null, notas, estado, vendedorReserva]
const UNITS = [
  // ── Semi nuevos ──
  ['13', 'Azul', 128, 'USED', '2026-09-01', '358110348557633', 'MIAMI', 320, 87, 'VPC', '', 'available'],
  ['13', 'Negro', 128, 'USED', '2026-09-08', '354349817961769', 'PDP', null, 100, 'VPM', 'Batería nueva', 'available'],
  ['13', 'Negro', 256, 'USED', '2026-09-05', '352941880936702', 'PDP', 335, 100, 'VPE', 'MATEO #31835', 'sold'],
  ['13', 'Blanco', 128, 'USED', '2026-09-11', '351509526775973', 'PDP', 330, 84, 'VPE', '', 'available'],
  ['13 Pro', 'Azul Sierra', 256, 'USED', '2026-09-03', '356942287694601', 'MIAMI', 430, 100, 'VPM', 'JADI #31836', 'sold'],
  ['13 Pro', 'Azul Sierra', 256, 'USED', '2026-09-02', '356144894699848', 'MIAMI', 430, 100, 'VPS', '', 'available'],
  ['13 Pro', 'Azul Sierra', 256, 'USED', '2026-09-02', '353742330249699', 'MIAMI', 430, 100, 'VPS', '', 'available'],
  ['13 Pro', 'Azul Sierra', 256, 'USED', '2026-09-02', '359339131244831', 'MIAMI', 430, 100, 'VPS', 'Lica señal', 'available'],
  ['13 Pro', 'Negro', 256, 'USED', '2026-09-02', '353742333936714', 'MIAMI', 430, 100, 'VPS', '', 'available'],
  ['14', 'Lila', 128, 'USED', '2026-09-01', '352013406872280', 'MIAMI', 313, 84, 'VPC', '', 'available'],
  ['14', 'Rojo', 128, 'USED', '2026-09-01', '354807374920031', 'MIAMI', 320, 100, 'VPC', 'Batería nueva', 'available'],
  ['14', 'Lila', 128, 'USED', '2026-09-02', '350928999006743', 'MIAMI', 325, 85, 'VPS', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-02', '350352933841042', 'MIAMI', 325, 88, 'VPS', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-02', '359003856143772', 'MIAMI', 325, 83, 'VPS', '', 'available'],
  ['14', 'Blanco', 128, 'USED', '2026-09-04', '359695609855873', 'MIAMI', 325, 100, 'VPE', 'Batería nueva', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-02', '359843528986441', 'MIAMI', 325, 87, 'VPS', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-02', '351592242608710', 'MIAMI', 325, 86, 'VPS', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-02', '350352935040577', 'MIAMI', 325, 89, 'VPS', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-09', '353557672330166', 'MIAMI', 310, 82, 'VPC', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-09', '351929294968107', 'MIAMI', 310, 90, 'VPC', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-09', '352013400583735', 'MIAMI', 310, 82, 'VPC', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-09', '351592245504569', 'MIAMI', 310, 87, 'VPC', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-09', '359014538753532', 'MIAMI', 310, 86, 'VPC', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-09', '353555374164321', 'MIAMI', 310, 82, 'VPC', '', 'available'],
  ['14', 'Azul', 128, 'USED', '2026-09-09', '352013403252494', 'MIAMI', 310, 84, 'VPC', '', 'available'],
  ['14', 'Negro', 128, 'USED', '2026-09-09', '356165444210380', 'MIAMI', 310, 81, 'VPC', '', 'available'],
  ['14', 'Blanco', 256, 'USED', '2026-09-12', '353092220272983', 'PDP', 300, 85, 'VPE', '', 'available'],
  ['14 Pro', 'Negro', 128, 'USED', '2026-09-04', '353294706402692', 'PDP', 450, 92, 'VPE', '', 'available'],
  ['14 Pro', 'Lila Oscuro', 128, 'USED', '2026-09-01', '352130219685111', 'MIAMI', 458, 80, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 128, 'USED', '2026-08-27', '352228707422342', 'MIAMI', 445, 100, 'VPC', 'Batería nueva', 'available'],
  ['14 Pro', 'Plata', 256, 'USED', '2026-09-02', '358790736845300', 'MIAMI', 475, 90, 'VPS', '', 'available'],
  ['14 Pro', 'Plata', 256, 'USED', '2026-09-02', '353664575205832', 'MIAMI', 475, 89, 'VPS', '', 'available'],
  ['14 Pro', 'Lila Oscuro', 256, 'USED', '2026-09-02', '358790730114927', 'MIAMI', 475, 88, 'VPS', 'P.O', 'reserved', 'Edgar'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '351284085061039', 'MIAMI', 460, 82, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '353429716092063', 'MIAMI', 460, 87, 'VPC', '#31838', 'sold'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '351284085159064', 'MIAMI', 460, 85, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '354672345495772', 'MIAMI', 460, 83, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '354183138520982', 'MIAMI', 460, 88, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '351284081588720', 'MIAMI', 460, 83, 'VPC', '', 'available'],
  ['14 Pro', 'Negro', 256, 'USED', '2026-09-09', '350308310561785', 'MIAMI', 460, 84, 'VPC', '', 'available'],
  ['15', 'Amarillo', 128, 'USED', '2026-09-04', '353177646551134', 'MIAMI', 425, 100, 'VPE', '', 'available'],
  ['15', 'Verde', 128, 'USED', '2026-09-04', '353887197145090', 'MIAMI', 425, 100, 'VPE', '#31839 EDGAR', 'sold'],
  ['15', 'Verde', 128, 'USED', '2026-09-01', '353992311652201', 'MIAMI', 425, 100, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '357004280081887', 'MIAMI', 420, 85, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '351048874532074', 'MIAMI', 420, 88, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '358668285318459', 'MIAMI', 420, 88, 'VPC', '', 'reserved', 'phonetech'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '350448885157963', 'MIAMI', 420, 89, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '357292745619751', 'MIAMI', 420, 86, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '351698478944610', 'MIAMI', 420, 91, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '356562916063398', 'MIAMI', 420, 80, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '354553492365986', 'MIAMI', 420, 83, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '354029283479682', 'MIAMI', 420, 87, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '357981365970003', 'MIAMI', 420, 94, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '350390278392189', 'MIAMI', 420, 87, 'VPC', '', 'available'],
  ['15', 'Negro', 128, 'USED', '2026-09-09', '356321254423437', 'MIAMI', 420, 89, 'VPC', '', 'available'],
  ['15', 'Azul', 128, 'USED', '2026-09-09', '352156543747509', 'MIAMI', 420, 84, 'VPC', '', 'available'],
  ['15', 'Azul', 128, 'USED', '2026-09-09', '356562917352030', 'MIAMI', 420, 88, 'VPC', '', 'available'],
  ['15', 'Verde', 128, 'USED', '2026-09-09', '350390273537416', 'MIAMI', 420, 85, 'VPC', '', 'available'],
  ['15 Pro', 'Negro', 128, 'USED', '2026-09-01', '358348182229147', 'MIAMI', 555, 86, 'VPC', '', 'available'],
  ['15 Pro', 'Negro', 128, 'USED', '2026-09-01', '354300582290835', 'MIAMI', 555, 81, 'VPC', '', 'available'],
  ['15 Pro', 'Negro', 128, 'USED', '2026-09-09', '355473497966945', 'MIAMI', 555, 86, 'VPC', '', 'available'],
  ['15 Pro', 'Negro', 128, 'USED', '2026-09-09', '358348184749449', 'MIAMI', 540, 82, 'VPC', '', 'available'],
  ['15 Pro', 'Azul', 128, 'USED', '2026-09-09', '353629306854133', 'MIAMI', 540, 83, 'VPC', '', 'available'],
  ['15 Pro', 'Azul', 128, 'USED', '2026-09-09', '352772254904392', 'MIAMI', 540, 87, 'VPC', '', 'available'],
  ['15 Pro', 'Negro', 128, 'USED', '2026-09-09', '352400475500811', 'MIAMI', 540, 85, 'VPC', '', 'available'],
  ['15 Pro', 'Azul', 256, 'USED', '2026-09-09', '353431655062990', 'MIAMI', 555, 85, 'VPC', 'JADI #31837', 'sold'],
  ['15 Pro', 'Azul', 256, 'USED', '2026-09-09', '354300588034468', 'MIAMI', 555, 90, 'VPC', '#31811 klau', 'sold'],
  ['15 Pro', 'Azul', 256, 'USED', '2026-09-09', '354070965254662', 'MIAMI', 555, 88, 'VPC', 'JADI #31837', 'sold'],
  ['15 Pro Max', 'Azul', 256, 'USED', '2026-09-01', '354058241357292', 'MIAMI', 705, 100, 'VPC', 'Batería nueva', 'available'],
  ['15 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '354379779193242', 'MIAMI', 655, 83, 'VPC', '', 'available'],
  ['15 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '359711539895937', 'MIAMI', 660, 83, 'VPC', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '351646278518027', 'MIAMI', 665, 85, 'VPS', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-05', '358606715748689', 'MIAMI', 665, 100, 'VPE', 'Batería nueva', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '352310725205394', 'MIAMI', 665, 84, 'VPS', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '351306993563770', 'MIAMI', 665, 83, 'VPS', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '355430971369111', 'MIAMI', 665, 83, 'VPS', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '351503405497999', 'MIAMI', 665, 85, 'VPS', '', 'available'],
  ['15 Pro Max', 'Plata', 256, 'USED', '2026-09-02', '354379770021434', 'MIAMI', 665, 84, 'VPS', '', 'available'],
  ['15 Pro Max', 'Negro', 512, 'USED', '2026-09-01', '354379773935028', 'MIAMI', 680, 83, 'VPC', '', 'available'],
  ['16', 'Azul', 128, 'USED', '2026-09-01', '352958413789754', 'PDP', 615, 90, 'VPC', '', 'available'],
  ['16', 'Teal', 128, 'USED', '2026-09-01', '356140776460879', 'MIAMI', 585, 98, 'VPC', 'klau #31823', 'sold'],
  ['16', 'Teal', 128, 'USED', '2026-09-01', '359696880887718', 'MIAMI', 585, 99, 'VPC', '', 'available'],
  ['16', 'Teal', 128, 'USED', '2026-09-01', '359954318105041', 'MIAMI', 585, 100, 'VPC', '', 'reserved', 'edgar'],
  ['16', 'Rosa', 128, 'USED', '2026-09-09', '352404325247185', 'MIAMI', 540, 95, 'VPC', '', 'available'],
  ['16', 'Blanco', 128, 'USED', '2026-09-11', '351288156287662', 'TEL', 500, 100, 'VPS', '', 'available'],
  ['16e', 'Negro', 128, 'USED', '2026-09-09', '350304978232868', 'MIAMI', 370, 100, 'VPC', 'klau #31816', 'sold'],
  ['16e', 'Negro', 128, 'USED', '2026-09-09', '354566766196051', 'MIAMI', 370, 96, 'VPC', '', 'available'],
  ['16e', 'Negro', 128, 'USED', '2026-09-09', '351811693839073', 'MIAMI', 370, 100, 'VPC', '', 'available'],
  ['16e', 'Negro', 128, 'USED', '2026-09-09', '351418496874743', 'MIAMI', 370, 100, 'VPC', 'klau #31816', 'sold'],
  ['16e', 'Negro', 128, 'USED', '2026-09-09', '351811698316986', 'MIAMI', 370, 100, 'VPC', '', 'reserved', 'phonetech'],
  ['16 Pro', 'Desierto', 128, 'USED', '2026-09-01', '352703944072886', 'MIAMI', 700, 91, 'VPC', '', 'available'],
  ['16 Pro', 'Desierto', 128, 'USED', '2026-09-01', '359072841628510', 'TEL', 610, 92, 'VPC', '', 'available'],
  ['16 Pro', 'Natural', 128, 'USED', '2026-09-01', '357017256428403', 'MIAMI', 695, 100, 'VPC', '', 'reserved', 'phonetech'],
  ['16 Pro', 'Natural', 128, 'USED', '2026-09-01', '358282728900798', 'MIAMI', 695, 100, 'VPC', '', 'available'],
  ['16 Pro', 'Natural', 256, 'USED', '2026-09-01', '354359260956315', 'MIAMI', 740, 98, 'VPC', 'P.O', 'available'],
  ['16 Pro', 'Blanco', 256, 'USED', '2026-09-01', '353357350457971', 'MIAMI', 740, 90, 'VPC', 'P.O', 'available'],
  ['16 Pro', 'Desierto', 256, 'USED', '2026-09-09', '354359268459288', 'MIAMI', 740, 90, 'VPC', '', 'available'],
  ['16 Pro', 'Desierto', 256, 'USED', '2026-09-09', '359952659422454', 'MIAMI', 740, 89, 'VPC', '', 'available'],
  ['16 Pro', 'Blanco', 256, 'USED', '2026-09-09', '355964948184880', 'MIAMI', 740, 91, 'VPC', '', 'available'],
  ['16 Pro', 'Desierto', 256, 'USED', '2026-09-11', '351895497050292', 'HH', 770, 100, 'VPS', '', 'available'],
  ['16 Pro', 'Blanco', 512, 'USED', '2026-09-01', '358906607724073', 'MIAMI', 760, 89, 'VPC', '', 'available'],
  ['16 Pro', 'Blanco', 1024, 'USED', '2026-09-01', '359072842605210', 'MIAMI', 770, 92, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '350773435414881', 'MIAMI', 860, 100, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '358862986594936', 'MIAMI', 835, 100, 'VPC', 'FINANCIACION #31828', 'sold'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '358637620017936', 'MIAMI', 835, 93, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '354423236877060', 'MIAMI', 835, 99, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '356308868010080', 'MIAMI', 835, 98, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 256, 'USED', '2026-09-01', '356541628993530', 'MIAMI', 835, 98, 'VPC', '', 'available'],
  ['16 Pro Max', 'Plata', 256, 'USED', '2026-09-01', '359906322406765', 'MIAMI', 834, 88, 'VPC', '', 'available'],
  ['16 Pro Max', 'Natural', 256, 'USED', '2026-09-01', '356541622524976', 'MIAMI', 860, 88, 'VPC', '', 'available'],
  ['16 Pro Max', 'Desierto', 256, 'USED', '2026-09-01', '355067542253471', 'MIAMI', 860, 88, 'VPC', 'P.O', 'available'],
  ['16 Pro Max', 'Negro', 512, 'USED', '2026-09-01', '350773436521973', 'MIAMI', 865, 100, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 512, 'USED', '2026-09-01', '352641352446822', 'MIAMI', 865, 91, 'VPC', '', 'available'],
  ['16 Pro Max', 'Negro', 512, 'USED', '2026-09-01', '352356355195223', 'MIAMI', 865, 91, 'VPE', '', 'available'],
  ['17', 'Lila', 256, 'USED', '2026-09-01', '357208788122388', 'MIAMI', 715, 100, 'VPC', 'Garantía diciembre 2026', 'available'],
  ['17', 'Azul', 256, 'USED', '2026-09-01', '354666653967711', 'MIAMI', 715, 100, 'VPC', '', 'reserved', 'phonetech'],
  ['17', 'Azul', 256, 'USED', '2026-09-01', '354666658471222', 'MIAMI', 715, 100, 'VPC', 'Garantía diciembre 2026', 'available'],
  ['17', 'Sage', 256, 'USED', '2026-09-01', '353502583875263', 'MIAMI', 715, 100, 'VPC', 'Garantía enero 2027', 'available'],
  ['17', 'Azul', 256, 'USED', '2026-09-01', '356484798487076', 'MIAMI', 715, 100, 'VPC', 'Garantía abril 2027', 'available'],
  ['17', 'Lila', 256, 'USED', '2026-09-01', '357208780373187', 'MIAMI', 715, 92, 'VPC', 'Garantía octubre 2026', 'available'],
  ['17', 'Azul', 256, 'USED', '2026-09-09', '350938242307509', 'MIAMI', 750, 100, 'VPC', '8 ciclos', 'available'],
  ['17', 'Lila', 256, 'USED', '2026-09-09', '359334850085465', 'MIAMI', 750, 100, 'VPC', '71 ciclos', 'available'],
  ['17 Pro Max', 'Azul', 256, 'USED', '2026-09-01', '354017320001262', 'MIAMI', 1240, 100, 'VPC', 'Garantía octubre', 'available'],
  ['17 Pro Max', 'Naranja', 256, 'USED', '2026-09-01', '358482495391177', 'MIAMI', 1125, 100, 'VPC', '0 ciclos · Garantía noviembre 2026', 'available'],
  ['17 Pro Max', 'Naranja', 256, 'USED', '2026-09-01', '353837417777875', 'MIAMI', 1125, 100, 'VPC', '0 ciclos · Garantía enero 2027', 'available'],
  ['17 Pro Max', 'Naranja', 256, 'USED', '2026-09-01', '359614543668631', 'MIAMI', 1125, 100, 'VPC', '12 ciclos · Garantía diciembre 2026', 'available'],
  ['17 Pro Max', 'Naranja', 256, 'USED', '2026-09-01', '359614543779123', 'MIAMI', 1125, 100, 'VPC', '9 ciclos · Garantía diciembre 2026', 'available'],
  ['17 Pro Max', 'Naranja', 256, 'USED', '2026-09-01', '350889865630471', 'MIAMI', 1125, 100, 'VPC', '3 ciclos · Garantía enero 2027', 'available'],
  ['17 Pro Max', 'Plata', 256, 'USED', '2026-09-09', '353837418653059', 'MIAMI', 1095, 100, 'VPC', '60 ciclos · klau #31800', 'sold'],
  ['17 Pro Max', 'Azul', 512, 'USED', '2026-09-01', '359426262624517', 'MIAMI', 1295, 100, 'VPC', '#31822 MATEO', 'sold'],
  ['17 Pro Max', 'Azul', 512, 'USED', '2026-09-01', '359426262616018', 'MIAMI', 1295, 100, 'VPC', 'Garantía octubre 2026', 'available'],
  ['17 Pro Max', 'Azul', 512, 'USED', '2026-09-01', '358419944022466', 'MIAMI', 1295, 100, 'VPC', '', 'reserved', 'phonetech'],
  // ── Nuevos ──
  ['16', 'Blanco', 128, 'NEW', '2026-09-07', '351872708891426', 'ALB', 740, 100, 'VPM', 'HN', 'available'],
  ['17', 'Blanco', 256, 'NEW', '2026-09-15', '352626661035382', 'MEL', 960, 100, 'VPC', 'HN', 'transit'],
  ['17', 'Negro', 256, 'NEW', '2026-09-15', '352000931737203', 'MEL', 960, 100, 'VPC', 'HN', 'transit'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-15', '354723574346440', 'HH', 1200, 100, 'VPC', '#31840', 'sold'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-15', '354723570683952', 'HH', 1200, 100, 'VPC', '', 'transit'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-15', '358533763514161', 'HH', 1200, 100, 'VPC', '', 'transit'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-15', '354723574170147', 'HH', 1200, 100, 'VPC', '', 'transit'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-14', '350546892047851', 'HH', 1190, 100, 'VPM', '', 'available'],
  ['17 Pro', 'Plata', 256, 'NEW', '2026-09-14', '350546891651901', 'HH', 1190, 100, 'VPM', '', 'available'],
  ['17 Pro', 'Plata', 512, 'NEW', '2026-09-04', '359917396304026', 'HH', 1365, 100, 'VPS', 'LL', 'available'],
  ['17 Pro Max', 'Plata', 256, 'NEW', '2026-09-09', '355056792351952', 'HH', 1245, 100, 'VPC', 'LL', 'available'],
  ['17 Pro Max', 'Plata', 256, 'NEW', '2026-09-09', '357134817067099', 'HH', 1245, 100, 'VPC', 'LL', 'reserved', 'Edgar'],
  ['17 Pro Max', 'Azul', 256, 'NEW', '2026-09-01', '356090354530165', 'HH', 1255, 100, 'VPC', 'LL', 'available'],
  ['17 Pro Max', 'Azul', 256, 'NEW', '2026-09-03', '355599588231573', 'HH', 1230, 100, 'VPM', 'LL', 'available'],
  ['17 Pro Max', 'Plata', 256, 'NEW', '2026-09-03', '358015864889775', 'HH', 1245, 100, 'VPM', 'FINANCIACION #31834', 'sold'],
  ['17 Pro Max', 'Azul', 256, 'NEW', '2026-09-07', '355599586950422', null, null, 100, 'VPC', 'LL', 'available'],
  ['17 Pro Max', 'Plata', 512, 'NEW', '2026-09-09', '358015866854082', 'MEL', 1515, 100, 'VPC', 'FINANCIACION #31801', 'sold'],
  // ── En tránsito CDE → ASU (14/09/2026) ──
  ['17', 'Azul', 256, 'NEW', null, '352760499466004', 'SB', 905, null, null, 'HN', 'transit'],
  ['17 Pro', 'Plata', 256, 'NEW', null, '358387203947162', 'HH', 1200, null, null, 'PEDIDO INARA', 'sold'],
  ['14', 'Azul', 128, 'USED', null, '352604721755976', 'HH', 325, 100, null, 'PEDIDO INARA', 'sold'],
]

// Accesorios serializados (producto de catálogo + unidades).
const SERIALIZED = [
  { name: 'AirPods Pro 3', serial: 'SD6Y17RKQ70', prov: 'SB', cost: 215, date: '2026-09-10', ver: 'VPC' },
  { name: 'AirPods Pro 3', serial: 'SGKWM75LWFY', prov: 'SB', cost: 215, date: '2026-09-10', ver: 'VPC' },
  { name: 'Apple Pencil 2da Generación', serial: 'SHJVJFST9JKM9', prov: 'ZM', cost: 72, date: '2026-09-01', ver: 'VPC' },
  { name: 'iPad 11th A16 WiFi 128GB Plata', serial: 'SG7VQYGJK7W', prov: 'SB', cost: 440, date: '2026-09-04', ver: 'VPS' },
  { name: 'iPad 11th A16 WiFi 128GB Plata', serial: 'SFWMHHX92KJ', prov: 'SB', cost: 440, date: '2026-09-04', ver: 'VPS', state: 'reserved', by: 'klauu' },
  { name: 'Magic Keyboard M5 11"', serial: 'SP774P6WNY4', prov: 'MG', cost: 330, date: '2026-09-14', ver: null, state: 'sold', notes: 'PEDIDO JADI' },
  { name: 'Apple Watch Ultra 2 49mm Natural', serial: 'J6DXVY2904', prov: 'MIAMI', cost: null, date: '2026-08-27', ver: 'VPS', cond: 'USED' },
]

// ── Proveedores (abreviatura visible; nombre real lo completa administración) ─
const SUPPLIERS = [...new Set([...UNITS.map(unit => unit[6]), ...SERIALIZED.map(item => item.prov)].filter(Boolean))].map(code => ({ code, name: code }))

// ── Validaciones antes de generar ───────────────────────────────────────────
// Los nombres de color de la planilla se normalizan al color del catálogo.
const COLOR_ALIAS = {
  '13': { Negro: 'Medianoche', Blanco: 'Estelar' },
  '14': { Negro: 'Medianoche', Blanco: 'Estelar' },
  '13 Pro': { Azul: 'Azul Sierra', Negro: 'Grafito' },
  '13 Pro Max': { Azul: 'Azul Sierra', Negro: 'Grafito' },
  '14 Pro': { Negro: 'Negro Espacial' },
  '14 Pro Max': { Negro: 'Negro Espacial' },
  '15 Pro': { Negro: 'Titanio Negro', Azul: 'Titanio Azul' },
  '15 Pro Max': { Negro: 'Titanio Negro', Azul: 'Titanio Azul', Plata: 'Titanio Blanco' },
  '16': { Azul: 'Azul Ultramar' },
  '16 Plus': { Azul: 'Azul Ultramar' },
  '16 Pro': { Plata: 'Blanco' },
  '16 Pro Max': { Plata: 'Blanco' },
}
const unitColor = (m, color) => COLOR_ALIAS[m]?.[color] || color
const unitSku = (m, color, cap, cond) => `IPH-${slug(m)}-${cap === 1024 ? '1TB' : `${cap}GB`}-${slug(unitColor(m, color))}-${cond}`
const serials = new Set()
for (const [m, color, cap, cond, , serial] of UNITS) {
  const sku = unitSku(m, color, cap, cond)
  if (!SKU_INDEX.has(sku)) throw new Error(`Falta producto de catálogo para unidad: ${sku}`)
  if (serials.has(serial)) throw new Error(`IMEI duplicado en datos: ${serial}`)
  serials.add(serial)
}
for (const item of SERIALIZED) {
  const sku = item.cond === 'USED' ? 'WTC-APPLEWATCHULTRA249MMNATURAL-USED' : `ACC-${slug(item.name)}` || `IPD-${slug(item.name)}`
  const candidates = [sku, `ACC-${slug(item.name)}`, `IPD-${slug(item.name)}`, 'WTC-APPLEWATCHULTRA249MMNATURAL-USED'].filter(key => SKU_INDEX.has(key))
  if (!candidates.length) throw new Error(`Falta producto de catálogo para accesorio: ${item.name}`)
  item.sku = candidates[0]
  if (serials.has(item.serial)) throw new Error(`Serial duplicado en datos: ${item.serial}`)
  serials.add(item.serial)
}

// ── Generación SQL ──────────────────────────────────────────────────────────
const lines = []
lines.push('-- Catálogo y stock real de iStore Paraguay (fuente: planilla de Dario, 16-09-2026).')
lines.push('-- Aplica solo si existe el tenant (email dariodeoli@gmail.com o nombre iStore/iPhone Store);')
lines.push('-- es idempotente y no toca datos de otras empresas. Los IMEI/seriales quedan por tenant.')
lines.push('')
lines.push('DO $$')
lines.push('DECLARE')
lines.push('  v_tenant_id TEXT;')
lines.push('  v_branch_id TEXT;')
lines.push('BEGIN')
lines.push("  SELECT id INTO v_tenant_id FROM \"Tenant\" WHERE lower(email) = 'dariodeoli@gmail.com' OR lower(name) LIKE '%istore%' OR lower(name) LIKE '%iphone store%' ORDER BY \"createdAt\" LIMIT 1;")
lines.push('  IF v_tenant_id IS NULL THEN RETURN; END IF;')
lines.push("  SELECT id INTO v_branch_id FROM \"Branch\" WHERE \"tenantId\" = v_tenant_id AND \"isActive\" = true ORDER BY ((lower(name) LIKE '%asu%') OR (lower(name) LIKE '%asunc%')) DESC, \"createdAt\" LIMIT 1;")
lines.push('  IF v_branch_id IS NULL THEN RETURN; END IF;')
lines.push('')
lines.push('  -- Proveedores con abreviatura para el stock del vendedor.')
for (const supplier of SUPPLIERS) {
  lines.push(`  INSERT INTO "Supplier" ("id", "tenantId", "name", "code", "updatedAt") VALUES (${q(uuid5(`supplier:${supplier.code}`))}, v_tenant_id, ${q(supplier.name)}, ${q(supplier.code)}, now()) ON CONFLICT ("tenantId", "name") DO NOTHING;`)
}
lines.push('')
lines.push('  -- Ubicaciones de la sucursal (los colores de planilla no traían depósito por fila; asignar luego).')
for (const [name, code] of [['Piso de venta', 'PV'], ['Depósito 1', 'D1'], ['Depósito 2', 'D2']]) {
  lines.push(`  INSERT INTO "StockLocation" ("id", "tenantId", "branchId", "name", "code", "isActive", "updatedAt") VALUES (${q(uuid5(`location:${name}`))}, v_tenant_id, v_branch_id, ${q(name)}, ${q(code)}, true, now()) ON CONFLICT ("branchId", "name") DO NOTHING;`)
}
lines.push('')
lines.push('  -- Catálogo de productos de la sucursal (precios de venta sin definir quedan en 0).')
for (const product of PRODUCTS) {
  const id = uuid5(`product:${product.sku}`)
  lines.push(`  INSERT INTO "Product" ("id", "tenantId", "branchId", "sku", "name", "category", "condition", "pricePyg", "stock", "updatedAt") VALUES (${q(id)}, v_tenant_id, v_branch_id, ${q(product.sku)}, ${q(product.name)}, ${q(product.category)}, ${q(product.cond)}::"ProductCondition", 0, ${product.stock}, now()) ON CONFLICT ("tenantId", "branchId", "sku") DO NOTHING;`)
}
lines.push('')
lines.push('  -- Unidades físicas serializadas.')
for (const [m, color, cap, cond, date, serial, prov, cost, battery, ver, notes, state, by] of UNITS) {
  const sku = unitSku(m, color, cap, cond)
  const id = uuid5(`unit:${serial}`)
  const status = { available: 'AVAILABLE', sold: 'SOLD', reserved: 'RESERVED', transit: 'IN_TRANSIT' }[state]
  const purchasedAt = date ? `${date} 00:00:00` : state === 'transit' ? '2026-09-14 00:00:00' : null
  lines.push(`  INSERT INTO "InventoryUnit" ("id", "tenantId", "productId", "branchId", "serial", "condition", "batteryHealth", "supplierName", "purchasedAt", "costCurrency", "originalCost", "notes", "reservedUntil", "reservationCustomer", "lastVerifiedAt", "verifiedByCode", "verificationCount", "status") VALUES (${q(id)}, v_tenant_id, (SELECT p."id" FROM "Product" p WHERE p."tenantId" = v_tenant_id AND p."branchId" = v_branch_id AND p."sku" = ${q(sku)} LIMIT 1), v_branch_id, ${q(serial)}, ${q(cond)}::"ProductCondition", ${q(battery)}, ${q(prov)}, ${q(purchasedAt)}, 'USD'::"PaymentCurrency", ${q(cost)}, ${q(notes || null)}, ${state === 'reserved' ? q('2026-12-31 23:59:59') : 'NULL'}, ${state === 'reserved' ? q(by) : 'NULL'}, ${date ? q(`${date} 00:00:00`) : 'NULL'}, ${q(ver)}, ${date ? 1 : 0}, ${q(status)}::"InventoryUnitStatus") ON CONFLICT ("tenantId", "serial") DO NOTHING;`)
}
for (const item of SERIALIZED) {
  const id = uuid5(`unit:${item.serial}`)
  const status = { available: 'AVAILABLE', sold: 'SOLD', reserved: 'RESERVED' }[item.state || 'available']
  const cond = item.cond || 'NEW'
  lines.push(`  INSERT INTO "InventoryUnit" ("id", "tenantId", "productId", "branchId", "serial", "condition", "supplierName", "purchasedAt", "costCurrency", "originalCost", "notes", "reservedUntil", "reservationCustomer", "lastVerifiedAt", "verifiedByCode", "verificationCount", "status") VALUES (${q(id)}, v_tenant_id, (SELECT p."id" FROM "Product" p WHERE p."tenantId" = v_tenant_id AND p."branchId" = v_branch_id AND p."sku" = ${q(item.sku)} LIMIT 1), v_branch_id, ${q(item.serial)}, ${q(cond)}::"ProductCondition", ${q(item.prov)}, ${q(item.date ? `${item.date} 00:00:00` : '2026-09-14 00:00:00')}, 'USD'::"PaymentCurrency", ${q(item.cost)}, ${q(item.notes || null)}, ${item.state === 'reserved' ? q('2026-12-31 23:59:59') : 'NULL'}, ${item.state === 'reserved' ? q(item.by) : 'NULL'}, ${q(item.date ? `${item.date} 00:00:00` : null)}, ${q(item.ver)}, ${item.date ? 1 : 0}, ${q(status)}::"InventoryUnitStatus") ON CONFLICT ("tenantId", "serial") DO NOTHING;`)
}
lines.push('')
lines.push('  -- El stock de productos serializados refleja unidades disponibles o reservadas;')
lines.push('  -- vendidas y en tránsito no cuentan hasta la verificación de llegada.')
const serializedSkus = [...new Set([...UNITS.map(([m, color, cap, cond]) => unitSku(m, color, cap, cond)), ...SERIALIZED.map(item => item.sku)])]
lines.push(`  UPDATE "Product" p SET "stock" = COALESCE((SELECT count(*) FROM "InventoryUnit" u WHERE u."productId" = p."id" AND u."status" IN ('AVAILABLE', 'RESERVED')), 0) WHERE p."tenantId" = v_tenant_id AND p."branchId" = v_branch_id AND p."sku" IN (${serializedSkus.map(q).join(', ')});`)
lines.push('END $$;')
lines.push('')

const output = lines.join('\n')
mkdirSync(MIGRATION_DIR, { recursive: true })
writeFileSync(join(MIGRATION_DIR, 'migration.sql'), output)

// ── Ubicación de las unidades sembradas: todas a Depósito 1 ────────────────
// Decisión de Dario (16-09-2026): los colores de planilla no traían depósito
// por fila; las unidades disponibles/reservadas del seed van a "Depósito 1"
// y después se mueven a mano. Tránsito y vendidas quedan sin ubicación.
const LOCATION_DIR = join(ROOT, 'backend/prisma/migrations/20260918010000_istore_units_deposito1')
const seedSerials = [...new Set([...UNITS.map(unit => unit[5]), ...SERIALIZED.map(item => item.serial)])]
const locationLines = [
  '-- Las unidades disponibles/reservadas del seed de iStore van a "Depósito 1"',
  '-- (decisión de Dario, 16-09-2026). Tránsito y vendidas quedan sin ubicación.',
  '',
  'DO $$',
  'DECLARE',
  '  v_tenant_id TEXT;',
  '  v_location_id TEXT;',
  'BEGIN',
  "  SELECT id INTO v_tenant_id FROM \"Tenant\" WHERE lower(email) = 'dariodeoli@gmail.com' OR lower(name) LIKE '%istore%' OR lower(name) LIKE '%iphone store%' ORDER BY \"createdAt\" LIMIT 1;",
  '  IF v_tenant_id IS NULL THEN RETURN; END IF;',
  "  SELECT l.\"id\" INTO v_location_id FROM \"StockLocation\" l JOIN \"Branch\" b ON b.\"id\" = l.\"branchId\" WHERE l.\"tenantId\" = v_tenant_id AND l.\"name\" = 'Depósito 1' AND b.\"isActive\" = true ORDER BY l.\"createdAt\" LIMIT 1;",
  '  IF v_location_id IS NULL THEN RETURN; END IF;',
  `  UPDATE "InventoryUnit" SET "locationId" = v_location_id, "updatedAt" = now() WHERE "tenantId" = v_tenant_id AND "status" IN ('AVAILABLE', 'RESERVED') AND "locationId" IS NULL AND "serial" IN (${seedSerials.map(q).join(', ')});`,
  'END $$;',
  '',
]
mkdirSync(LOCATION_DIR, { recursive: true })
writeFileSync(join(LOCATION_DIR, 'migration.sql'), locationLines.join('\n'))
const counts = UNITS.reduce((acc, unit) => { acc[unit[11]] = (acc[unit[11]] || 0) + 1; return acc }, {})
const serCounts = SERIALIZED.reduce((acc, item) => { acc[item.state || 'available'] = (acc[item.state || 'available'] || 0) + 1; return acc }, {})
console.log(`Migración generada: backend/prisma/migrations/20260916030000_istore_paraguay_real_stock/migration.sql`)
console.log(`Catálogo: ${PRODUCTS.length} productos · Unidades: ${UNITS.length + SERIALIZED.length} (teléfonos ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}${Object.entries(serCounts).length ? ` · accesorios ${Object.entries(serCounts).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''})`)
console.log('Notas: precios de venta quedan en 0 (no estaban en la planilla); proveedor real se completa desde administración.')
