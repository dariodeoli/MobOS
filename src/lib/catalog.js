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
