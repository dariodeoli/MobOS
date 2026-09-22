// Valuación de trade-in con grado (#240 ítem 7): el valor base del modelo y la
// condición (tabla de valores de toma) se ajusta con el **grado** de la unidad
// y los **hallazgos** de la inspección, con el detalle de cada descuento para
// que el vendedor pueda explicar el número. Puro y testeable: el mismo criterio
// que usará INV cuando la unidad venga de inventario (grado + checklist).
//
// Contrato de datos para INV: la unidad puede traer `grade` (A/B/C/D) y
// `checklist` (objeto con estas claves en `false`/`true` o `{ estado }`); si no
// viene, el vendedor marca los hallazgos en el POS y el grado se sugiere solo.

/** Hallazgos de la inspección con su descuento sobre el valor base. */
export const HALLAZGOS_TOMA = [
  ['pantalla', 'Pantalla rota o con fallas', 18, 'mayor'],
  ['faceid', 'Face ID / Touch ID no funciona', 15, 'mayor'],
  ['reparado', 'Reparaciones previas no originales', 12, 'mayor'],
  ['bateria', 'Batería al 80% o menos', 10, 'mayor'],
  ['camaras', 'Cámaras con fallas', 8, 'menor'],
  ['carcasa', 'Carcasa golpeada o rayada', 8, 'menor'],
  ['conectividad', 'WiFi / BT / GPS con fallas', 7, 'menor'],
  ['audio', 'Altavoz o micrófono con fallas', 6, 'menor'],
  ['sensores', 'Sensores con fallas', 6, 'menor'],
  ['botones', 'Botones con fallas', 5, 'menor'],
]

/** Grados de condición con su descuento sobre el valor base. */
export const GRADOS_TOMA = [
  ['A', 'Como nuevo', 0],
  ['B', 'Buen estado (marcas mínimas)', 4],
  ['C', 'Con marcas visibles', 12],
  ['D', 'Muy usado o con detalles serios', 25],
]

/** Descuento máximo total: el valor nunca baja del 30% del base. */
export const DESCUENTO_MAXIMO_PCT = 70

const claves = new Set(HALLAZGOS_TOMA.map(([clave]) => clave))
const gradoDe = (valor) => GRADOS_TOMA.find(([clave]) => clave === String(valor || '').toUpperCase()) || null

/** Normaliza los hallazgos (claves válidas, sin repetir) desde un array u objeto. */
export function normalizarHallazgos(entrada) {
  const lista = Array.isArray(entrada)
    ? entrada.filter((clave) => claves.has(clave))
    : Object.entries(entrada || {}).filter(([, valor]) => valor === false || valor?.estado === false || valor?.ok === false).map(([clave]) => clave)
  return [...new Set(lista)].filter((clave) => claves.has(clave))
}

/** Grado sugerido a partir de los hallazgos (INV puede mandar el suyo). */
export function gradoSugerido(hallazgos = []) {
  const lista = normalizarHallazgos(hallazgos)
  if (!lista.length) return 'A'
  const mayores = lista.filter((clave) => (HALLAZGOS_TOMA.find(([k]) => k === clave) || [])[3] === 'mayor')
  if (mayores.length >= 2 || lista.length >= 4) return 'D'
  if (mayores.length >= 1 || lista.length >= 2) return 'C'
  return 'B'
}

/**
 * Valuación: base − descuentos (grado + hallazgos), con el detalle.
 * Devuelve también el resumen listo para pegar en las notas del canje.
 */
export function valuarToma({ baseValuePyg = 0, grado, hallazgos = [] } = {}) {
  const base = Math.max(0, Math.round(Number(baseValuePyg) || 0))
  const lista = normalizarHallazgos(hallazgos)
  const gradoElegido = gradoDe(grado) || gradoDe(gradoSugerido(lista)) || GRADOS_TOMA[0]
  const descuentos = []
  if (gradoElegido[2] > 0) descuentos.push({ clave: `grado-${gradoElegido[0]}`, etiqueta: `Grado ${gradoElegido[0]} · ${gradoElegido[1]}`, porcentaje: gradoElegido[2] })
  for (const [clave, etiqueta, porcentaje] of HALLAZGOS_TOMA) {
    if (lista.includes(clave)) descuentos.push({ clave, etiqueta, porcentaje })
  }
  let totalPct = descuentos.reduce((suma, item) => suma + item.porcentaje, 0)
  if (totalPct > DESCUENTO_MAXIMO_PCT) {
    // Se recorta el último descuento para no pasar el tope (el detalle queda
    // igual a la suma real aplicada).
    let sobrante = totalPct - DESCUENTO_MAXIMO_PCT
    for (let i = descuentos.length - 1; i >= 0 && sobrante > 0; i -= 1) {
      const quita = Math.min(descuentos[i].porcentaje, sobrante)
      descuentos[i] = { ...descuentos[i], porcentaje: descuentos[i].porcentaje - quita, recortado: true }
      sobrante -= quita
    }
    totalPct = descuentos.reduce((suma, item) => suma + item.porcentaje, 0)
  }
  const descuentosMonto = descuentos.map((item) => ({ ...item, montoPyg: Math.round((base * item.porcentaje) / 100) }))
  const totalDescuentoPyg = descuentosMonto.reduce((suma, item) => suma + item.montoPyg, 0)
  const valorFinalPyg = Math.max(0, base - totalDescuentoPyg)
  const resumen = [
    `Grado ${gradoElegido[0]}`,
    ...descuentosMonto.filter((item) => !item.clave.startsWith('grado-')).map((item) => `${item.etiqueta} (−${item.porcentaje}%)`),
  ].join(' · ')
  return {
    baseValuePyg: base,
    grado: gradoElegido[0],
    gradoEtiqueta: gradoElegido[1],
    hallazgos: lista,
    descuentos: descuentosMonto,
    totalDescuentoPct: totalPct,
    totalDescuentoPyg,
    valorFinalPyg,
    resumen,
  }
}
