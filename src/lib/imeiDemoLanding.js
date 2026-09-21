// Verificación de IMEI para la landing (#202): demo visual ficticia.
//
// Misma forma de mock que el helper de la demo (`src/lib/imeicheckDemo.js`,
// #200/#201): estados honestos (lo no verificado nunca dice "Limpio"),
// `campos[]` con `{ clave, etiqueta, valor, fuente, hora }`, fuente visible,
// IMEI enmascarado, `simulado: true` y costo 0. Cuando ese helper aterrice en
// main, la sección puede importarlo directamente: la landing solo agrega dos
// campos más (dispositivo y MDM) con la misma forma.

import { FUENTE_IMEI, enmascararImei, imeiValido } from './imeiComprobante.js'

export const FUENTE_DEMO = `${FUENTE_IMEI} (simulado)`
export const NO_VERIFICADO = 'No verificado'
export const IMEI_EJEMPLO = '356938035643809'

/** Valida con el mismo criterio que el backend (15 dígitos + Luhn) y agrega
 * el mensaje que necesita la UI; la regla vive una sola vez en `imeiComprobante`. */
export function validarImeiDemo(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (!imei) return { ok: false, error: 'Falta el IMEI.' }
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }
  if (!imeiValido(imei)) return { ok: false, error: 'El IMEI no pasa la verificación de dígito control (Luhn).' }
  return { ok: true, imei }
}

/** Máscara canónica de la app (#203): el IMEI completo nunca se muestra. */
export { enmascararImei }

/** Alias histórico de este módulo. */
export const enmascararImeiDemo = enmascararImei

const CAMPOS_EJEMPLO = [
  ['dispositivo', 'Dispositivo', 'iPhone 15 · 128 GB · Negro'],
  ['blacklist', 'Blacklist actual', 'Sin reportes actuales'],
  ['blacklistHistorial', 'Historial Blacklist Pro', 'Sin reportes previos'],
  ['findMy', 'Find My / iCloud', 'Desactivado'],
  ['simLock', 'SIM lock', 'Libre de fábrica'],
  ['mdm', 'MDM', 'Sin perfil de empresa'],
  ['garantia', 'Garantía', 'Fuera de garantía (vencida 03/2025)'],
]

/**
 * Resultado simulado de la verificación para la landing. Los escenarios
 * `'pendiente'` y `'parcial'` muestran los casos honestos del contrato del
 * backend (#193): lo que no está confirmado nunca dice "Limpio".
 */
export function consultaImeiEjemplo(imei, { escenario = 'ok', ahora = new Date() } = {}) {
  const validacion = validarImeiDemo(imei)
  if (!validacion.ok) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: validacion.error, fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const hora = ahora.toISOString()
  const pendiente = escenario === 'pendiente'
  const parcial = escenario === 'parcial'
  const campos = pendiente
    ? [{ clave: 'estado', etiqueta: 'Estado', valor: 'Consulta pendiente en el proveedor', fuente: FUENTE_DEMO, hora: null }]
    : parcial
      ? [
          ...[CAMPOS_EJEMPLO[0], CAMPOS_EJEMPLO[1]].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora })),
          { clave: 'resto', etiqueta: 'Resto de la ficha', valor: 'Sin dato del proveedor', fuente: FUENTE_DEMO, hora },
        ]
      : CAMPOS_EJEMPLO.map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora }))
  return {
    estado: pendiente ? 'pendiente' : parcial ? 'parcial' : 'verificado',
    etiqueta: pendiente ? NO_VERIFICADO : parcial ? 'Parcial' : 'Verificado',
    imeiMasked: enmascararImeiDemo(validacion.imei),
    fuente: FUENTE_DEMO,
    fecha: hora,
    campos,
    esMock: true,
    simulado: true,
    costoUsd: 0,
  }
}

/** Línea corta para la nota del cliente o el comprobante (#200). */
export function notaImeiEjemplo(consulta, { locale = 'es-PY' } = {}) {
  if (!consulta || consulta.estado === 'fallido') return ''
  const fecha = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(consulta.fecha))
  const resultado = consulta.estado === 'verificado' ? 'sin reportes' : 'pendiente de confirmar'
  return `IMEI verificado: ${resultado} al ${fecha} — fuente ${FUENTE_DEMO}`
}
