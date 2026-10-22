// Historial de una cuota de la demo: se deriva de la venta a crédito y de la
// cuota calculada. Puro (recibe la venta) para poder probarlo en node.
import { totalesPedido } from '../../utils/pedido.js'

const DIA = 86400000

/**
 * Historial de una cuota de la demo (`Cronología`): plan de crédito, entrega
 * inicial y pagos parciales del pedido, vencimiento, mora con su recargo y los
 * avisos de cobro. Todo sale de la venta y de la cuota calculada.
 */
export function eventosCuotaDemo(row, venta, ahora = new Date()) {
  if (!row || !venta) return []
  const tope = ahora.getTime()
  const creado = new Date(venta.creadoEn || venta.fecha || tope).getTime()
  const vence = new Date(row.dueAt).getTime()
  const numero = venta.orderNumber || venta.numero
  const eventos = []
  const poner = (clave, type, action, t, detail, nombre = 'María Benítez') => {
    if (!Number.isFinite(t) || t > tope) return
    eventos.push({ id: `${row.id}-${clave}`, type, action, label: action, createdAt: new Date(t).toISOString(), user: nombre ? { id: 'demo-user', name: nombre } : null, detail })
  }
  const { total } = totalesPedido(venta)
  poner('plan', 'sale', 'Plan de crédito creado', creado, `${numero} · total Gs ${total.toLocaleString('es-PY')} · ${venta.creditDays} días · 2 cuotas`, venta.seller?.name || 'Diego López')
  ;(venta.pagos || []).forEach((pago, i) => {
    const t = new Date(pago.fecha || creado).getTime()
    poner(`pago-${i}`, 'payment', i === 0 ? 'Entrega inicial cobrada' : 'Pago parcial de cuota cobrado', Math.max(creado + 60000, t), `Gs ${Number(pago.monto || 0).toLocaleString('es-PY')} · ${pago.medioPago}${pago.cuenta ? ` · ${pago.cuenta}` : ''}`)
  })
  poner('informado', 'notice', 'Cliente informado de las cuotas por WhatsApp', creado + 10 * 60000, `${row.reference || 'Cuota'} · vence ${new Date(vence).toLocaleDateString('es-PY')}`, venta.seller?.name || 'Diego López')
  if (vence <= tope) {
    poner('vencio', 'audit', `${row.reference || 'Cuota'} vencida`, vence + 8 * 3600000, `Saldo Gs ${Number(row.saldoPendientePyg).toLocaleString('es-PY')}`, '')
    const atraso = Math.max(1, Math.floor((tope - vence) / DIA))
    poner('mora', 'audit', `Mora: ${atraso} día${atraso === 1 ? '' : 's'} de atraso`, vence + DIA, `Recargo acumulado Gs ${Number(row.recargoPyg || 0).toLocaleString('es-PY')} (0,5 % por día, tope 20 %)`, '')
    poner('aviso', 'notice', 'Aviso de cobro enviado por WhatsApp', vence + DIA + 3 * 3600000, 'Recordatorio automático de la cuota vencida')
  } else {
    poner('aviso', 'notice', 'Recordatorio previo programado', Math.min(tope, vence - 3 * DIA), 'Se envía 3 días antes del vencimiento', '')
  }
  if (row.avisadoEn) poner('recordado', 'notice', 'Recordatorio enviado desde Cobranzas', new Date(row.avisadoEn).getTime(), 'Registrado y auditado')
  return eventos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
