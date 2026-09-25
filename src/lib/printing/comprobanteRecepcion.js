// Comprobante de recepción del abastecimiento (#250 Fase 5 §11): lo que el
// manifiesto decía que llegaba contra lo que entró al depósito, con faltantes,
// sobrantes e incidencias (serial + nota), el depósito destino y quién/cuándo
// recibió. Una sola definición alimenta el ticket ESC/POS y el HTML/PDF, como
// las etiquetas (#220) y el informe (#240).
//
// Datos: `GET /api/supply/receptions?id=` — la recepción con su envío
// (`shipment`), las líneas de la compra y los items escaneados. La API no manda
// el nombre del producto: quien imprime entrega `productos` (lista, objeto por
// id o Map) cuando lo tiene; sin nombre, la línea cae al id — nunca se inventa.
//
// El QR al panel de la compra solo se imprime cuando el llamador entrega un
// `enlace` absoluto (la ruta pública todavía no está cerrada, docs/IMPRESION.md
// §12). Sin enlace, el papel imprime el código del envío en barras y el texto
// «Escaneá para abrir el panel de la compra.».
import { CONDICIONES_STOCK } from './etiquetaUnidad.js'

export const RESULTADOS_RECEPCION = ['RECIBIDO', 'FALTANTE', 'SOBRANTE', 'DANADO', 'INCORRECTO']

export const ETIQUETAS_RESULTADO = Object.freeze({
  RECIBIDO: 'Recibido',
  FALTANTE: 'Faltante',
  SOBRANTE: 'Sobrante',
  DANADO: 'Dañado',
  INCORRECTO: 'Incorrecto',
})

export const ETIQUETAS_ESTADO_RECEPCION = Object.freeze({
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
})

// Cómo cierra el lote la recepción (mismos estados que el backend).
export const ETIQUETAS_ESTADO_LOTE = Object.freeze({
  RECIBIDO: 'Recibido completo',
  RECEPCION_PARCIAL: 'Recepción parcial',
  CON_INCIDENCIA: 'Con incidencias',
})

const METODOS_ENVIO = Object.freeze({
  BUS: 'Bus',
  TRANSPORTADORA: 'Transportadora',
  AEX: 'AEX',
  IMPORTACION: 'Importación',
})

const texto = (valor) => String(valor ?? '').trim()

const fechaHora = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })
}

/** Conteo por resultado de la recepción (espejo del `resumenRecepcion` del backend). */
export function resumenRecepcion(items = []) {
  const base = { RECIBIDO: 0, FALTANTE: 0, SOBRANTE: 0, DANADO: 0, INCORRECTO: 0 }
  for (const item of Array.isArray(items) ? items : []) {
    const clave = texto(item?.resultado).toUpperCase()
    if (clave in base) base[clave] += 1
  }
  return base
}

// `productos` puede llegar como lista, objeto por id o Map: la pantalla decide
// cómo lo tiene a mano y el comprobante lo resuelve igual.
const productoDe = (productos, id) => {
  const valor = texto(id)
  if (!valor) return null
  if (productos instanceof Map) return productos.get(valor) || null
  if (Array.isArray(productos)) return productos.find((producto) => texto(producto?.id) === valor) || null
  if (productos && typeof productos === 'object') return productos[valor] || null
  return null
}

/**
 * Datos normalizados del comprobante de recepción.
 *
 * @param {object} recepcion respuesta de `GET /api/supply/receptions?id=` (o `{ recepcion }`).
 * @param {object} [opciones]
 * @param {Array|object|Map} [opciones.productos] productos por id (`name`/`capacity`/`color`).
 * @param {string} [opciones.emisor] empresa que emite (nombre visible).
 * @param {string} [opciones.proveedor] proveedor de la compra si la respuesta no lo trae.
 * @param {string} [opciones.enlace] URL absoluta del panel para el QR.
 * @param {Date} [opciones.ahora] momento de emisión (tests).
 */
export function datosComprobanteRecepcion(recepcion = {}, { productos = [], emisor = '', proveedor = '', enlace = '', ahora = new Date() } = {}) {
  const detalle = recepcion?.recepcion || recepcion || {}
  const shipment = detalle.shipment || {}
  const purchase = shipment.purchase || {}
  const esperados = Array.isArray(detalle.esperados)
    ? detalle.esperados
    : (Array.isArray(shipment.items) ? shipment.items : [])
  const items = Array.isArray(detalle.items) ? detalle.items : []

  // Una fila por línea de compra; lo que aparece suelto (sobrantes) cae a la
  // línea del mismo producto o a una fila nueva para no perder el dato.
  const filas = new Map()
  const filaDe = (clave, inicial = {}) => {
    if (!filas.has(clave)) {
      filas.set(clave, {
        clave,
        productoId: '',
        condicion: '',
        esperado: 0,
        recibido: 0,
        faltante: 0,
        sobrante: 0,
        danado: 0,
        incorrecto: 0,
        recibidos: [],
        incidencias: [],
        ...inicial,
      })
    }
    return filas.get(clave)
  }

  for (const linea of Array.isArray(purchase.lines) ? purchase.lines : []) {
    const clave = `l:${texto(linea?.id) || texto(linea?.productId)}`
    filaDe(clave, { productoId: texto(linea?.productId), condicion: CONDICIONES_STOCK[linea?.condition] || texto(linea?.condition) })
  }

  const esperadoDeItem = new Map()
  for (const esperado of esperados) {
    const clave = texto(esperado?.lineId) ? `l:${texto(esperado.lineId)}` : `p:${texto(esperado?.productId)}`
    const fila = filaDe(clave, { productoId: texto(esperado?.productId) })
    fila.esperado += 1
    if (texto(esperado?.id)) esperadoDeItem.set(texto(esperado.id), fila)
  }

  const filaDeProducto = (productId) => {
    const valor = texto(productId)
    for (const fila of filas.values()) if (fila.productoId === valor) return fila
    return null
  }

  for (const item of items) {
    const resultado = RESULTADOS_RECEPCION.includes(texto(item?.resultado).toUpperCase()) ? texto(item.resultado).toUpperCase() : 'RECIBIDO'
    const fila = esperadoDeItem.get(texto(item?.shipmentItemId)) || filaDeProducto(item?.productId) || filaDe(`p:${texto(item?.productId)}`, { productoId: texto(item?.productId) })
    fila[resultado.toLowerCase()] += 1
    const serial = texto(item?.serial)
    if (resultado === 'RECIBIDO') {
      if (serial) fila.recibidos.push(serial)
    } else {
      fila.incidencias.push({ serial, resultado, etiqueta: ETIQUETAS_RESULTADO[resultado], nota: texto(item?.nota) })
    }
  }

  const lineas = []
  for (const fila of filas.values()) {
    const total = fila.esperado + fila.recibido + fila.faltante + fila.sobrante + fila.danado + fila.incorrecto
    if (!total) continue
    const producto = productoDe(productos, fila.productoId) || {}
    lineas.push({
      producto: texto(producto.name || producto.nombre) || fila.productoId || 'Producto',
      variante: [texto(producto.capacity), texto(producto.color)].filter(Boolean).join(' · '),
      condicion: fila.condicion,
      esperado: fila.esperado,
      recibido: fila.recibido,
      faltante: fila.faltante,
      sobrante: fila.sobrante,
      danado: fila.danado,
      incorrecto: fila.incorrecto,
      recibidos: fila.recibidos,
      incidencias: fila.incidencias,
    })
  }

  const incidencias = []
  for (const linea of lineas) {
    for (const registro of linea.incidencias) incidencias.push({ ...registro, producto: linea.producto })
  }

  const resumen = resumenRecepcion(items)
  const estadoRecepcion = texto(detalle.status).toUpperCase() || 'BORRADOR'
  const estadoLote = texto(shipment.status).toUpperCase()
  const recibidoEl = texto(detalle.receivedAt) || texto(detalle.createdAt)

  return {
    titulo: 'Comprobante de recepción',
    compra: texto(purchase.code),
    envio: texto(shipment.code),
    proveedor: texto(proveedor || purchase.supplierName),
    origen: texto(shipment.origin),
    destino: texto(shipment.destinationBranch?.name),
    metodo: METODOS_ENVIO[texto(shipment.method).toUpperCase()] || texto(shipment.method),
    deposito: [texto(detalle.location?.code), texto(detalle.location?.name)].filter(Boolean).join(' · '),
    usuario: texto(detalle.receivedBy?.name),
    estado: {
      recepcion: estadoRecepcion,
      etiqueta: ETIQUETAS_ESTADO_RECEPCION[estadoRecepcion] || estadoRecepcion,
      lote: estadoLote,
      etiquetaLote: ETIQUETAS_ESTADO_LOTE[estadoLote] || estadoLote,
    },
    recibidoEl,
    fecha: fechaHora(recibidoEl),
    fechaEmision: fechaHora(ahora),
    notas: texto(detalle.notes),
    emisor: texto(emisor),
    lineas,
    incidencias,
    resumen: {
      esperadas: esperados.length,
      recibidas: resumen.RECIBIDO,
      faltantes: resumen.FALTANTE,
      sobrantes: resumen.SOBRANTE,
      danados: resumen.DANADO,
      incorrectos: resumen.INCORRECTO,
    },
    enlace: texto(enlace),
    enlacePublico: Boolean(texto(enlace)),
  }
}
