// Informe de dispositivo imprimible (#240, inspiración PhoneCheck): datos del
// equipo, su verificación IMEI, la inspección física y la garantía, con el QR
// al informe público (`/u/<serial>`).
//
// Una sola definición alimenta el ticket ESC/POS y el HTML/PDF, como las
// etiquetas (#220). Datos:
//   - INV: `unit` (equipo, verificación física, garantía) y la consulta IMEI
//     (`/api/imei`). Si INV agrega grado/checklist, se imprime el que venga en
//     `unit.grade` y `unit.inspection` ({ puntaje, aprobados, total }).
//   - DSN: el informe público vive en la misma URL que el QR (`/u/<serial>`).
import { qrUnidad } from './qr.js'
import { identificadorDe, modeloDe } from './etiquetaUnidad.js'
import { enmascararImei, imeiValido, resumenImei } from '../imeiComprobante.js'

export const CONDICIONES_INFORME = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

const fechaTexto = (valor, conHora = false) => {
  const fecha = valor ? new Date(valor) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return ''
  return conHora ? fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : fecha.toLocaleDateString('es-PY')
}

/** Inspección física (INV): quién, cuándo y cuántas veces se verificó. */
export function verificacionFisica(unit = {}) {
  const verificador = unit.lastVerifiedBy?.name || unit.verifiedByCode || ''
  return {
    verificador,
    verificadoEl: unit.lastVerifiedAt || unit.verifiedAt || null,
    verificaciones: Number(unit.verificationCount) || 0,
    grado: String(unit.grade || unit.grado || '').trim(),
    // Checklist opcional de INV: { puntaje, aprobados, total }.
    puntaje: Number(unit.inspection?.puntaje ?? unit.inspeccion?.puntaje) || 0,
    aprobados: Number(unit.inspection?.aprobados ?? unit.inspeccion?.aprobados) || 0,
    total: Number(unit.inspection?.total ?? unit.inspeccion?.total) || 0,
  }
}

/** Datos normalizados del informe de una unidad física. */
export function datosInformeDispositivo(unit = {}, { consulta = null, base = '', emisor = '', ahora = new Date() } = {}) {
  const product = unit.product || {}
  const serial = String(unit.serial ?? '').trim()
  const inspeccion = verificacionFisica(unit)
  const verificacion = consulta ? resumenImei(consulta) : null
  return {
    modelo: modeloDe(product),
    nombre: String(product.name || product.nombre || '').trim(),
    sku: String(product.sku || '').trim(),
    serial,
    // Los IMEI (15 dígitos con Luhn) no se muestran en claro: el informe es un
    // documento que puede circular; el serial común (accesorios) sí se imprime.
    serialImpreso: serial && !imeiValido(serial) ? serial : '',
    identificador: identificadorDe(serial),
    imei: verificacion?.imei || (serial ? enmascararImei(serial) : ''),
    condicion: CONDICIONES_INFORME[unit.condition] || String(unit.condition || ''),
    bateria: Number(unit.batteryHealth) > 0 ? `${Number(unit.batteryHealth)}%` : '',
    inspeccion,
    verificacion,
    garantia: unit.warrantyUntil || unit.garantiaHasta || null,
    ubicacion: [String(unit.location?.code || '').trim(), String(unit.location?.name || '').trim()].filter(Boolean).join(' · '),
    sucursal: String(unit.branch?.name || '').trim(),
    proveedor: String(unit.supplierName || unit.supplier?.name || '').trim(),
    emisor: String(emisor || '').trim(),
    enlace: serial ? qrUnidad(serial, base) : '',
    fechaEmision: fechaTexto(ahora, true),
    fechaEmisionCorta: fechaTexto(ahora),
  }
}

/** Estado de la garantía de la tienda para mostrar (vigente/vencida/sin cargar). */
export function estadoGarantia(datos = {}, ahora = new Date()) {
  const valor = datos.garantia
  if (!valor) return { etiqueta: 'Sin garantía cargada', vigente: null, hasta: '' }
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return { etiqueta: 'Sin garantía cargada', vigente: null, hasta: '' }
  const vigente = fecha.getTime() >= ahora.getTime()
  return { etiqueta: vigente ? 'Garantía vigente' : 'Garantía vencida', vigente, hasta: fechaTexto(valor) }
}

/** Fecha de la verificación física para mostrar. */
export const fechaVerificacionInforme = (datos = {}) => fechaTexto(datos.inspeccion?.verificadoEl, true)
