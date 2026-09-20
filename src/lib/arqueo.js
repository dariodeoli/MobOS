// Arqueo por denominación del cierre de caja: una sola aritmética para la
// pantalla, el papel y los tests. Espeja `DENOMINACIONES_PYG` del backend
// (`backend/lib/cash-shift.ts`): si cambia una lista, cambia la otra.

export const DENOMINACIONES = [
  { valor: 100000, tipo: 'Billete' },
  { valor: 50000, tipo: 'Billete' },
  { valor: 20000, tipo: 'Billete' },
  { valor: 10000, tipo: 'Billete' },
  { valor: 5000, tipo: 'Billete' },
  { valor: 2000, tipo: 'Billete' },
  { valor: 1000, tipo: 'Moneda' },
  { valor: 500, tipo: 'Moneda' },
  { valor: 100, tipo: 'Moneda' },
  { valor: 50, tipo: 'Moneda' },
]

const cantidadDe = (cantidades, valor) => {
  const cantidad = Number(cantidades?.[valor] ?? cantidades?.[String(valor)] ?? 0)
  return Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0
}

// Filas cargadas del arqueo (solo denominaciones con cantidad), de mayor a
// menor, con su subtotal.
export function desgloseItems(cantidades) {
  return DENOMINACIONES.map(({ valor, tipo }) => ({
    valor,
    tipo,
    cantidad: cantidadDe(cantidades, valor),
  }))
    .filter((item) => item.cantidad > 0)
    .map((item) => ({ ...item, subtotal: item.valor * item.cantidad }))
}

// Total contado del arqueo.
export function totalArqueo(cantidades) {
  return desgloseItems(cantidades).reduce((total, item) => total + item.subtotal, 0)
}

// Payload que viaja al backend: `{"100000": 3, ...}` sin ceros.
export function desglosePayload(cantidades) {
  const payload = {}
  for (const item of desgloseItems(cantidades)) payload[String(item.valor)] = item.cantidad
  return payload
}

// Diferencia del arqueo: positiva si sobra efectivo, negativa si falta.
export function diferenciaArqueo(contadoPyg, esperadoPyg) {
  return Number(contadoPyg || 0) - Number(esperadoPyg || 0)
}
