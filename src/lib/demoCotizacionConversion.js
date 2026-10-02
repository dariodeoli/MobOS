// Conversión demo de cotización → pedido (#314): reutiliza el camino de la
// venta del POS (`addVenta` + `registrarPedidoDemoDeVenta`) para que el pedido
// aparezca en Pedidos y en la ficha del cliente, todo del lado del navegador.
// La aprobación desde el portal público demo también pasa por acá (#279 A3).
import { addVenta } from './storage.js'
import { tomarNumeroPedidoDemo } from './demoTenant.js'
import { registrarPedidoDemoDeVenta } from './demoClientes.js'
import {
  buscarDemoCotizacion,
  buscarDemoCotizacionPorToken,
  marcarDemoCotizacionConvertida,
  actualizarDemoCotizacion,
  aprobarDemoCotizacion,
} from './demoCotizaciones.js'

const fechaHoy = () => {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

/** Convierte una cotización demo abierta en pedido(s) del listado local. */
export function convertirDemoCotizacion(id, { vendedorId, vendedorNombre } = {}) {
  const cotizacion = buscarDemoCotizacion(id)
  if (!cotizacion || !['ACCEPTED', 'SENT'].includes(cotizacion.status)) return null
  // El pedido pertenece al vendedor de la cotización (o al de la sesión): si no,
  // el alcance por vendedor lo esconde del listado demo.
  const vendedor = {
    id: vendedorId || cotizacion.seller?.id || cotizacion.sellerId || 'demo-user',
    nombre: vendedorNombre || cotizacion.seller?.name || cotizacion.sellerName || 'Equipo demo',
  }
  const orderNumber = tomarNumeroPedidoDemo()
  for (const item of cotizacion.items || []) {
    addVenta({
      orderNumber,
      vendedorId: vendedor.id,
      vendedorNombre: vendedor.nombre,
      cliente: cotizacion.customerName || 'Consumidor final',
      clienteId: cotizacion.customerId || null,
      productoId: item.productId || null,
      productoNombre: item.description,
      precio: Number(item.totalPyg || Number(item.quantity) * Number(item.unitPricePyg) || 0),
      fecha: fechaHoy(),
      entrega: 'Retiro en tienda',
      estadoPago: 'Pendiente',
      pagos: [],
    })
  }
  // La ficha y el portal del cliente leen sus pedidos de `demoProfile`.
  if (cotizacion.customerId) {
    registrarPedidoDemoDeVenta(cotizacion.customerId, {
      numero: orderNumber,
      total: cotizacion.totalPyg,
      pagado: 0,
      fecha: fechaHoy(),
      vendedor: vendedor.nombre,
      sucursal: 'Casa Central',
      estado: 'PENDING',
      items: (cotizacion.items || []).map((item) => ({
        id: item.productId || item.description,
        description: item.description,
        quantity: item.quantity,
        model: '',
        category: '',
        serials: [],
      })),
    })
  }
  marcarDemoCotizacionConvertida(cotizacion.id, orderNumber)
  return { orderNumber, id: cotizacion.id }
}

/**
 * Aprobación desde el portal público demo: deja la evidencia con código y
 * genera el pedido, como la cuenta real (A3 #279).
 */
export function aprobarYConvertirDemoCotizacion(token, evidencia = {}, { vendedorId, vendedorNombre } = {}) {
  const cotizacion = buscarDemoCotizacionPorToken(token)
  if (!cotizacion) return null
  const aprobada = aprobarDemoCotizacion(token, evidencia)
  if (!aprobada) return null
  const pedido = convertirDemoCotizacion(cotizacion.id, { vendedorId, vendedorNombre })
  if (!pedido) return { ...evidencia, orderNumber: evidencia.orderNumber || null }
  const aprobacion = { ...evidencia, orderNumber: pedido.orderNumber }
  actualizarDemoCotizacion(cotizacion.id, { approval: aprobacion })
  return aprobacion
}
