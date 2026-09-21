// Contenido de la etiqueta de una unidad de stock (#220): modelo, identificador
// corto, IMEI/serial completo legible, código de unidad, QR y código de barras,
// cada pieza separada para que el operador sepa qué escanear.
//
// La misma definición alimenta el ticket ESC/POS (tickets.js) y el HTML de
// respaldo/PDF (#220): lo que se ve en la vista previa es lo que sale impreso.
import { qrUnidad } from './qr.js'

export const CONDICIONES_STOCK = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

/** Identificador corto: los últimos caracteres del serial, siempre visibles. */
export function identificadorDe(serial, cantidad = 4) {
  const limpio = String(serial ?? '').replace(/[^A-Za-z0-9]/g, '')
  return limpio.slice(-cantidad) || '----'
}

/** Modelo/variante: `model` con capacidad y color cuando no vienen adentro. */
export function modeloDe(product = {}) {
  const base = String(product.model || product.name || product.nombre || 'Producto').trim()
  const extras = [product.capacity, product.color]
    .map((valor) => String(valor ?? '').trim())
    .filter((valor) => valor && !base.toLowerCase().includes(valor.toLowerCase()))
  return [base, ...extras].join(' · ')
}

/** Línea de contexto: condición, batería, ubicación y proveedor. */
export function contextoEtiquetaUnidad(datos = {}) {
  return [
    datos.condicion,
    datos.bateria,
    datos.ubicacion ? `Ubicación: ${datos.ubicacion}` : '',
    datos.proveedor ? `Proveedor: ${datos.proveedor}` : '',
  ].filter(Boolean).join(' · ')
}

/** Datos normalizados de la etiqueta de una unidad física. */
export function datosEtiquetaUnidad(unit = {}, { base = '' } = {}) {
  const product = unit.product || {}
  const serial = String(unit.serial ?? '').trim()
  const ubicacion = unit.location || null
  return {
    modelo: modeloDe(product),
    nombre: String(product.name || product.nombre || '').trim(),
    condicion: CONDICIONES_STOCK[unit.condition] || String(unit.condition || ''),
    bateria: Number(unit.batteryHealth) > 0 ? `Batería ${Number(unit.batteryHealth)}%` : '',
    ubicacion: [String(ubicacion?.code || '').trim(), String(ubicacion?.name || '').trim()].filter(Boolean).join(' · '),
    proveedor: String(unit.supplierName || '').trim(),
    serial,
    identificador: identificadorDe(serial),
    codigo: serial ? `MOBOS:${serial}` : '',
    enlace: qrUnidad(serial, base),
  }
}
