export const ESTADOS_CELULAR = ['Nuevo', 'Seminuevo']

// Lineup de iPhone para cargar rápido la lista de precios. El precio en ₲ lo
// define el propietario. Hay dos listas según la condición del equipo.
export const LINEUP_NUEVO = [
  ['iPhone 17 Pro Max', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone 17 Pro', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone Air', ['256GB', '512GB', '1TB']],
  ['iPhone 17', ['256GB', '512GB']],
  ['iPhone 17E', ['256GB']],
  ['iPhone 16', ['128GB']],
  ['iPhone 15', ['128GB']],
]

export const LINEUP_SEMINUEVO = [
  ['iPhone 17 Pro Max', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone 17 Pro', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone Air', ['256GB', '512GB', '1TB']],
  ['iPhone 17', ['256GB', '512GB']],
  ['iPhone 17E', ['256GB']],
  ['iPhone 16 Pro Max', ['128GB', '256GB']],
  ['iPhone 16 Pro', ['128GB', '256GB']],
  ['iPhone 16', ['128GB']],
  ['iPhone 15 Pro Max', ['128GB', '256GB']],
  ['iPhone 15 Pro', ['128GB', '256GB']],
  ['iPhone 15', ['128GB']],
  ['iPhone 14 Pro Max', ['128GB', '256GB']],
  ['iPhone 14 Pro', ['128GB', '256GB']],
  ['iPhone 14', ['128GB']],
  ['iPhone 13 Pro Max', ['128GB', '256GB']],
  ['iPhone 13 Pro', ['128GB', '256GB']],
  ['iPhone 13', ['128GB']],
]

// Orden visual de los modelos (más nuevo arriba). Se usa para ordenar la lista
// sin depender de cómo se hayan ido cargando.
export const ORDEN_MODELOS = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone Air',
  'iPhone 17',
  'iPhone 17E',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 16e',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 15 Plus',
  'iPhone 15',
  'iPhone 14',
  'iPhone 13',
]
// Devuelve un número menor para los modelos más nuevos, listo para ordenar
// ascendente. Se calcula por generación (17 antes que 16…) y, dentro de la
// misma, por variante: Pro Max → Pro → Air → Plus → base → E. Es tolerante a
// cómo esté escrito el nombre ("iPhone 17 Air" o "iPhone Air", "16e", etc.).
export function rankCelular(modelo) {
  const m = (modelo || '').toLowerCase().trim()
  let gen = parseInt((m.match(/iphone\s*(\d+)/) || [])[1] || '0', 10)
  // "iPhone Air" sin número pertenece a la generación actual (17).
  if (!gen && m.includes('air')) gen = 17
  const resto = m.replace(/iphone\s*\d+/, '').trim()
  let suf = 4
  if (resto.includes('pro max')) suf = 0
  else if (resto.includes('pro')) suf = 1
  else if (resto.includes('air')) suf = 2
  else if (resto.includes('plus')) suf = 3
  else if (resto === 'e') suf = 5
  return (100 - gen) * 10 + suf
}

// Orden de capacidades dentro de un mismo modelo (de menor a mayor).
const CAP_ORDEN = ['64gb', '128gb', '256gb', '512gb', '1tb', '2tb']
export function rankCapacidad(cap) {
  const i = CAP_ORDEN.indexOf((cap || '').toLowerCase().replace(/\s+/g, ''))
  return i === -1 ? 99 : i
}

// Un modelo es "viejo" (anterior al iPhone 13) si su generación es < 13, o si
// es un iPhone SE. Sirve para limpiar la lista dejando solo del 13 en adelante.
export function esModeloViejo(modelo) {
  const m = (modelo || '').toLowerCase()
  if (m.includes('iphone se') || /\bse\b/.test(m)) return true
  const gen = parseInt((m.match(/iphone\s*(\d+)/) || [])[1] || '0', 10)
  return gen > 0 && gen < 13
}

export const CATEGORIAS_GASTO = [
  'Mercadería',
  'Alquiler',
  'Servicios',
  'Sueldos',
  'Logística',
  'Impuestos',
  'Otros',
]

// ── Constantes de dominio ───────────────────────────────────────────
export const MEDIOS_PAGO = [
  'UENO BANK',
  'POS UENO',
  'PIK ITAÚ',
  'DINELCO',
  'DINERO',
  'CONTINENTAL',
  'FAMILIAR',
]

export const ESTADOS_PAGO = ['Pagado', 'No pagado']

export const ENTREGA = ['Retiro en tienda', 'Delivery', 'Encomienda', 'Retiro en otra sucursal', 'Envío entre sucursales']

// ── Buscador dependiente (modelo → capacidad → color) · #250 ────────────────
// Un solo lugar para el catálogo de variantes: el lineup (arriba) manda los
// modelos y sus capacidades conocidas, y los productos ya cargados suman lo que
// la tienda fue vendiendo/recibiendo. La UI (Stock y Compras) consume esto para
// el alta dependiente; el SKU único lo sigue resolviendo el servidor.

const normalizar = (valor) => String(valor ?? '').trim()

/** Capacidades conocidas de un modelo: primero el lineup, después lo ya cargado. */
export function capacidadesDeModelo({ productos = [], modelo = '', condicion = null } = {}) {
  const nombre = normalizar(modelo)
  if (!nombre) return []
  const lineup = condicion === 'USED' ? LINEUP_SEMINUEVO : condicion === 'NEW' ? LINEUP_NUEVO : [...LINEUP_NUEVO, ...LINEUP_SEMINUEVO]
  const fuente = new Map()
  for (const [base, capacidades] of lineup) {
    if (normalizar(base).toLowerCase() !== nombre.toLowerCase()) continue
    for (const capacidad of capacidades) fuente.set(capacidad, true)
  }
  for (const producto of productos || []) {
    const base = normalizar(producto?.model || producto?.name).toLowerCase()
    if (base !== nombre.toLowerCase()) continue
    const capacidad = normalizar(producto?.capacity)
    if (capacidad) fuente.set(capacidad, true)
  }
  return [...fuente.keys()].sort((a, b) => rankCapacidad(a) - rankCapacidad(b) || a.localeCompare(b))
}

/** Modelos sugeridos: el lineup (nuevos y seminuevos) + lo ya cargado. */
export function modelosDeCatalogo(productos = []) {
  const fuente = new Map()
  for (const [base] of [...LINEUP_NUEVO, ...LINEUP_SEMINUEVO]) fuente.set(base.toLowerCase(), normalizar(base))
  for (const producto of productos || []) {
    const base = normalizar(producto?.model || producto?.name)
    if (base) fuente.set(base.toLowerCase(), base)
  }
  return [...fuente.values()].sort((a, b) => rankCelular(a) - rankCelular(b) || a.localeCompare(b))
}

/** Colores conocidos de la variante (modelo + capacidad) según lo ya cargado. */
export function coloresDeVariante({ productos = [], modelo = '', capacidad = '' } = {}) {
  const base = normalizar(modelo).toLowerCase()
  const cap = normalizar(capacidad).toLowerCase()
  if (!base) return []
  const fuente = new Set()
  for (const producto of productos || []) {
    if (normalizar(producto?.model || producto?.name).toLowerCase() !== base) continue
    if (cap && normalizar(producto?.capacity).toLowerCase() !== cap) continue
    const color = normalizar(producto?.color)
    if (color) fuente.add(color)
  }
  return [...fuente].sort((a, b) => a.localeCompare(b))
}

/** SKU base de la variante; el servidor lo hace único (`skuUnico`). */
export function skuDeVariante({ modelo = '', capacidad = '', color = '' } = {}) {
  const partes = [modelo, capacidad, color].map(normalizar).filter(Boolean)
  return partes.join(' ').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'PRODUCTO'
}

/** ¿La variante ya existe en el catálogo? (mismo modelo + capacidad + color) */
export function varianteExistente({ productos = [], modelo = '', capacidad = '', color = '' } = {}) {
  const base = normalizar(modelo).toLowerCase()
  const cap = normalizar(capacidad).toLowerCase()
  const tono = normalizar(color).toLowerCase()
  return (productos || []).find((producto) => normalizar(producto?.model || producto?.name).toLowerCase() === base
    && normalizar(producto?.capacity).toLowerCase() === cap
    && normalizar(producto?.color).toLowerCase() === tono) || null
}
