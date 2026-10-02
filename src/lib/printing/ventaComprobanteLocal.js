// Comprobante de venta con los datos locales del demo (#318).
//
// La pantalla pasa la fila que tiene a mano (la proyección del listado, la
// venta recién creada o el pedido del API) y acá se completa con la venta real
// guardada: las líneas locales del mismo pedido, el catálogo para el nombre del
// producto y la ficha del cliente. En una cuenta real la orden del API ya trae
// todo y estas búsquedas no cambian nada.

import { listVentas, productosById } from '../storage.js'
import { buscarClienteDemo } from '../demoClientes.js'
import { documentoComprobante } from './ventaComprobante.js'

// Todas las ventas locales que forman el mismo pedido: por `compraId` (varias
// líneas de una misma venta) o, si no, por número de pedido. Sin coincidencia,
// la venta suelta.
export function lineasLocalesDeVenta(venta = {}) {
  if (!venta || typeof venta !== 'object') return []
  const ventas = listVentas()
  const propia = ventas.find((fila) => venta.id && fila.id === venta.id)
  if (!propia) return []
  const clave = propia.compraId || propia.orderNumber
  if (!clave) return [propia]
  return ventas.filter((fila) => (propia.compraId ? fila.compraId === propia.compraId : fila.orderNumber === propia.orderNumber))
}

/** Documento del comprobante con los datos reales disponibles en la app. */
export function documentoDeVenta(venta = null, contexto = {}) {
  const lineas = lineasLocalesDeVenta(venta)
  const clienteId = venta?.customerId || venta?.clienteId || lineas[0]?.clienteId
  const cliente = clienteId ? buscarClienteDemo(clienteId) : null
  return documentoComprobante(venta, { ...contexto, lineas, productos: productosById(), cliente })
}
