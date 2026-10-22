// Cronología de un cliente de la demo: se DERIVA de su ficha (pedidos, pagos,
// entregas, cuotas y mora, mensajes, garantías, taller, notas y seguimientos),
// así cada compra, cobro y aviso que ve en la ficha aparece también acá con la
// misma fecha y los mismos montos. Puro y sin storage; más reciente primero.
import { codigoPedido } from '../../utils/pedido.js'
import { formatGs } from '../../utils/moneda.js'
import { eventosTallerDemo } from './historiaTaller.js'

const MIN = 60000
const HORA = 3600000
const DIA = 86400000
const VENDEDOR = { id: 'demo-user-vendedor', name: 'Diego López' }
const CAJERA = { id: 'demo-user-cajera', name: 'María Benítez' }
const GERENTE = { id: 'demo-user-gerente', name: 'Ana Giménez' }
const aMs = (valor) => { const t = new Date(valor).getTime(); return Number.isFinite(t) ? t : null }
const ETIQUETA_ENTREGA = { READY_FOR_PICKUP: 'listo para retirar', PICKED_UP: 'retirado en tienda', DELIVERED: 'entregado a domicilio', IN_TRANSIT: 'en camino', SHIPPED: 'despachado', PROCESSING: 'en preparación' }

export function eventosClienteDemo(cliente = {}, ahora = new Date()) {
  const tope = ahora.getTime()
  const perfil = cliente.demoProfile || {}
  const pedidos = Array.isArray(perfil.orders) ? perfil.orders : []
  const eventos = []
  const poner = (id, type, action, t, user, detail = '') => {
    if (t == null) return
    eventos.push({ id, type, action, label: action, createdAt: new Date(Math.min(tope, t)).toISOString(), user, detail })
  }
  const vendedorDe = (pedido) => (pedido.seller?.name ? { id: pedido.seller.id || VENDEDOR.id, name: pedido.seller.name } : VENDEDOR)

  // Alta: nunca después de su primera compra.
  const primera = pedidos.reduce((min, p) => Math.min(min, aMs(p.createdAt) ?? Infinity), Infinity)
  const alta = Math.min(aMs(cliente.createdAt) ?? tope, Number.isFinite(primera) ? primera - 2 * HORA : Infinity)
  poner(`${cliente.id}-alta`, 'customer', 'Cliente creado', alta, GERENTE, 'Alta en el mostrador')

  for (const pedido of pedidos) {
    const creado = aMs(pedido.createdAt) ?? tope
    const codigo = codigoPedido(pedido.orderNumber) || 'Demo'
    const total = Number(pedido.totalPyg) || 0
    const cancelado = pedido.status === 'CANCELLED'
    poner(`${pedido.id}-timeline`, 'order', 'Pedido creado', creado, vendedorDe(pedido), `Pedido ${codigo} · ${formatGs(total)} · ${cancelado ? 'Anulado' : Number(pedido.pendingPyg) > 0 ? 'Pendiente' : 'Pagado'}`)
    ;(pedido.pagos || []).forEach((pago, i) => {
      const monto = Number(pago.amountPyg) || 0
      if (!monto) return
      poner(`${pedido.id}-pago-${i}`, 'payment', 'Pago confirmado', Math.max(creado + 4 * MIN, aMs(pago.paidAt) ?? creado), (aMs(pago.paidAt) ?? creado) - creado > 6 * HORA ? CAJERA : vendedorDe(pedido), `Pedido ${codigo} · ${formatGs(monto)} · ${pago.methodLabel || 'Efectivo'}`)
    })
    const estado = pedido.fulfillmentStatus
    if (cancelado) {
      poner(`${pedido.id}-anulado`, 'audit', 'Pedido anulado', creado + 3 * HORA, GERENTE, `Pedido ${codigo} · unidades repuestas al stock`)
    } else if (estado && estado !== 'PROCESSING') {
      const demora = pedido.deliveryType === 'DELIVERY' ? 26 * HORA : 70 * MIN
      poner(`${pedido.id}-entrega`, 'order', `Pedido ${ETIQUETA_ENTREGA[estado] || 'actualizado'}`, creado + demora, pedido.deliveryType === 'DELIVERY' ? { id: 'demo-user-repartidor', name: 'Marcos Aquino' } : vendedorDe(pedido), `Pedido ${codigo}`)
    }
    // Crédito: vencimiento de la cuota y mora si quedó saldo.
    const dias = Number(pedido.creditDays) || 0
    if (dias > 0 && !cancelado) {
      const vence = creado + dias * DIA
      if (Number(pedido.pendingPyg) > 0 && vence < tope) {
        const atraso = Math.max(1, Math.floor((tope - vence) / DIA))
        poner(`${pedido.id}-mora`, 'audit', 'Cuota vencida con saldo', vence + 8 * HORA, null, `Pedido ${codigo} · saldo ${formatGs(pedido.pendingPyg)} · ${atraso} día(s) de mora`)
        poner(`${pedido.id}-aviso-mora`, 'notice', 'Aviso de cobro enviado por WhatsApp', vence + DIA + 3 * HORA, CAJERA, `Pedido ${codigo} · recordatorio de la cuota vencida`)
      } else if (Number(pedido.pendingPyg) > 0) {
        poner(`${pedido.id}-cuota`, 'followUp', 'Cuota programada', creado + 5 * MIN, vendedorDe(pedido), `Pedido ${codigo} · vence en ${Math.max(1, Math.ceil((vence - tope) / DIA))} día(s)`)
      }
    }
  }

  // Mensajes de agradecimiento / seguimiento postventa de las últimas compras.
  ;[...pedidos].sort((a, b) => (aMs(b.createdAt) ?? 0) - (aMs(a.createdAt) ?? 0)).slice(0, 2).forEach((pedido) => {
    if (pedido.status === 'CANCELLED') return
    poner(`${pedido.id}-gracias`, 'notice', 'Mensaje postventa por WhatsApp', (aMs(pedido.createdAt) ?? tope) + 2 * HORA + 15 * MIN, vendedorDe(pedido), `Pedido ${codigoPedido(pedido.orderNumber)} · agradecimiento y garantía del equipo`)
  })

  for (const nota of perfil.notes || []) poner(`${nota.id}-evento`, 'note', 'Comentario del equipo', aMs(nota.createdAt), nota.user || VENDEDOR, nota.content)
  for (const seg of perfil.followUps || []) {
    poner(`${seg.id}-evento`, 'followUp', 'Seguimiento agendado', aMs(seg.createdAt), seg.user || VENDEDOR, `${seg.kind === 'CALL' ? 'Llamada' : 'Tarea'} · ${seg.note || ''}`.trim())
    if (seg.doneAt) poner(`${seg.id}-hecho`, 'followUp', 'Seguimiento completado', aMs(seg.doneAt), seg.user || VENDEDOR, seg.note || '')
  }
  for (const garantia of perfil.warranties || []) {
    poner(`${garantia.id}-evento`, 'warranty', 'Garantía registrada', aMs(garantia.createdAt), { id: 'demo-user-tecnico', name: 'Jorge Villalba' }, `${garantia.description || 'Equipo'} · ${garantia.warrantyDays || 0} días de cobertura`)
  }
  for (const aviso of perfil.notices || []) {
    poner(`${aviso.id}-enviado`, 'notice', 'Mensaje de la tienda enviado', aMs(aviso.createdAt), aviso.user || VENDEDOR, aviso.content)
    if (aviso.firstViewedAt) poner(`${aviso.id}-visto`, 'notice', 'Mensaje visto por el cliente', aMs(aviso.firstViewedAt), null, 'Abierto desde el portal del cliente')
  }
  for (const servicio of perfil.services || []) {
    // El ingreso y la entrega ya los aporta `eventosServicioDemo` (ficha): acá van las etapas intermedias.
    for (const evento of eventosTallerDemo(servicio, ahora)) {
      if (/-ingreso$|-etapa-ENTREGADO$/.test(evento.id)) continue
      eventos.push({ ...evento, id: `${cliente.id}-${evento.id}` })
    }
  }
  return eventos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(a.id).localeCompare(String(b.id)))
}
