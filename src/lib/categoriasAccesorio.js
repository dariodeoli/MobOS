// #404: categorías de accesorios con ícono, filtro por chips y compatibilidad
// por modelo («para iPhone 17 Pro»). La clave guardada (`accessoryCategory`)
// manda; si el producto no la tiene se infiere del nombre para que el catálogo
// ya cargado se filtre sin edición previa.
export const CATEGORIAS_ACCESORIO = {
  LAMINA: { label: 'Láminas', singular: 'Lámina', icon: 'shield' },
  CASE: { label: 'Cases', singular: 'Case', icon: 'package' },
  CABLE: { label: 'Cables', singular: 'Cable', icon: 'link' },
  CARGADOR: { label: 'Cargadores', singular: 'Cargador', icon: 'pulse' },
  AUDIO: { label: 'Audio', singular: 'Audio', icon: 'play' },
  OTRO: { label: 'Otros', singular: 'Otro', icon: 'box' },
}
export const CLAVES_ACCESORIO = Object.keys(CATEGORIAS_ACCESORIO)

const PATRONES = [
  ['AUDIO', /airpods|earpods|auricular|audifono|earbuds|buds|parlante|speaker|headphone/i],
  ['LAMINA', /l[aá]mina|vidrio|templado|protector de pantalla|screen protector|hidrogel/i],
  ['CASE', /\bcase\b|funda|carcasa|estuche|cover/i],
  ['CABLE', /\bcable\b|cord[oó]n/i],
  ['CARGADOR', /cargador|charger|adaptador|power ?bank|magsafe|\bbase\b.*carga/i],
]

const sinAcentos = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Clave de accesorio guardada o inferida del nombre; null si no parece accesorio. */
export function categoriaAccesorioDe(producto = {}) {
  const guardada = String(producto.accessoryCategory || '').toUpperCase()
  if (CLAVES_ACCESORIO.includes(guardada)) return guardada
  const texto = sinAcentos([producto.name, producto.nombre, producto.category, producto.categoria].filter(Boolean).join(' '))
  for (const [clave, patron] of PATRONES) if (patron.test(texto)) return clave
  return null
}

/** Lista limpia de modelos compatibles (acepta arreglo o texto separado por comas). */
export function modelosCompatibles(producto = {}) {
  const crudo = producto.compatibleModels
  const lista = Array.isArray(crudo) ? crudo : typeof crudo === 'string' ? crudo.split(/[,\n;]/) : []
  return [...new Set(lista.map((modelo) => String(modelo || '').trim()).filter(Boolean))]
}

/** «para iPhone 17 Pro» · «para iPhone 17 Pro +2 más»; '' si no declara modelos. */
export function textoCompatibilidad(producto = {}, { max = 1 } = {}) {
  const modelos = modelosCompatibles(producto)
  if (!modelos.length) return ''
  const visibles = modelos.slice(0, Math.max(1, max))
  const resto = modelos.length - visibles.length
  return `para ${visibles.join(', ')}${resto > 0 ? ` +${resto} más` : ''}`
}

/** Convierte el texto del campo («iPhone 17 Pro, iPhone 17») a la lista del API. */
export function parseModelosCompatibles(texto) {
  return modelosCompatibles({ compatibleModels: String(texto || '') })
}

/** Chips con conteo: solo las categorías que tienen productos. */
export function chipsAccesorio(productos = []) {
  const conteo = new Map()
  for (const producto of productos) {
    const clave = categoriaAccesorioDe(producto)
    if (clave) conteo.set(clave, (conteo.get(clave) || 0) + 1)
  }
  return CLAVES_ACCESORIO.filter((clave) => conteo.has(clave)).map((clave) => ({ clave, ...CATEGORIAS_ACCESORIO[clave], cantidad: conteo.get(clave) }))
}

/** Filtra por clave de accesorio; 'todas' (o vacío) deja pasar todo. */
export function filtrarPorAccesorio(productos = [], clave = 'todas') {
  if (!clave || clave === 'todas') return productos
  return productos.filter((producto) => categoriaAccesorioDe(producto) === clave)
}
