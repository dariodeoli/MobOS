// #242: categorías de producto con clave controlada e icono compartido.
// La clave se infiere del nombre/modelo cuando el dato viene suelto ("Celulares",
// "iPhone 15 Pro", "AirPods", etc.). Coordinar iconos con CMP (mismo objeto Icon).
export const CATEGORIAS_PRODUCTO = {
  IPHONE: { label: 'iPhone', icon: 'phone' },
  MACBOOK: { label: 'MacBook', icon: 'list' },
  IPAD: { label: 'iPad', icon: 'grid' },
  WATCH: { label: 'Apple Watch', icon: 'clock' },
  AIRPODS: { label: 'AirPods', icon: 'pulse' },
  ACCESORIOS: { label: 'Accesorios', icon: 'package' },
  SERVICIO: { label: 'Servicio', icon: 'wrench' },
  OTRO: { label: 'Otro', icon: 'box' },
}
export const CLAVES_CATEGORIA = Object.keys(CATEGORIAS_PRODUCTO)

const PATRONES = [
  [/iphone/i, 'IPHONE'],
  [/macbook|mac book|imac|mac mini/i, 'MACBOOK'],
  [/ipad/i, 'IPAD'],
  [/watch/i, 'WATCH'],
  [/airpods|airpods|earpods|auricular/i, 'AIRPODS'],
  [/servicio|reparaci[oó]n|service/i, 'SERVICIO'],
  [/celular|smartphone|tel[eé]fono/i, 'IPHONE'],
  [/audio|parlante|speaker/i, 'ACCESORIOS'],
]

/** Clave controlada a partir de lo guardado, el modelo o el nombre. */
export function categoriaDe(product = {}) {
  const guardada = String(product.category || '').toUpperCase()
  if (CLAVES_CATEGORIA.includes(guardada)) return guardada
  const texto = [product.model, product.category, product.name, product.nombre].filter(Boolean).join(' ')
  for (const [patron, clave] of PATRONES) if (patron.test(texto)) return clave
  return 'OTRO'
}

/** Metadatos para pintar (label + nombre de icono del objeto Icon). */
export function categoriaMeta(product = {}) {
  return CATEGORIAS_PRODUCTO[categoriaDe(product)] || CATEGORIAS_PRODUCTO.OTRO
}
