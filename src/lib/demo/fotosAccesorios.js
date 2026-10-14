// #404: fotos de muestra para el catálogo demo. Son ilustraciones SVG generadas
// acá (formas simples, sin imágenes de terceros ni marcas), en data URI para que
// el demo no dependa de la red ni del API.
const COLORES = { LAMINA: '#38bdf8', CASE: '#a78bfa', CABLE: '#f59e0b', CARGADOR: '#22c55e', AUDIO: '#f472b6' }

const DIBUJOS = {
  // Vidrio protector: pantalla con brillo diagonal.
  LAMINA: (c) => `<rect x="38" y="14" width="44" height="92" rx="9" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="3"/><path d="M48 30l24 0M48 40l16 0" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M46 96l28-50" stroke="#fff" stroke-opacity=".7" stroke-width="4" stroke-linecap="round"/>`,
  // Funda: contorno del equipo con módulo de cámara.
  CASE: (c) => `<rect x="36" y="12" width="48" height="96" rx="12" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="4"/><rect x="42" y="18" width="20" height="20" rx="6" fill="${c}"/><circle cx="48" cy="24" r="3" fill="#fff"/><circle cx="56" cy="32" r="3" fill="#fff"/>`,
  // Cable: curva con dos fichas.
  CABLE: (c) => `<path d="M30 88c0-44 60 4 60-44" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><rect x="22" y="84" width="16" height="22" rx="4" fill="${c}"/><rect x="82" y="14" width="16" height="22" rx="4" fill="${c}"/>`,
  // Cargador: cubo con clavijas.
  CARGADOR: (c) => `<rect x="34" y="36" width="52" height="56" rx="10" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="4"/><rect x="46" y="18" width="6" height="18" rx="2" fill="${c}"/><rect x="68" y="18" width="6" height="18" rx="2" fill="${c}"/><path d="M62 50l-8 14h10l-6 14" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Auriculares: dos cápsulas con vástago y estuche.
  AUDIO: (c) => `<rect x="30" y="20" width="14" height="40" rx="7" fill="${c}"/><rect x="76" y="20" width="14" height="40" rx="7" fill="${c}"/><rect x="34" y="68" width="52" height="34" rx="14" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="4"/>`,
}

/** Ilustración 120×120 del tipo de accesorio como data URI. */
export function fotoDemoSvg(tipo) {
  const dibujo = DIBUJOS[tipo]
  if (!dibujo) return ''
  const color = COLORES[tipo]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="16" fill="#f1f5f9"/>${dibujo(color)}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// [id, nombre, categoría, precio, costo, stock, tipo, compatibles]
const ACCESORIOS_DEMO = [
  ['demo-funda-magsafe-transparente', 'Funda MagSafe Transparente', 'Accesorios', 180000, 70000, 23, 'CASE', ['iPhone 15 Pro']],
  ['demo-funda-silicona-negra', 'Funda Silicona Negra', 'Accesorios', 150000, 55000, 14, 'CASE', ['iPhone 15', 'iPhone 15 Pro']],
  ['demo-cargador-usbc-20w', 'Cargador USB-C 20W', 'Accesorios', 220000, 120000, 10, 'CARGADOR', []],
  ['demo-airpods-pro-2-usbc', 'AirPods Pro 2 USB-C', 'Audio', 1850000, 1300000, 3, 'AUDIO', []],
  ['demo-vidrio-17-pro', 'Protector de vidrio 17 Pro', 'Protectores', 120000, 45000, 0, 'LAMINA', ['iPhone 17 Pro']],
  ['demo-lamina-hidrogel-17', 'Lámina hidrogel iPhone 17', 'Protectores', 60000, 18000, 40, 'LAMINA', ['iPhone 17']],
  ['demo-case-antigolpes-17-pro', 'Case antigolpes iPhone 17 Pro', 'Accesorios', 210000, 85000, 12, 'CASE', ['iPhone 17 Pro']],
  ['demo-cable-usbc-lightning-1m', 'Cable USB-C a Lightning 1 m', 'Accesorios', 90000, 30000, 30, 'CABLE', ['iPhone 14', 'iPhone 13']],
  ['demo-cable-usbc-usbc-2m', 'Cable USB-C a USB-C 2 m', 'Accesorios', 110000, 38000, 18, 'CABLE', ['iPhone 17 Pro', 'iPad']],
  ['demo-cargador-magsafe-15w', 'Cargador MagSafe 15W', 'Accesorios', 340000, 190000, 6, 'CARGADOR', ['iPhone 17 Pro', 'iPhone 15 Pro']],
]

/**
 * Completa el catálogo demo con fotos de muestra y categorías de accesorio.
 * Idempotente: agrega los productos que faltan y rellena foto/tipo/compatibles
 * solo donde no hay. `crear(id, nombre, categoria, precio, costo, stock)` arma la
 * ficha con el mismo formato que el resto del catálogo demo.
 */
export function conFotosDemo(productos, crear) {
  const existentes = new Map(productos.map((item) => [item.id, item]))
  const lista = [...productos]
  for (const [id, nombre, categoria, precio, costo, stock, tipo, compatibles] of ACCESORIOS_DEMO) {
    const actual = existentes.get(id)
    const base = actual || crear(id, nombre, categoria, precio, costo, stock)
    const completo = {
      ...base,
      accessoryCategory: base.accessoryCategory || tipo,
      compatibleModels: base.compatibleModels?.length ? base.compatibleModels : compatibles,
      imagenes: base.imagenes?.length ? base.imagenes : [fotoDemoSvg(tipo)],
    }
    if (actual) lista[lista.indexOf(actual)] = completo
    else lista.push(completo)
  }
  return lista
}
