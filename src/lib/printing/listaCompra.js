// Lista de compra del abastecimiento (#250 §11): lo que el comprador lleva al
// proveedor — código de la compra (`COM-…`), recorrido/origen, comprador,
// proveedor, productos **agrupados con cantidades y prioridades** y los IMEI
// cargados/pendientes. Una sola definición alimenta el ticket ESC/POS y el
// HTML/PDF, como el comprobante de recepción y las etiquetas del lote.
//
// Datos: `GET /api/supply/purchases` (INV). El listado todavía no manda el
// nombre del producto ni la prioridad/origen de la necesidad: quien imprime
// pasa `productos` (catálogo) y `necesidades` (el panel las tiene a mano). El
// contrato y el pedido a INV están en docs/LISTA-COMPRA.md.
const texto = (valor) => String(valor ?? '').trim()

export const PRIORIDADES_LISTA = Object.freeze({ BAJA: 'Baja', NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' })
export const ORIGENES_LISTA = Object.freeze({
  SALE_NO_STOCK: 'Venta sin stock',
  RESERVATION_NO_STOCK: 'Reserva sin stock',
  QUANTITY_OVER_STOCK: 'Cantidad mayor al stock',
  BELOW_REORDER: 'Bajo punto de reposición',
  ORDER_COMMITTED: 'Pedido comprometido',
  MANUAL: 'Carga manual',
  LIBRE: 'Reposición libre',
})
export const ESTADOS_LISTA = Object.freeze({ COMPRADA: 'Comprada', PARCIAL: 'Parcial', RECIBIDA: 'Recibida', CANCELADA: 'Cancelada' })
export const CONDICIONES_LISTA = Object.freeze({ NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' })

const PESO = { BAJA: 1, NORMAL: 2, ALTA: 3, URGENTE: 4 }
export const pesoPrioridadLista = (prioridad) => PESO[texto(prioridad).toUpperCase()] || 0

const fechaTexto = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-PY')
}

// `productos`/`necesidades` aceptan lista, objeto por id o Map, como el resto
// de los builders: la pantalla decide cómo los tiene a mano.
const porId = (fuente, id) => {
  const valor = texto(id)
  if (!valor) return null
  if (fuente instanceof Map) return fuente.get(valor) || null
  if (Array.isArray(fuente)) return fuente.find((fila) => texto(fila?.id) === valor) || null
  if (fuente && typeof fuente === 'object') return fuente[valor] || null
  return null
}

/**
 * Datos normalizados de la lista de compra.
 *
 * @param {object} compra compra de `GET /api/supply/purchases`.
 * @param {object} [opciones]
 * @param {Array|object|Map} [opciones.productos] catálogo (`name`/`capacity`/`color`).
 * @param {Array|object|Map} [opciones.necesidades] necesidad por id (`priority`/`source`/`promisedAt`/`orderNumber`).
 * @param {string} [opciones.comprador] quién compra (si la API no lo trae).
 * @param {string} [opciones.origen] punto de partida del recorrido (p. ej. `CDE`).
 * @param {string} [opciones.recorrido] recorrido ya armado (p. ej. `CDE → Asunción`).
 * @param {string} [opciones.emisor] empresa que emite.
 * @param {string} [opciones.enlace] URL absoluta del panel para el QR.
 * @param {Date} [opciones.ahora]
 */
export function datosListaCompra(compra = {}, { productos = [], necesidades = [], comprador = '', origen = '', recorrido = '', emisor = '', enlace = '', ahora = new Date() } = {}) {
  const lineasCrudas = Array.isArray(compra?.lines) ? compra.lines : []
  const grupos = new Map()

  for (const linea of lineasCrudas) {
    const productId = texto(linea?.productId)
    const condicion = texto(linea?.condition).toUpperCase()
    const clave = `${productId}|${condicion}`
    const cantidad = Math.max(0, Number(linea?.quantity) || 0)
    const seriales = Array.isArray(linea?.serials) ? linea.serials.map((fila) => texto(fila?.serial ?? fila)).filter(Boolean) : []
    const necesidad = porId(necesidades, linea?.needId)
    // Prioridad/origen: primero lo que ya venga en la línea (API futura), si no
    // la necesidad que pasa el panel; una línea sin necesidad es reposición libre.
    const prioridad = texto(linea?.priority || necesidad?.priority).toUpperCase()
    const origenCodigo = texto(linea?.source || necesidad?.source).toUpperCase() || (linea?.needId ? '' : 'LIBRE')
    const prometida = texto(linea?.promisedAt || necesidad?.promisedAt)
    const pedido = texto(linea?.orderNumber || necesidad?.orderNumber)

    if (!grupos.has(clave)) {
      const producto = porId(productos, productId) || linea?.product || {}
      grupos.set(clave, {
        producto: texto(producto.name || producto.nombre) || productId || 'Producto',
        variante: [texto(producto.capacity), texto(producto.color)].filter(Boolean).join(' · '),
        condicion,
        cantidad: 0,
        imeis: [],
        prioridad,
        origenes: new Set(),
        prometida: '',
        pedidos: new Set(),
      })
    }
    const grupo = grupos.get(clave)
    grupo.cantidad += cantidad
    grupo.imeis.push(...seriales)
    if (pesoPrioridadLista(prioridad) > pesoPrioridadLista(grupo.prioridad)) grupo.prioridad = prioridad
    if (origenCodigo) grupo.origenes.add(origenCodigo)
    if (prometida && (!grupo.prometida || new Date(prometida) < new Date(grupo.prometida))) grupo.prometida = prometida
    if (pedido) grupo.pedidos.add(pedido)
  }

  const lineas = [...grupos.values()].map((grupo) => ({
    producto: grupo.producto,
    variante: grupo.variante,
    condicion: CONDICIONES_LISTA[grupo.condicion] || grupo.condicion,
    cantidad: grupo.cantidad,
    prioridad: grupo.prioridad ? { codigo: grupo.prioridad, etiqueta: PRIORIDADES_LISTA[grupo.prioridad] || grupo.prioridad } : null,
    origenes: [...grupo.origenes].map((codigo) => ORIGENES_LISTA[codigo] || codigo),
    prometida: grupo.prometida,
    prometidaTexto: fechaTexto(grupo.prometida),
    pedidos: [...grupo.pedidos],
    conImei: grupo.imeis.length,
    pendientes: Math.max(0, grupo.cantidad - grupo.imeis.length),
    imeis: grupo.imeis,
  }))
  // Prioridad primero (Urgente → Alta → …), después cantidad: el orden en que se
  // recorre la lista en el proveedor.
  lineas.sort((a, b) => pesoPrioridadLista(b.prioridad?.codigo) - pesoPrioridadLista(a.prioridad?.codigo) || b.cantidad - a.cantidad)

  const destino = texto(compra?.branch?.name || compra?.branchName)
  const recorridoTexto = texto(recorrido) || (texto(origen) && destino ? `${texto(origen)} → ${destino}` : destino)
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0)
  const conImei = lineas.reduce((suma, linea) => suma + linea.conImei, 0)
  const estadoCompra = texto(compra?.status).toUpperCase()

  return {
    titulo: 'Lista de compra',
    code: texto(compra?.code),
    estado: ESTADOS_LISTA[estadoCompra] || estadoCompra,
    proveedor: texto(compra?.supplierName || compra?.supplier?.name),
    referencia: texto(compra?.reference),
    comprador: texto(comprador || compra?.createdBy?.name || compra?.buyerName),
    origen: texto(origen),
    destino,
    recorrido: recorridoTexto,
    notas: texto(compra?.notes),
    fecha: fechaTexto(ahora),
    lineas,
    resumen: {
      lineas: lineas.length,
      unidades,
      conImei,
      pendientes: Math.max(0, unidades - conImei),
      urgentes: lineas.filter((linea) => pesoPrioridadLista(linea.prioridad?.codigo) >= 3).length,
    },
    emisor: texto(emisor),
    enlace: texto(enlace),
    enlacePublico: Boolean(texto(enlace)),
  }
}
