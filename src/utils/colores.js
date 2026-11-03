// Detección de "familias" de producto con colores.
//
// El modelo de datos sigue siendo plano: cada color es un producto aparte
// (ej. "Protector 17 Pro Max Azul"). Acá agrupamos por convención de nombre:
// si la última palabra del nombre es un color conocido, esa palabra es el
// color y lo demás es la "familia". Así el selector muestra la familia una sola
// vez y, al elegirla, se abre una ventana para tocar el color.

// Colores/acabados conocidos (se compara sin acentos ni mayúsculas).
export const COLORES = [
  'Negro',
  'Blanco',
  'Azul',
  'Celeste',
  'Naranja',
  'Silver',
  'Plata',
  'Gris',
  'Verde',
  'Rojo',
  'Rosa',
  'Rosado',
  'Dorado',
  'Morado',
  'Violeta',
  'Lila',
  'Fucsia',
  'Amarillo',
  'Beige',
  'Marrón',
  'Turquesa',
  'Transparente',
  'Holográfica',
  'Titanio',
  'Natural',
  'Grafito',
  'Medianoche',
  'Oro',
  'Lavanda',
  'Coral',
  'Holografico',
]

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Color de cada swatch para el comparador. Clave normalizada (sin acentos ni
// mayúsculas) → color CSS. Cubre los colores comunes y algunos nombres de Apple.
export const COLOR_HEX = {
  negro: '#1f2937',
  blanco: '#f4f4f5',
  azul: '#3b82f6',
  celeste: '#7dd3fc',
  naranja: '#f97316',
  silver: '#d4d4d8',
  plata: '#d4d4d8',
  gris: '#6b7280',
  grafito: '#374151',
  verde: '#4ade80',
  rojo: '#ef4444',
  rosa: '#f9a8d4',
  rosado: '#f9a8d4',
  dorado: '#eab308',
  oro: '#eab308',
  morado: '#a855f7',
  violeta: '#8b5cf6',
  lila: '#c4b5fd',
  lavanda: '#c4b5fd',
  fucsia: '#d946ef',
  amarillo: '#facc15',
  beige: '#e7d8c9',
  marron: '#92400e',
  turquesa: '#2dd4bf',
  transparente: '#e5e7eb',
  titanio: '#9ca3af',
  medianoche: '#1e293b',
  cosmico: '#f97316',
  // Nombres completos del catálogo Apple (se prueban antes que cada palabra).
  'titanio natural': '#b8b0a3',
  'titanio azul': '#4b5a6e',
  'titanio blanco': '#e8e6e1',
  'titanio negro': '#3b3b3d',
  'titanio desierto': '#c8a98a',
  'negro espacial': '#2b2b2e',
  'gris espacial': '#5b5d63',
  'blanco estelar': '#f1ede4',
  'blanco nube': '#f5f5f2',
  'oro claro': '#e9d8b4',
  'azul cielo': '#bcd3e8',
  'azul niebla': '#9fb4c8',
  'azul intenso': '#2f3c58',
  'azul sierra': '#9bb5ce',
  'azul pacifico': '#2f4e63',
  'verde alpino': '#556b57',
  'verde noche': '#4e5851',
  'verde azulado': '#7fb5b0',
  'morado oscuro': '#594f63',
  'naranja cosmico': '#e8742f',
  'rosa claro': '#f6d3d8',
  salvia: '#b5c0a6',
  ultramar: '#5b6fd6',
}

// Devuelve un color CSS para el nombre dado: prueba el nombre completo y luego
// cada palabra (ej. "Naranja cósmico" → naranja). Gris claro por defecto.
export function colorHex(nombre) {
  const n = norm(nombre)
  if (!n) return '#cbd5e1'
  if (COLOR_HEX[n]) return COLOR_HEX[n]
  for (const palabra of n.split(/\s+/)) {
    if (COLOR_HEX[palabra]) return COLOR_HEX[palabra]
  }
  return '#cbd5e1'
}

const SET_COLORES = new Set(COLORES.map(norm))

export function esColor(palabra) {
  return SET_COLORES.has(norm(palabra))
}

// "Protector 17 Pro Max Azul" → { base: "Protector 17 Pro Max", color: "Azul" }
// "Cargador Portátil"         → { base: "Cargador Portátil", color: null }
export function separarColor(nombre) {
  const partes = (nombre || '').trim().split(/\s+/)
  if (partes.length >= 2 && esColor(partes[partes.length - 1])) {
    const color = partes[partes.length - 1]
    return { base: partes.slice(0, -1).join(' '), color }
  }
  return { base: nombre || '', color: null }
}

// Agrupa una lista de productos en familias preservando el orden de aparición.
// Devuelve [{ base, items: [{...producto, color}] }].
export function agruparProductos(productos) {
  const orden = []
  const map = new Map()
  productos.forEach((p) => {
    const { base, color } = separarColor(p.nombre)
    if (!map.has(base)) {
      map.set(base, [])
      orden.push(base)
    }
    map.get(base).push({ ...p, color })
  })
  return orden.map((base) => ({ base, items: map.get(base) }))
}
