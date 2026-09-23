// Avisos de la cuenta del cliente (#240 → portal): lo que requiere atención se
// deriva de los datos que el portal ya recibe (vencimientos, pedidos, taller y
// garantías). Sin lógica duplicada entre la cuenta real y la demo: ambas
// superficies consumen el mismo payload.
import { codigoPedido } from '../utils/pedido.js'
import { formatGs } from '../utils/moneda.js'
import { fechaDia } from '../utils/fecha.js'

const DIA = 86400000
// Prioridad de los avisos: primero lo urgente y accionable.
const ORDEN = { pago_vencido: 0, listo_para_retirar: 1, pago_por_vencer: 2, pedido_en_camino: 3, garantia_por_vencer: 4 }
const DIAS_PAGO_POR_VENCER = 7
const DIAS_GARANTIA_POR_VENCER = 30
const MAX_AVISOS = 5

export function avisosDeCuenta(cuenta, ahora = Date.now()) {
  if (!cuenta) return []
  const avisos = []
  const numero = (valor) => codigoPedido(valor) || 'tu pedido'

  // Pagos: vencidos primero, después los que vencen dentro de la semana.
  for (const vencimiento of cuenta.dueDates || []) {
    const pendiente = Number(vencimiento.pendingPyg || 0)
    const vence = Date.parse(vencimiento.dueAt || '')
    if (pendiente <= 0 || Number.isNaN(vence)) continue
    const dias = Math.ceil((vence - ahora) / DIA)
    if (dias < 0) {
      avisos.push({
        id: `pago-vencido-${vencimiento.orderNumber}`,
        tipo: 'pago_vencido',
        tono: 'bad',
        icono: 'alert',
        titulo: `Tenés un pago vencido (${numero(vencimiento.orderNumber)})`,
        detalle: `Venció el ${fechaDia(vencimiento.dueAt)} · ${formatGs(pendiente)}`,
        destino: '#vencimientos',
      })
    } else if (dias <= DIAS_PAGO_POR_VENCER) {
      avisos.push({
        id: `pago-por-vencer-${vencimiento.orderNumber}`,
        tipo: 'pago_por_vencer',
        tono: 'warn',
        icono: 'clock',
        titulo: dias === 0 ? `Tu pago vence hoy (${numero(vencimiento.orderNumber)})` : `Tu pago vence en ${dias} día${dias === 1 ? '' : 's'} (${numero(vencimiento.orderNumber)})`,
        detalle: `Vence el ${fechaDia(vencimiento.dueAt)} · ${formatGs(pendiente)}`,
        destino: '#vencimientos',
      })
    }
  }

  // Taller: el equipo ya se puede retirar.
  for (const servicio of cuenta.servicios || []) {
    if (servicio.status !== 'LISTO') continue
    avisos.push({
      id: `taller-listo-${servicio.serviceNumber || servicio.device || 'equipo'}`,
      tipo: 'listo_para_retirar',
      tono: 'ok',
      icono: 'wrench',
      titulo: `${servicio.device || 'Tu equipo'} está listo para retirar`,
      detalle: [servicio.serviceNumber, servicio.serviceName].filter(Boolean).join(' · '),
      destino: '#servicio-tecnico',
    })
  }

  // Pedidos: listo para retirar o en camino.
  for (const pedido of cuenta.orders || []) {
    const codigo = numero(pedido.orderNumber)
    if (pedido.fulfillmentStatus === 'READY_FOR_PICKUP') {
      avisos.push({
        id: `retiro-${pedido.orderNumber}`,
        tipo: 'listo_para_retirar',
        tono: 'ok',
        icono: 'bell',
        titulo: `${codigo} está listo para retirar`,
        detalle: 'Te esperamos en el local.',
        destino: '#pedidos',
      })
    } else if (pedido.fulfillmentStatus === 'IN_TRANSIT') {
      avisos.push({
        id: `camino-${pedido.orderNumber}`,
        tipo: 'pedido_en_camino',
        tono: 'info',
        icono: 'truck',
        titulo: `${codigo} está en camino`,
        detalle: pedido.tracking?.estadoLabel || '',
        destino: '#pedidos',
      })
    }
  }

  // Garantías: vencida o por vencer.
  for (const garantia of cuenta.warranties || []) {
    const dias = garantia.daysRemaining
    if (typeof dias !== 'number') continue
    if (dias === 0) {
      avisos.push({
        id: `garantia-vencida-${garantia.serial}`,
        tipo: 'garantia_por_vencer',
        tono: 'bad',
        icono: 'shield',
        titulo: 'Tu garantía venció',
        detalle: garantia.description || '',
        destino: '#garantias',
      })
    } else if (dias <= DIAS_GARANTIA_POR_VENCER) {
      avisos.push({
        id: `garantia-${garantia.serial}`,
        tipo: 'garantia_por_vencer',
        tono: 'warn',
        icono: 'shield',
        titulo: `Tu garantía vence en ${dias} días`,
        detalle: garantia.description || '',
        destino: '#garantias',
      })
    }
  }

  return avisos.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]).slice(0, MAX_AVISOS)
}
