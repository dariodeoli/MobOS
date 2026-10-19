// Verificación de IMEI para la landing (#202): demo visual ficticia.
//
// Misma forma de mock que el helper de la demo (`src/lib/imeicheckDemo.js`,
// #200/#201): estados honestos (lo no verificado nunca dice "Limpio"),
// `campos[]` con `{ clave, etiqueta, valor, fuente, hora }`, fuente visible,
// IMEI enmascarado, `simulado: true` y costo 0. Cuando ese helper aterrice en
// main, la sección puede importarlo directamente: la landing solo agrega dos
// campos más (dispositivo y MDM) con la misma forma.

import { enmascararImei, imeiValido } from './imeiComprobante.js'

export const FUENTE_DEMO = 'Fuente de ejemplo (simulada)'
export const NO_VERIFICADO = 'No verificado'
export const IMEI_EJEMPLO = '356938035643809'

/** Valida con el mismo criterio que el backend (15 dígitos + Luhn) y agrega
 * el mensaje que necesita la UI; la regla vive una sola vez en `imeiComprobante`. */
export function validarImeiDemo(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (!imei) return { ok: false, error: 'Falta el IMEI.' }
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }
  if (!imeiValido(imei)) return { ok: false, error: 'El IMEI no tiene un dígito de control válido: revisá que esté bien escrito.' }
  return { ok: true, imei }
}

/** Máscara canónica de la app (#203): el IMEI completo nunca se muestra. */
export { enmascararImei }

/** Alias histórico de este módulo. */
export const enmascararImeiDemo = enmascararImei

const CAMPOS_LIMPIOS = [
  ['dispositivo', 'Dispositivo', 'iPhone 15 · 128 GB · Negro'],
  ['blacklist', 'Blacklist actual', 'Sin reportes actuales'],
  ['blacklistHistorial', 'Historial de reportes', 'Sin reportes previos'],
  ['findMy', 'Find My / iCloud', 'Desactivado'],
  ['simLock', 'SIM lock', 'Libre de fábrica'],
  ['mdm', 'MDM', 'Sin perfil de empresa'],
  ['garantia', 'Garantía', 'Fuera de garantía (vencida 03/2025)'],
]

function camposBlacklist(hora) {
  return [
    ['dispositivo', 'Dispositivo', 'iPhone 13 · 128 GB · Medianoche'],
    ['blacklist', 'Blacklist actual', 'Reportado · equipo denunciado como perdido'],
    ['blacklistHistorial', 'Historial de reportes', '1 reporte · denuncia por pérdida'],
    ['findMy', 'Find My / iCloud', 'Activado · bloqueo de activación presente'],
    ['simLock', 'SIM lock', 'Bloqueado para operador'],
    ['mdm', 'MDM', 'Sin perfil de empresa'],
    ['garantia', 'Garantía', 'Cobertura limitada hasta 11/2026'],
  ].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora }))
}

/**
 * Resultado simulado de la verificación para la landing. Los escenarios
 * `'pendiente'` y `'parcial'` muestran los casos honestos del contrato del
 * backend (#193): lo que no está confirmado nunca dice "Limpio".
 */
export function consultaImeiEjemplo(imei, { escenario = 'ok', ahora = new Date() } = {}) {
  const escenariosPermitidos = ['ok', 'blacklist', 'pendiente', 'parcial']
  if (!escenariosPermitidos.includes(escenario)) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: 'El escenario de ejemplo no es válido.', fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const validacion = validarImeiDemo(imei)
  if (!validacion.ok) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: validacion.error, fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const hora = ahora.toISOString()
  const blacklist = escenario === 'blacklist'
  const pendiente = escenario === 'pendiente'
  const parcial = escenario === 'parcial'
  const campos = blacklist
    ? camposBlacklist(hora)
    : pendiente
    ? [{ clave: 'estado', etiqueta: 'Estado', valor: 'Resultado pendiente en este ejemplo', fuente: FUENTE_DEMO, hora: null }]
    : parcial
      ? [
          ...[CAMPOS_LIMPIOS[0], CAMPOS_LIMPIOS[1]].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora })),
          { clave: 'resto', etiqueta: 'Resto de la ficha', valor: 'Sin dato en este ejemplo', fuente: FUENTE_DEMO, hora },
        ]
      : CAMPOS_LIMPIOS.map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora }))
  return {
    estado: pendiente ? 'pendiente' : parcial ? 'parcial' : 'verificado',
    etiqueta: pendiente ? NO_VERIFICADO : parcial ? 'Parcial' : blacklist ? 'Blacklist detectada' : 'Sin reportes',
    escenario,
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
  const resultado = consulta.escenario === 'blacklist' ? 'con reporte de blacklist' : consulta.estado === 'verificado' ? 'sin reportes' : 'pendiente de confirmar'
  return `IMEI verificado: ${resultado} al ${fecha} — fuente ${FUENTE_DEMO}`
}
