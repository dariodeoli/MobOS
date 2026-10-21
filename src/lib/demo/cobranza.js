// Créditos, mora y cuotas de la demo: se calculan sobre las ventas a crédito de
// la pestaña (las mismas que ve Pedidos → «A crédito»), así el control de
// créditos, las cobranzas y el pedido nunca se contradicen. Todo es relativo a
// «hoy»; no hay llamadas al API ni a servicios externos.
import { listVentas } from '@/lib/storage'
import { listarClientesDemo } from '@/lib/demoClientes'
import { totalesPedido } from '@/utils/pedido'
import { whatsappUrl } from '@/utils/telefono'
import { calcularRecargoPyg, diasDeAtraso, DIA_MS } from '@/lib/cobranzas'

const MORA_BP_POR_DIA = 50 // 0,5 % por día, tope 20 % (misma regla que el servidor).
const avisadas = new Map()

const vencimientoDe = (venta) => new Date(new Date(venta.creadoEn || venta.fecha || Date.now()).getTime() + Number(venta.creditDays || 0) * DIA_MS)

function ventasACredito() {
  return listVentas()
    .filter((venta) => Number(venta.creditDays) > 0 && !venta.anulada)
    .map((venta) => ({ venta, ...totalesPedido(venta) }))
    .filter((fila) => fila.pendiente > 0)
}

const clientePorId = () => new Map(listarClientesDemo().map((cliente) => [cliente.id, cliente]))

/** Mismo contrato que GET /api/credits. */
export function creditosDemo(ahora = new Date()) {
  const clientes = clientePorId()
  const porCliente = new Map()
  for (const { venta, pendiente } of ventasACredito()) {
    const id = venta.clienteId || venta.customerId || venta.cliente
    const cliente = clientes.get(id) || {}
    const vence = vencimientoDe(venta)
    const mora = diasDeAtraso(vence, ahora)
    const fila = porCliente.get(id) || {
      customerId: id,
      name: cliente.name || venta.cliente || 'Cliente',
      pricingTier: cliente.pricingTier || 'RETAIL',
      creditLimitPyg: Number(cliente.creditLimitPyg || 0),
      creditDays: Number(venta.creditDays || cliente.creditDays || 0),
      pendingOrders: 0,
      outstandingPyg: 0,
      overduePyg: 0,
      maxOverdueDays: 0,
      oldestDueAt: null,
    }
    fila.pendingOrders += 1
    fila.outstandingPyg += pendiente
    if (mora > 0) { fila.overduePyg += pendiente; fila.maxOverdueDays = Math.max(fila.maxOverdueDays, mora) }
    if (!fila.oldestDueAt || vence < new Date(fila.oldestDueAt)) fila.oldestDueAt = vence.toISOString()
    porCliente.set(id, fila)
  }
  const credits = [...porCliente.values()]
    .map((fila) => ({ ...fila, limitUsagePct: fila.creditLimitPyg > 0 ? Math.round((fila.outstandingPyg / fila.creditLimitPyg) * 100) : null }))
    .sort((a, b) => b.overduePyg - a.overduePyg || b.outstandingPyg - a.outstandingPyg)
  return {
    credits,
    truncado: false,
    totals: {
      outstandingPyg: credits.reduce((suma, fila) => suma + fila.outstandingPyg, 0),
      overduePyg: credits.reduce((suma, fila) => suma + fila.overduePyg, 0),
      customersWithDebt: credits.length,
      overdueCustomers: credits.filter((fila) => fila.overduePyg > 0).length,
    },
  }
}

/** Mismo contrato que GET /api/collections/reminders: cada saldo se parte en dos cuotas. */
export function cuotasDemo(ahora = new Date()) {
  const clientes = clientePorId()
  const rows = []
  for (const { venta, pendiente } of ventasACredito()) {
    const cliente = clientes.get(venta.clienteId) || {}
    const primera = Math.round(pendiente / 2)
    const base = vencimientoDe(venta)
    ;[[1, primera, base], [2, pendiente - primera, new Date(base.getTime() + 30 * DIA_MS)]].forEach(([numero, saldo, dueAt]) => {
      const id = `${venta.id}-cuota-${numero}`
      const atraso = diasDeAtraso(dueAt, ahora)
      const recargoPyg = calcularRecargoPyg({ amountPyg: saldo, diasAtraso: atraso, bpPorDia: MORA_BP_POR_DIA })
      const mensaje = `Hola ${String(venta.cliente || '').split(' ')[0]}, te recordamos la cuota ${numero}/2 del pedido ${venta.orderNumber || venta.numero} por Gs ${saldo.toLocaleString('es-PY')}. ¡Gracias! Aurora Móviles`
      rows.push({
        id,
        orderId: venta.id,
        orderNumber: venta.orderNumber || venta.numero,
        customerName: venta.cliente,
        phone: cliente.phone || '',
        countryCode: cliente.countryCode || '+595',
        reference: `Cuota ${numero}/2`,
        dueAt: dueAt.toISOString(),
        tipo: atraso > 0 || dueAt <= ahora ? 'VENCIDA' : 'PROXIMA',
        saldoPendientePyg: saldo,
        recargoPyg,
        whatsappUrl: cliente.phone ? whatsappUrl(cliente.phone, mensaje, cliente.countryCode || '+595') : '',
        avisadoEn: avisadas.get(id) || null,
      })
    })
  }
  return { rows, moraBpPorDia: MORA_BP_POR_DIA }
}

/** Marca un aviso como enviado (solo en memoria de la pestaña). */
export function marcarAvisoDemo(id) {
  avisadas.set(id, new Date().toISOString())
  return { ok: true }
}
