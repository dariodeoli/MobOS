// Registro reutilizable banco → logo (#119, #139). Cubre todas las entradas de
// BANCOS_PARAGUAY con una de tres resoluciones:
//   archivo    → asset propio en public/bancos (sin hotlinks)
//   marca      → SVG vectorial que ya vive en components/shared/MedioPago.jsx
//   monograma  → iniciales + color de referencia cuando no hay logo confiable
// El registro es la fuente única: las pantallas no arman rutas de logo a mano.
import { BANCOS_PARAGUAY } from './bancos-paraguay.js'

// Claves de marca disponibles en MedioPago.jsx (el test de fuente las verifica).
export const MARCAS_MEDIO_PAGO_DISPONIBLES = ['ueno', 'upay', 'pik', 'dinelco', 'continental', 'familiar', 'dinero']

export const LOGOS_BANCOS = {
  'Banco Atlas': { archivo: 'banco-atlas.png' },
  'Banco Basa': { archivo: 'banco-basa.svg' },
  'Banco Continental': { marca: 'continental' },
  'Banco de la Nación Argentina': { archivo: 'banco-nacion-argentina.png', chip: true, alias: ['banco nacion', 'bna'] },
  'Banco do Brasil': { archivo: 'banco-do-brasil.svg', alias: ['bb', 'brasil'] },
  'Banco Familiar': { marca: 'familiar' },
  'Banco GNB Paraguay': { archivo: 'banco-gnb.svg' },
  'Banco Interfisa': { archivo: 'interfisa.png' },
  'Banco Itaú Paraguay': { archivo: 'itau.png', alias: ['itau', 'banco itau', 'itau paraguay'] },
  'Banco Nacional de Fomento': { archivo: 'bnf.png' },
  'Banco Sudameris': { archivo: 'sudameris.png' },
  'Bancop': { archivo: 'bancop.png' },
  'Citibank Paraguay': { archivo: 'citibank.svg', alias: ['citibank', 'citi'] },
  'Coomecipar': { monograma: 'CO', color: '#0B6E4F' },
  'Cooperativa Medalla Milagrosa': { monograma: 'MMM', color: '#6C3FA0' },
  'Cooperativa San Cristóbal': { monograma: 'CSC', color: '#167A54' },
  'Cooperativa Universitaria': { monograma: 'CU', color: '#1D4E9E' },
  'Financiera El Comercio': { monograma: 'FEC', color: '#0E7C7B' },
  'Financiera Finexpar': { monograma: 'FX', color: '#C24E1B' },
  'Financiera Paraguayo Japonesa': { archivo: 'paraguayo-japonesa.png' },
  'Solar Banco': { archivo: 'solar.svg', alias: ['solar', 'solar ahorro y finanzas'] },
  'ueno bank': { marca: 'ueno', alias: ['ueno'] },
}

// Paleta de respaldo para nombres escritos a mano fuera del catálogo.
const COLORES_RESPALDO = ['#33414F', '#1D4E9E', '#0B6E4F', '#8A3A1B', '#6C3FA0', '#12659E']

export function normalizarBanco(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const INDICE = new Map(
  Object.entries(LOGOS_BANCOS).flatMap(([nombre, entrada]) =>
    [nombre, ...(entrada.alias || [])].map((clave) => [normalizarBanco(clave), { nombre, ...entrada }]),
  ),
)

// Iniciales para el monograma: hasta 3 palabras significativas del nombre.
const VACIAS = new Set(['banco', 'financiera', 'cooperativa', 'banca', 'de', 'del', 'la', 'el', 'y'])
export function inicialesDeBanco(nombre) {
  const palabras = String(nombre || '').split(/[\s/]+/).filter(Boolean)
  const utiles = palabras.filter((palabra) => !VACIAS.has(normalizarBanco(palabra)))
  const base = (utiles.length ? utiles : palabras).slice(0, 3)
  const iniciales = base.map((palabra) => palabra[0].toUpperCase()).join('')
  return iniciales || '?'
}

export function colorDeBanco(nombre) {
  const texto = normalizarBanco(nombre)
  let hash = 0
  for (const letra of texto) hash = (hash * 31 + letra.charCodeAt(0)) % 9973
  return COLORES_RESPALDO[hash % COLORES_RESPALDO.length]
}

// Resolución para una pantalla: archivo propio, marca de MedioPago o
// monograma. Devuelve null si no hay nada que mostrar (texto vacío).
export function logoDeBanco(nombre) {
  const texto = String(nombre || '').trim()
  if (!texto) return null
  const entrada = INDICE.get(normalizarBanco(texto))
  if (entrada?.archivo) return { banco: entrada.nombre, tipo: 'archivo', archivo: entrada.archivo, chip: Boolean(entrada.chip) }
  if (entrada?.marca) return { banco: entrada.nombre, tipo: 'marca', marca: entrada.marca }
  if (entrada) return { banco: entrada.nombre, tipo: 'monograma', iniciales: entrada.monograma, color: entrada.color }
  return { banco: texto, tipo: 'monograma', iniciales: inicialesDeBanco(texto), color: colorDeBanco(texto), generico: true }
}

// Diagnóstico para el test y para documentar cobertura.
export function coberturaBancos() {
  return BANCOS_PARAGUAY.map((nombre) => {
    const entrada = LOGOS_BANCOS[nombre]
    const tipo = entrada?.archivo ? 'archivo' : entrada?.marca ? 'marca' : 'monograma'
    return { nombre, tipo, archivo: entrada?.archivo || null, marca: entrada?.marca || null }
  })
}
