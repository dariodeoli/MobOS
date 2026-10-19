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

export const ESCENARIOS_IMEI_DEMO = [
  { id: 'ok', etiqueta: 'Sin reportes', testId: 'imei-escenario-limpio' },
  { id: 'blacklist', etiqueta: 'Blacklist', testId: 'imei-escenario-blacklist' },
  { id: 'operadora', etiqueta: 'Bloqueo de operadora', testId: 'imei-escenario-operadora' },
  { id: 'tigo', etiqueta: 'Bloqueado por Tigo', testId: 'imei-escenario-tigo' },
  { id: 'garantia-apple-vigente', etiqueta: 'Apple vigente', testId: 'imei-escenario-apple-vigente' },
  { id: 'garantia-apple-vencida', etiqueta: 'Apple vencida', testId: 'imei-escenario-apple-vencida' },
]

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
  ].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, tono: ['blacklist', 'findMy'].includes(clave) ? 'bad' : 'neutral', fuente: FUENTE_DEMO, hora }))
}

function fechaDemo(fecha) {
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha)
}

function desplazarDias(fecha, dias) {
  const resultado = new Date(fecha)
  resultado.setDate(resultado.getDate() + dias)
  return resultado
}

function camposDeEscenario(escenario, hora, ahora) {
  if (escenario === 'blacklist') return camposBlacklist(hora)

  const campos = CAMPOS_LIMPIOS.map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora }))
  const campo = (clave) => campos.find((item) => item.clave === clave)

  if (escenario === 'operadora') {
    Object.assign(campo('simLock'), { valor: 'Bloqueado para operador · ejemplo', tono: 'bad' })
  } else if (escenario === 'tigo') {
    Object.assign(campo('simLock'), { valor: 'Bloqueado por Tigo · ejemplo ficticio', tono: 'bad' })
  } else if (escenario === 'garantia-apple-vigente') {
    const hasta = fechaDemo(desplazarDias(ahora, 180))
    Object.assign(campo('garantia'), { valor: `Apple · cobertura vigente hasta ${hasta} · ejemplo`, tono: 'good' })
  } else if (escenario === 'garantia-apple-vencida') {
    const vencida = fechaDemo(desplazarDias(ahora, -180))
    Object.assign(campo('garantia'), { valor: `Apple · cobertura vencida el ${vencida} · ejemplo`, tono: 'warn' })
  }

  return campos
}

const ESTADOS_ESCENARIO = {
  ok: { tono: 'good', etiqueta: 'Sin reportes', motivo: 'Sin reportes en este escenario ficticio.', recomendacion: 'Continuar con la inspección física y documental.' },
  blacklist: { tono: 'bad', etiqueta: 'Blacklist detectada', motivo: (ahora) => `Equipo denunciado como perdido · Reporte: ${fechaDemo(desplazarDias(ahora, -5))}`, recomendacion: 'No comprar ni aceptar como parte de pago. No entregues dinero por este equipo.' },
  operadora: { tono: 'bad', etiqueta: 'Bloqueo de operadora', motivo: 'La SIM aparece restringida a una operadora en este ejemplo.', recomendacion: 'Confirmar compatibilidad y estado con el operador antes de aceptar el equipo.' },
  tigo: { tono: 'bad', etiqueta: 'Bloqueado por Tigo', motivo: 'Restricción atribuida a Tigo solo para este ejemplo ficticio.', recomendacion: 'Verificar el estado y la titularidad con el operador; esta demo no es evidencia.' },
  'garantia-apple-vigente': { tono: 'good', etiqueta: 'Garantía Apple vigente', motivo: (ahora) => `Cobertura de ejemplo vigente hasta ${fechaDemo(desplazarDias(ahora, 180))}.`, recomendacion: 'Confirmar elegibilidad y cobertura antes de prometer una reparación.' },
  'garantia-apple-vencida': { tono: 'warn', etiqueta: 'Garantía Apple vencida', motivo: (ahora) => `Cobertura de ejemplo vencida el ${fechaDemo(desplazarDias(ahora, -180))}.`, recomendacion: 'Informar que este ejemplo muestra una cobertura vencida; confirmar antes de cotizar.' },
}

/**
 * Resultado simulado de la verificación para la landing. Los escenarios
 * `'pendiente'` y `'parcial'` muestran los casos honestos del contrato del
 * backend (#193): lo que no está confirmado nunca dice "Limpio".
 */
export function consultaImeiEjemplo(imei, { escenario = 'ok', ahora = new Date() } = {}) {
  const escenariosPermitidos = [...ESCENARIOS_IMEI_DEMO.map(({ id }) => id), 'pendiente', 'parcial']
  if (!escenariosPermitidos.includes(escenario)) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: 'El escenario de ejemplo no es válido.', fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const validacion = validarImeiDemo(imei)
  if (!validacion.ok) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: validacion.error, fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const fechaActual = ahora instanceof Date ? ahora : new Date(ahora)
  const hora = fechaActual.toISOString()
  const blacklist = escenario === 'blacklist'
  const pendiente = escenario === 'pendiente'
  const parcial = escenario === 'parcial'
  const estado = ESTADOS_ESCENARIO[escenario]
  const campos = blacklist
    ? camposDeEscenario(escenario, hora, fechaActual)
    : pendiente
    ? [{ clave: 'estado', etiqueta: 'Estado', valor: 'Resultado pendiente en este ejemplo', fuente: FUENTE_DEMO, hora: null }]
    : parcial
      ? [
          ...[CAMPOS_LIMPIOS[0], CAMPOS_LIMPIOS[1]].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora })),
          { clave: 'resto', etiqueta: 'Resto de la ficha', valor: 'Sin dato en este ejemplo', fuente: FUENTE_DEMO, hora },
        ]
      : camposDeEscenario(escenario, hora, fechaActual)
  return {
    estado: pendiente ? 'pendiente' : parcial ? 'parcial' : 'verificado',
    etiqueta: pendiente ? NO_VERIFICADO : parcial ? 'Parcial' : estado.etiqueta,
    tono: pendiente || parcial ? 'neutral' : estado.tono,
    motivo: pendiente ? 'El resultado de este ejemplo todavía no está confirmado.' : parcial ? 'Este ejemplo contiene campos sin datos.' : typeof estado.motivo === 'function' ? estado.motivo(fechaActual) : estado.motivo,
    recomendacion: pendiente || parcial ? 'Esperar un resultado completo antes de tomar una decisión.' : estado.recomendacion,
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
  const resultadoPorEscenario = {
    blacklist: 'con reporte de blacklist',
    operadora: 'con bloqueo de operadora',
    tigo: 'con bloqueo de operadora Tigo',
    'garantia-apple-vigente': 'con garantía Apple vigente',
    'garantia-apple-vencida': 'con garantía Apple vencida',
  }
  const resultado = resultadoPorEscenario[consulta.escenario] || (consulta.estado === 'verificado' ? 'sin reportes' : 'pendiente de confirmar')
  return `IMEI verificado: ${resultado} al ${fecha} — fuente ${FUENTE_DEMO}`
}
