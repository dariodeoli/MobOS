const KEY = 'mobos:demo-promotions:v1'
export function readDemoPromotions() {
  const saved = localStorage.getItem(KEY)
  if (saved) return JSON.parse(saved)
  return [{ id: 'demo-ten', code: 'DEMO10', name: 'Ejemplo ficticio: 10%', kind: 'PERCENT', value: 10, productId: null, startsAt: '2026-01-01T00:00:00Z', endsAt: '2030-01-01T00:00:00Z', maxUnits: null, usedUnits: 0, isActive: true }]
}
export function saveDemoPromotion(data) {
  const rows = readDemoPromotions()
  if (rows.some(row => row.code === data.code)) throw new Error('Código ya existente.')
  localStorage.setItem(KEY, JSON.stringify([...rows, { ...data, id: crypto.randomUUID(), usedUnits: 0, isActive: true }]))
}
export function toggleDemoPromotion(id, isActive) {
  localStorage.setItem(KEY, JSON.stringify(readDemoPromotions().map(row => row.id === id ? { ...row, isActive } : row)))
}
export function quoteDemoPromotion(product, quantity, code) {
  const p = readDemoPromotions().find(row => row.code === code.trim().toUpperCase())
  const now = Date.now()
  if (!p || !p.isActive || +new Date(p.startsAt) > now || +new Date(p.endsAt) <= now) throw new Error('Cupón inexistente, inactivo o fuera de vigencia.')
  if (!Number.isSafeInteger(quantity) || quantity < 1 || (p.productId && p.productId !== product.id) || (p.maxUnits !== null && p.usedUnits + quantity > p.maxUnits)) throw new Error('Cupón no aplicable o agotado.')
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
  localStorage.setItem(KEY, JSON.stringify(readDemoPromotions().map(p => ({ ...p, usedUnits: p.usedUnits + (usage[p.code] || 0) }))))
}
