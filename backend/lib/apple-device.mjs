// Shared by the API and frontend. Product.category is free text; inferred
// categories (e.g. WATCH for Samsung) are presentation, never Apple evidence.
const DEVICE = /^(?:(?:apple\s+)?(?:iphone|ipad|ipod|imac|macbook|mac(?:\s+(?:mini|studio|pro))?|airpods)\b|apple\s+watch\b|watch\s+(?:series\s+\d+|ultra(?:\s+\d+)?|se(?:\s+\d+)?)\b)/i
const ACCESSORY = /^(?:correa|cable|case|funda|l[aá]mina|cargador|adaptador|protector|repuesto|servicio|reparaci[oó]n)\b/i
const text = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

export function isAppleDeviceProduct(product = {}) {
  if (product.accessoryCategory || /^(?:ACCESORIOS|ACCESSORIES|SERVICIO|SERVICE)$/i.test(text(product.category))) return false
  const brands = [product.brand, product.manufacturer].map(text).filter(Boolean)
  if (brands.some(brand => !/^apple$/i.test(brand))) return false
  const labels = [product.name || product.nombre, product.model].map(text).filter(Boolean)
  // A compatibility model cannot turn an accessory or another brand into an
  // Apple device. Every supplied descriptive label must agree.
  return labels.length > 0 && labels.every(label => !ACCESSORY.test(label) && DEVICE.test(label))
}
