// Simulación de la consulta de IMEI para la demo (#200/#201).
//
// Mismo contrato que el backend (estados honestos, fuente y hora visibles,
// IMEI enmascarado, nunca "Limpio" si no está verificado), pero sin llamadas ni
// costo. La UI de IMEI (#193/#200) debe usar esto cuando corre en modo demo: no
// se consulta al proveedor ni se cobra nada.

export const FUENTE_DEMO = 'IMEIcheck.net (simulado)'
export const NO_VERIFICADO = 'No verificado'

/** IMEI de 15 dígitos con checksum Luhn (mismo criterio que el backend). */
export function validarImeiDemo(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (!imei) return { ok: false, error: 'Falta el IMEI.' }
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }
  let suma = 0
  for (let i = 0; i < 15; i += 1) {
    let digito = Number(imei[14 - i])
    if (i % 2 === 1) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  if (suma % 10 !== 0) return { ok: false, error: 'El IMEI no pasa la verificación de dígito control (Luhn).' }
  return { ok: true, imei }
}

/** El IMEI completo nunca se muestra en claro. */
export function enmascararImeiDemo(imei, visibles = 4) {
  const limpio = String(imei ?? '')
  if (limpio.length <= visibles) return '•'.repeat(limpio.length)
  return `${'•'.repeat(limpio.length - visibles)}${limpio.slice(-visibles)}`
}

const CAMPOS_OK = [
  ['blacklist', 'Lista negra', 'Sin reportes'],
  ['findmy', 'Find My / iCloud', 'Desactivado'],
  ['garantia', 'Garantía', 'Fuera de garantía'],
]

/**
 * Resultado simulado de la verificación. `escenario` permite mostrar el caso
 * "pendiente" sin mentir: lo no verificado nunca dice "Limpio".
 */
export function consultaImeiDemo(imei, { escenario = 'ok', ahora = new Date() } = {}) {
  const validacion = validarImeiDemo(imei)
  if (!validacion.ok) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, error: validacion.error, fuente: FUENTE_DEMO, esMock: true, simulado: true, costoUsd: 0, campos: [] }
  }
  const hora = ahora.toISOString()
  const pendiente = escenario === 'pendiente'
  const campos = pendiente
    ? [{ clave: 'estado', etiqueta: 'Estado', valor: 'Consulta pendiente en el proveedor', fuente: FUENTE_DEMO, hora: null }]
    : CAMPOS_OK.map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, fuente: FUENTE_DEMO, hora }))
  return {
    estado: pendiente ? 'pendiente' : 'verificado',
    etiqueta: pendiente ? NO_VERIFICADO : 'Verificado',
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
export function notaClienteDemo(consulta) {
  if (!consulta || consulta.estado === 'fallido') return ''
  const fecha = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(consulta.fecha))
  const resultado = consulta.estado === 'verificado' ? 'sin reportes' : 'pendiente de confirmar'
  return `IMEI verificado: ${resultado} al ${fecha} — fuente ${FUENTE_DEMO}`
}
