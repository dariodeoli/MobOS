// Valores de toma de la demo (Trade-In → Valores de toma): tabla en memoria de
// la pestaña con la forma de `/api/device-valuations`. Sin red.
const FILAS = [
  ['iPhone 15 Pro Max', '256GB', 'USED', 5600000, 6200000],
  ['iPhone 15 Pro', '256GB', 'USED', 4700000, 5200000],
  ['iPhone 15', '128GB', 'USED', 3500000, 3900000],
  ['iPhone 14 Pro', '256GB', 'USED', 3700000, 4100000],
  ['iPhone 14', '128GB', 'USED', 2650000, 3000000],
  ['iPhone 13 Pro Max', '256GB', 'USED', 3000000, 3400000],
  ['iPhone 13', '128GB', 'USED', 2100000, 2450000],
  ['iPhone 12', '128GB', 'USED', 1450000, 1750000],
  ['iPhone 12', '64GB', 'USED', 1250000, 1500000],
  ['iPhone 11', '64GB', 'USED', 950000, 1150000],
  ['iPhone 13', '128GB', 'REFURBISHED', 2350000, 2700000],
  ['Samsung Galaxy S23', '256GB', 'USED', 2200000, 2600000],
]

let filas = null

function iniciar() {
  if (filas) return
  filas = FILAS.map(([model, storage, condition, baseValuePyg, maxValuePyg], indice) => ({
    id: `demo-valuacion-${indice + 1}`, model, storage, condition, baseValuePyg, maxValuePyg,
    notes: indice === 0 ? 'Con caja y cargador original' : '', isActive: true,
  }))
}

export const listarValuacionesDemo = () => { iniciar(); return filas.map((fila) => ({ ...fila })) }

export function guardarValuacionDemo(id, datos) {
  iniciar()
  if (id) {
    filas = filas.map((fila) => (fila.id === id ? { ...fila, ...datos } : fila))
    return { ...filas.find((fila) => fila.id === id) }
  }
  const nueva = { id: `demo-valuacion-${Date.now().toString(36)}`, ...datos }
  filas = [nueva, ...filas]
  return { ...nueva }
}
