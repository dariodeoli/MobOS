// Etiqueta producto/paquete del lote del abastecimiento (#250 Fase 3 §11): una
// por unidad comprada, con `PRODUCTO n DE N`, la variante, el IMEI (o
// «pendiente» si todavía no se cargó), la compra, el pedido vinculado, el
// destino y el lote. Una sola definición alimenta el ticket ESC/POS y el
// HTML/PDF, como las etiquetas de unidad (#220) y el comprobante de recepción.
//
// Datos: `GET /api/supply/purchases/[id]/labels` — la respuesta trae `etiquetas`
// (`{ n, total, producto, capacidad, condicion, imei, pendiente, compra,
// referencia, pedido, destino, lote }`), la compra y el resumen de preparación.
// `etiquetasPreparacion` ya asigna una etiqueta por unidad y el IMEI de cada
// serial cargado; acá solo se normaliza para el papel.
import { CONDICIONES_STOCK } from './etiquetaUnidad.js'

const texto = (valor) => String(valor ?? '').trim()

/**
 * Datos normalizados de una etiqueta del lote.
 *
 * @param {object} etiqueta item de `etiquetas` de la respuesta de labels.
 * @param {object} [opciones]
 * @param {object|null} [opciones.compra] `compra` de la respuesta (code/referencia/destino).
 */
export function datosEtiquetaLote(etiqueta = {}, { compra = null } = {}) {
  const imei = texto(etiqueta.imei)
  const numero = Math.max(1, Number(etiqueta.n) || 1)
  const total = Math.max(numero, Number(etiqueta.total) || numero)
  const lote = texto(etiqueta.lote)
  const codigoCompra = texto(etiqueta.compra) || texto(compra?.code)
  // El identificador que se escanea en la preparación: el IMEI cuando ya está
  // cargado; si no, el lote (ENV-…) y, en su defecto, la compra (COM-…).
  const codigo = imei || lote || codigoCompra
  return {
    numero,
    total,
    posicion: `${numero} de ${total}`,
    producto: texto(etiqueta.producto) || 'Producto',
    capacidad: texto(etiqueta.capacidad),
    condicion: CONDICIONES_STOCK[texto(etiqueta.condicion).toUpperCase()] || texto(etiqueta.condicion),
    imei,
    pendiente: etiqueta.pendiente ?? !imei,
    compra: codigoCompra,
    referencia: texto(etiqueta.referencia) || texto(compra?.referencia),
    pedido: texto(etiqueta.pedido),
    destino: texto(etiqueta.destino) || texto(compra?.destino),
    lote,
    codigo,
    codigoRotulo: imei ? 'IMEI' : lote ? 'LOTE' : 'COMPRA',
  }
}

/** Línea de contexto de la etiqueta (capacidad, condición, referencia, pedido y destino). */
export function contextoEtiquetaLote(datos = {}) {
  return [datos.capacidad, datos.condicion].filter(Boolean).join(' · ')
}

/**
 * Etiqueta individual de una unidad por su serial/IMEI: la usa el panel para
 * **reimprimir una sola** (el resto del lote sale con la lista completa).
 * Compara sin distinguir mayúsculas ni espacios; sin coincidencia devuelve null.
 */
export function etiquetaPorSerial(etiquetas = [], serial = '') {
  const buscado = texto(serial).toUpperCase()
  if (!buscado) return null
  return (Array.isArray(etiquetas) ? etiquetas : []).find((etiqueta) => texto(etiqueta?.imei).toUpperCase() === buscado) || null
}

/**
 * Etiqueta individual por su número (`n`) para las unidades sin IMEI: el panel
 * reimprime la posición que muestra el listado de preparación.
 */
export function etiquetaPorNumero(etiquetas = [], numero = 0) {
  const buscado = Number(numero)
  if (!Number.isFinite(buscado) || buscado <= 0) return null
  return (Array.isArray(etiquetas) ? etiquetas : []).find((etiqueta) => Number(etiqueta?.n) === buscado) || null
}
