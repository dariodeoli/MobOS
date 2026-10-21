import { leerDemo, guardarDemo } from './demoStorage.js'
const KEY = 'mobos:demo-promotions:v1'
export function readDemoPromotions() {
  const saved = leerDemo(KEY)
  if (saved) return JSON.parse(saved)
  // Vigencias relativas a hoy: los cupones de ejemplo nunca envejecen.
  const dia = (dias) => new Date(Date.now() + dias * 86400000).toISOString()
  return [
    { id: 'demo-ten', code: 'DEMO10', name: 'Ejemplo ficticio: 10%', kind: 'PERCENT', value: 10, productId: null, startsAt: dia(-120), endsAt: dia(365), maxUnits: null, usedUnits: 0, isActive: true },
    { id: 'demo-airpods', code: 'AIRPODS150', name: 'AirPods Pro 2: Gs 150.000 menos', kind: 'AMOUNT', value: 150000, productId: 'demo-airpods-pro-2-usbc', startsAt: dia(-10), endsAt: dia(12), maxUnits: 10, usedUnits: 4, isActive: true },
    { id: 'demo-funda', code: 'FUNDA50', name: 'Funda MagSafe: Gs 50.000 menos', kind: 'AMOUNT', value: 50000, productId: 'demo-funda-magsafe-transparente', startsAt: dia(-30), endsAt: dia(30), maxUnits: 25, usedUnits: 25, isActive: true },
    { id: 'demo-quincena', code: 'QUINCENA5', name: 'Quincena: 5% en todo', kind: 'PERCENT', value: 5, productId: null, startsAt: dia(-3), endsAt: dia(4), maxUnits: 60, usedUnits: 17, isActive: true },
    { id: 'demo-verano', code: 'VERANO20', name: 'Verano: 20% en accesorios', kind: 'PERCENT', value: 20, productId: null, startsAt: dia(-75), endsAt: dia(-40), maxUnits: 80, usedUnits: 63, isActive: false },
  ]
}
export function saveDemoPromotion(data) {
  const rows = readDemoPromotions()
  if (rows.some(row => row.code === data.code)) throw new Error('Código ya existente.')
  guardarDemo(KEY, JSON.stringify([...rows, { ...data, id: crypto.randomUUID(), usedUnits: 0, isActive: true }]))
}
export function toggleDemoPromotion(id, isActive) {
  guardarDemo(KEY, JSON.stringify(readDemoPromotions().map(row => row.id === id ? { ...row, isActive } : row)))
}
export function quoteDemoPromotion(product, quantity, code) {
  const p = readDemoPromotions().find(row => row.code === code.trim().toUpperCase())
  const now = Date.now()
  if (!p || !p.isActive || +new Date(p.startsAt) > now || +new Date(p.endsAt) <= now) throw new Error('Cupón inexistente, inactivo o fuera de vigencia.')
  if (!Number.isSafeInteger(quantity) || quantity < 1 || (p.productId && p.productId !== product.id) || (p.maxUnits !== null && (p.usedUnits || 0) + quantity > p.maxUnits)) throw new Error('Cupón no aplicable o agotado.')
  const base = Number(product.precioVenta)
  if (!Number.isSafeInteger(base) || base < 0) throw new Error('Precio inválido.')
  return { couponCode: p.code, unitPricePyg: Math.max(0, base - (p.kind === 'PERCENT' ? Math.round(base * p.value / 100) : p.value)) }
}

// Products use the catalog shape { id, precioVenta }; items use the API order shape.
// Validation is read-only. Record once on successful local checkout, never on preview.
export function validateDemoPromotionItems(items, products, discountPyg = 0) {
  const usage = new Map()
  for (const item of items) {
    if (item.couponCode === undefined) continue
    if (discountPyg !== 0) throw new Error('No se puede combinar cupón y descuento global.')
    const product = products.find(p => p.id === item.productId)
    if (!product) throw new Error('Producto no encontrado.')
    const quote = quoteDemoPromotion(product, item.quantity, item.couponCode)
    if (quote.unitPricePyg !== item.unitPricePyg) throw new Error('Precio del cupón alterado o desactualizado.')
    usage.set(quote.couponCode, (usage.get(quote.couponCode) || 0) + item.quantity)
  }
  const rows = readDemoPromotions()
  for (const [code, units] of usage) {
    const p = rows.find(row => row.code === code)
    if (p.maxUnits !== null && p.usedUnits + units > p.maxUnits) throw new Error('Límite de unidades del cupón agotado.')
  }
  return Object.fromEntries(usage)
}
export function recordDemoPromotionUsage(items, products, discountPyg = 0) {
  const usage = validateDemoPromotionItems(items, products, discountPyg)
  guardarDemo(KEY, JSON.stringify(readDemoPromotions().map(p => ({ ...p, usedUnits: p.usedUnits + (usage[p.code] || 0) }))))
}
