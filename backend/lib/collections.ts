// Cobranzas: vencimientos, mora y armado del recordatorio por WhatsApp.
// La mora es explícita y reversible: solo se cobra/avisa un recargo cuando la
// empresa configuró un porcentaje diario (`Tenant.collectionLateFeeBpPerDay`);
// sin tasa, el aviso informa los días de atraso y el recargo queda en cero.

export const DIA_MS = 86400000

// Recargo por mora: máximo porcentual sobre la cuota, para que un atraso largo
// no supere lo adeudado. Documentado y con caso de prueba.
export const MORA_CAP_PCT = 20

// Tope de cordura de la configuración (100 % diario).
export const MORA_BP_MAX = 10000

// Días completos de atraso. Fecha inválida o futura => 0 (no venció).
export function diasDeAtraso(dueAt: Date | string | null | undefined, now: Date): number {
  if (!dueAt) return 0
  const fecha = dueAt instanceof Date ? dueAt : new Date(dueAt)
  if (!Number.isFinite(fecha.getTime())) return 0
  const diff = now.getTime() - fecha.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / DIA_MS)
}

// Vencida = la fecha ya pasó (mismo criterio que el cron de email y Créditos).
export function esCuotaVencida(dueAt: Date | string | null | undefined, now: Date): boolean {
  if (!dueAt) return false
  const fecha = dueAt instanceof Date ? dueAt : new Date(dueAt)
  if (!Number.isFinite(fecha.getTime())) return false
  return fecha.getTime() <= now.getTime()
}

// Recargo por mora en guaraníes, redondeado. `bpPorDia` son puntos básicos
// diarios (100 bp = 1 % por día); null/0 desactiva el recargo.
export function calcularRecargoPyg(input: { amountPyg: number; diasAtraso: number; bpPorDia: number | null | undefined; capPct?: number }): number {
  const monto = Number(input.amountPyg)
  const dias = Math.max(0, Math.floor(Number(input.diasAtraso) || 0))
  const bp = Math.min(MORA_BP_MAX, Math.max(0, Math.floor(Number(input.bpPorDia) || 0)))
  if (!Number.isFinite(monto) || monto <= 0 || dias === 0 || bp === 0) return 0
  const capPct = input.capPct ?? MORA_CAP_PCT
  const bruto = (monto * bp * dias) / 10000
  const tope = capPct > 0 ? (monto * capPct) / 100 : null
  return Math.round(tope === null ? bruto : Math.min(bruto, tope))
}

export const formatearGs = (value: number) => `Gs. ${Math.round(Math.max(0, Number(value) || 0)).toLocaleString('es-PY')}`

// Variable {{clave}} → valor. Las claves desconocidas quedan vacías, igual que
// en los otros canales de plantillas del repo.
export function renderPlantilla(body: string, values: Record<string, string>): string {
  return String(body || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => values[key] ?? '')
}

export function variablesDeCuota(input: {
  cliente: string
  pedido: string
  vencimiento: string
  saldoPendiente: number
  diasAtraso: number
  recargoPyg: number
  empresa: string
  sucursal: string
}): Record<string, string> {
  const saldo = formatearGs(input.saldoPendiente)
  const total = formatearGs(input.saldoPendiente + input.recargoPyg)
  return {
    cliente: input.cliente,
    nombre: input.cliente,
    customer_name: input.cliente,
    pedido: input.pedido,
    order_number: input.pedido,
    vencimiento: input.vencimiento,
    due_date: input.vencimiento,
    saldo_pendiente: saldo,
    dias_atraso: String(input.diasAtraso),
    recargo: input.recargoPyg > 0 ? formatearGs(input.recargoPyg) : '',
    total,
    sucursal: input.sucursal,
    branch_name: input.sucursal,
    empresa: input.empresa,
  }
}

// Plantilla de cobranzas a usar: la predeterminada activa, si no la primera
// activa de la categoría, si no el texto base. Nunca falla la generación del
// enlace por una plantilla ausente.
export function plantillaDeCobranza(
  plantillas: Array<{ key: string; body: string; isActive: boolean; isDefault: boolean }>,
  fallback: string,
  vencida: boolean,
): { key: string; body: string } {
  const activas = plantillas.filter((item) => item.isActive !== false && item.body.trim())
  const elegida = activas.find((item) => item.isDefault) ?? activas.find((item) => (vencida ? item.key === 'cuota_vencida' : item.key === 'cuota_por_vencer')) ?? activas[0]
  return { key: elegida?.key ?? (vencida ? 'cuota_vencida' : 'cuota_por_vencer'), body: elegida?.body ?? fallback }
}

export const FALLBACK_CUOTA_POR_VENCER = '¡Hola {{cliente}}! 👋 Te recordamos que la cuota del pedido {{pedido}} vence el {{vencimiento}} por {{saldo_pendiente}}. Podés coordinar el pago con nosotros. ¡Gracias!'
export const FALLBACK_CUOTA_VENCIDA = '¡Hola {{cliente}}! 👋 La cuota del pedido {{pedido}} venció el {{vencimiento}} y tiene un saldo de {{saldo_pendiente}} ({{dias_atraso}} día(s) de atraso). Podés coordinar el pago con nosotros. ¡Gracias!'
