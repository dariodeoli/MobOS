// Valores de toma de la demo (Trade-In → Valores de toma): tabla en memoria de
// la pestaña con la forma de `/api/device-valuations`. Sin red. Cubre TODO el
// catálogo Apple (backend/lib/catalogo-apple.mjs) con valores ficticios: el valor
// de referencia es el del modelo en su capacidad más chica, seminuevo.
import { CATALOGO_APPLE, normalizarClaveModelo } from '../../../backend/lib/catalogo-apple.mjs'

const BASE_SEMINUEVO = {
  'iPhone 11': 1100000, 'iPhone 11 Pro': 1500000, 'iPhone 11 Pro Max': 1700000, 'iPhone SE (2da gen)': 700000,
  'iPhone 12 mini': 1300000, 'iPhone 12': 1600000, 'iPhone 12 Pro': 2200000, 'iPhone 12 Pro Max': 2500000,
  'iPhone 13 mini': 1700000, 'iPhone 13': 2100000, 'iPhone 13 Pro': 3000000, 'iPhone 13 Pro Max': 3400000, 'iPhone SE (3ra gen)': 1200000,
  'iPhone 14': 2600000, 'iPhone 14 Plus': 2900000, 'iPhone 14 Pro': 3800000, 'iPhone 14 Pro Max': 4300000,
  'iPhone 15': 3500000, 'iPhone 15 Plus': 3900000, 'iPhone 15 Pro': 4700000, 'iPhone 15 Pro Max': 5600000,
  'iPhone 16e': 3000000, 'iPhone 16': 4300000, 'iPhone 16 Plus': 4800000, 'iPhone 16 Pro': 5600000, 'iPhone 16 Pro Max': 6700000,
  'iPhone 17': 5600000, 'iPhone Air': 5900000, 'iPhone 17 Pro': 7600000, 'iPhone 17 Pro Max': 8700000,
  'iPad (9na gen)': 1100000, 'iPad (10ma gen)': 1800000, 'iPad (A16)': 2300000, 'iPad mini (6ta gen)': 2200000, 'iPad mini (A17 Pro)': 3000000,
  'iPad Air 10.9 (M1)': 2800000, 'iPad Air 11 (M2)': 3500000, 'iPad Air 13 (M2)': 4300000, 'iPad Air 11 (M3)': 4000000, 'iPad Air 13 (M3)': 4900000,
  'iPad Pro 11 (M4)': 6500000, 'iPad Pro 13 (M4)': 8000000, 'iPad Pro 11 (M5)': 7600000, 'iPad Pro 13 (M5)': 9200000,
  'MacBook Air 13 (M1)': 3400000, 'MacBook Air 13 (M2)': 4800000, 'MacBook Air 15 (M2)': 5700000, 'MacBook Air 13 (M3)': 5800000, 'MacBook Air 15 (M3)': 6700000,
  'MacBook Air 13 (M4)': 6900000, 'MacBook Air 15 (M4)': 7900000, 'MacBook Pro 13 (M2)': 4700000, 'MacBook Pro 14 (M1 Pro)': 7200000, 'MacBook Pro 16 (M1 Pro)': 8400000,
  'MacBook Pro 14 (M3)': 9000000, 'MacBook Pro 16 (M3 Pro)': 12500000, 'MacBook Pro 14 (M4)': 11500000, 'MacBook Pro 16 (M4 Pro)': 16500000, 'MacBook Pro 14 (M5)': 13000000,
  'iMac 24 (M1)': 5500000, 'iMac 24 (M3)': 8000000, 'iMac 24 (M4)': 9500000, 'Mac mini (M2)': 3500000, 'Mac mini (M4)': 4800000,
  'Mac Studio (M2 Max)': 11000000, 'Mac Studio (M4 Max)': 15000000,
  'Apple Watch Series 6': 800000, 'Apple Watch SE (2da gen)': 700000, 'Apple Watch SE 3': 1300000, 'Apple Watch Series 7': 1000000, 'Apple Watch Series 8': 1400000,
  'Apple Watch Series 9': 1900000, 'Apple Watch Series 10': 2400000, 'Apple Watch Series 11': 3000000, 'Apple Watch Ultra': 3500000, 'Apple Watch Ultra 2': 4600000, 'Apple Watch Ultra 3': 5600000,
  'AirPods (2da gen)': 300000, 'AirPods (3ra gen)': 600000, 'AirPods 4': 800000, 'AirPods 4 con cancelación activa de ruido': 1000000,
  'AirPods Pro (1ra gen)': 500000, 'AirPods Pro 2': 1200000, 'AirPods Pro 3': 1700000, 'AirPods Max': 2500000,
}
// Cada capacidad más grande suma valor; cada condición ajusta el valor del seminuevo.
const FACTOR_CAPACIDAD = [1, 1.12, 1.28, 1.5, 1.8]
const FACTOR_CONDICION = { USED: 1, REFURBISHED: 1.12, NEW: 1.35 }
const redondear = (valor) => Math.round(valor / 10000) * 10000

let filas = null

function iniciar() {
  if (filas) return
  filas = []
  let indice = 0
  for (const modelo of CATALOGO_APPLE) {
    const base = BASE_SEMINUEVO[modelo.nombre]
    if (!base) continue
    const capacidades = modelo.capacidades.length ? modelo.capacidades : ['']
    capacidades.forEach((storage, posicion) => {
      for (const condition of ['USED', 'REFURBISHED', 'NEW']) {
        const valor = redondear(base * FACTOR_CAPACIDAD[Math.min(posicion, FACTOR_CAPACIDAD.length - 1)] * FACTOR_CONDICION[condition])
        indice += 1
        filas.push({
          id: `demo-valuacion-${indice}`, model: modelo.nombre, modelKey: normalizarClaveModelo(modelo.nombre), storage, condition,
          baseValuePyg: valor, maxValuePyg: redondear(valor * 1.1),
          notes: modelo.nombre === 'iPhone 15 Pro Max' && storage === '256GB' && condition === 'USED' ? 'Con caja y cargador original' : '', isActive: true,
        })
      }
    })
  }
  // Una marca fuera del catálogo Apple, para mostrar que el valor también acepta modelos libres.
  filas.push({ id: 'demo-valuacion-samsung', model: 'Samsung Galaxy S23', modelKey: 'samsung galaxy s23', storage: '256GB', condition: 'USED', baseValuePyg: 2200000, maxValuePyg: 2600000, notes: '', isActive: true })
}

export const listarValuacionesDemo = () => { iniciar(); return filas.map((fila) => ({ ...fila })) }

export function guardarValuacionDemo(id, datos) {
  iniciar()
  const conClave = datos.model ? { ...datos, modelKey: normalizarClaveModelo(datos.model) } : datos
  if (id) {
    filas = filas.map((fila) => (fila.id === id ? { ...fila, ...conClave } : fila))
    return { ...filas.find((fila) => fila.id === id) }
  }
  const nueva = { id: `demo-valuacion-${Date.now().toString(36)}`, ...conClave }
  filas = [nueva, ...filas]
  return { ...nueva }
}

/** Lote de la demo: mismo contrato que `POST /api/device-valuations/batch` (idempotente). */
export function guardarLoteValuacionesDemo(rows) {
  iniciar()
  let created = 0, updated = 0, unchanged = 0
  for (const fila of rows) {
    const modelKey = normalizarClaveModelo(fila.model)
    const actual = filas.find((item) => item.modelKey === modelKey && (item.storage || '') === (fila.storage || '') && item.condition === fila.condition)
    if (actual && actual.baseValuePyg === fila.baseValuePyg && (actual.maxValuePyg ?? null) === (fila.maxValuePyg ?? null) && actual.isActive === fila.isActive) { unchanged += 1; continue }
    if (actual) { Object.assign(actual, { baseValuePyg: fila.baseValuePyg, maxValuePyg: fila.maxValuePyg ?? null, isActive: fila.isActive }); updated += 1 } else {
      filas.unshift({ id: `demo-valuacion-${Date.now().toString(36)}-${filas.length}`, model: fila.model, modelKey, storage: fila.storage || '', condition: fila.condition, baseValuePyg: fila.baseValuePyg, maxValuePyg: fila.maxValuePyg ?? null, notes: '', isActive: fila.isActive })
      created += 1
    }
  }
  return { created, updated, unchanged, rows: listarValuacionesDemo() }
}
