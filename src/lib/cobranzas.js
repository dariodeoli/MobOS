// Cobranzas: espejo del cálculo de mora del backend (`backend/lib/collections.ts`)
// para agrupar y mostrar vencimientos en la pantalla. La fuente autoritativa
// sigue siendo el servidor; acá solo se dibuja.
export const DIA_MS = 86400000
export const MORA_CAP_PCT = 20

const aFecha = (value) => {
  if (!value) return null
  const fecha = value instanceof Date ? value : new Date(value)
  return Number.isFinite(fecha.getTime()) ? fecha : null
}

// Días completos de atraso. Fecha inválida o futura => 0.
export function diasDeAtraso(dueAt, now = new Date()) {
  const fecha = aFecha(dueAt)
  if (!fecha) return 0
  const diff = now.getTime() - fecha.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / DIA_MS)
}

export function esVencida(dueAt, now = new Date()) {
  const fecha = aFecha(dueAt)
  return fecha !== null && fecha.getTime() <= now.getTime()
}

// Recargo por mora en guaraníes: bp diarios sobre la cuota, con tope del 20 %.
export function calcularRecargoPyg({ amountPyg, diasAtraso, bpPorDia, capPct = MORA_CAP_PCT } = {}) {
  const monto = Number(amountPyg)
  const dias = Math.max(0, Math.floor(Number(diasAtraso) || 0))
  const bp = Math.max(0, Math.floor(Number(bpPorDia) || 0))
  if (!Number.isFinite(monto) || monto <= 0 || dias === 0 || bp === 0) return 0
  const bruto = (monto * bp * dias) / 10000
  const tope = capPct > 0 ? (monto * capPct) / 100 : null
  return Math.round(tope === null ? bruto : Math.min(bruto, tope))
}

// Vencidas primero (más atrasadas arriba) y luego las próximas por fecha.
export function agruparCuotas(rows = [], now = new Date()) {
  const vencidas = []
  const proximas = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!aFecha(row?.dueAt)) continue
    if (row.tipo === 'VENCIDA' || esVencida(row.dueAt, now)) vencidas.push(row)
    else proximas.push(row)
  }
  vencidas.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  proximas.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  return { vencidas, proximas }
}

export function resumenCuotas(rows = []) {
  const suma = { pendientePyg: 0, recargoPyg: 0, total: 0, sinTelefono: 0 }
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue
    suma.pendientePyg += Number(row.saldoPendientePyg || 0)
    suma.recargoPyg += Number(row.recargoPyg || 0)
    suma.total += 1
    if (!row.whatsappUrl) suma.sinTelefono += 1
  }
  return suma
}
