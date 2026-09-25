// #148 §9 · Montos y monedas: los importes se guardan en columnas enteras de
// 32 bits (`LIMITE_MONTO_ALMACENABLE`), así que un monto por encima del tope
// no se puede persistir. Los campos del POS ya lo acotan y lo marcan
// (`MoneyInput`), pero el guardado seguía de largo y el backend lo rechazaba
// sin decir cuál era el monto: acá se revisan todos antes de armar el pedido
// para bloquear con un mensaje que explica qué campo y cuánto.
import { errorMonto, formatGs, LIMITE_MONTO_VENTAS, limiteMonto } from './moneda.js'

/** Tope real de un monto de venta: el límite de producto acotado a lo almacenable. */
export const TOPE_VENTA = limiteMonto(LIMITE_MONTO_VENTAS)

const montoDe = (valor) => {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

/**
 * Montos de la venta que el sistema no puede guardar.
 *
 * @param {object} venta
 * @param {Array<{ nombre?: string, precio?: number, cantidad?: number, descuento?: number }>} [venta.lineas]
 * @param {number} [venta.descuento] descuento global
 * @param {number} [venta.envio] monto de entrega
 * @param {Array<{ monto?: number }>} [venta.pagos]
 * @param {number} [venta.totalGeneral]
 * @param {number} [venta.totalPagado]
 * @returns {Array<{ campo: string, monto: number }>} vacío = todo entra
 */
export function montosFueraDeRango({ lineas = [], descuento = 0, envio = 0, pagos = [], totalGeneral = 0, totalPagado = 0 } = {}) {
  const excesos = []
  const revisar = (campo, valor) => {
    if (errorMonto(valor, LIMITE_MONTO_VENTAS)) excesos.push({ campo, monto: montoDe(valor) })
  }
  for (const linea of lineas) {
    const nombre = linea?.nombre || 'un producto'
    const cantidad = Math.max(1, montoDe(linea?.cantidad) || 1)
    const descuentoLinea = montoDe(linea?.descuento)
    const unitario = montoDe(linea?.precio)
    const total = unitario * cantidad - descuentoLinea
    revisar(`el precio de ${nombre}`, linea?.precio)
    // Con una sola unidad el total es el precio: no se reporta dos veces el
    // mismo número (el mensaje muestra el primero).
    if (total !== unitario) revisar(`el total de ${nombre}`, total)
    revisar(`el descuento de ${nombre}`, descuentoLinea)
  }
  revisar('el descuento', descuento)
  revisar('el envío', envio)
  pagos.forEach((pago, indice) => revisar(`el pago ${indice + 1}`, pago?.monto))
  revisar('el total de la venta', totalGeneral)
  revisar('lo pagado', totalPagado)
  return excesos
}

/** Mensaje accionable para el primer monto fuera de rango (y cuántos más hay). */
export function mensajeMontosFueraDeRango(excesos = []) {
  if (!excesos.length) return ''
  const [{ campo, monto }] = excesos
  const otros = excesos.length > 1 ? ` Revisá también ${excesos.length - 1} monto${excesos.length > 2 ? 's' : ''} más.` : ''
  return `No se puede guardar: ${campo} (${formatGs(monto)}) supera el máximo que el sistema puede guardar (${formatGs(TOPE_VENTA)}). Bajá el monto para continuar.${otros}`
}
