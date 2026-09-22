// Mock funcional del endpoint /api/imei para el modo demo (#219): mismo
// contrato que el backend (precheck → confirmación con requestId → resultado
// normalizado, con idempotencia, registro y esMock), session-only y sin red ni
// cargos. Los seriales de prueba del demo (AUR…) se aceptan como IMEIs válidos
// para que la verificación sea funcional en la demo.
import { guardarDemo, leerDemo } from './demoStorage.js'
import { EQUIPO_DEMO } from './demo/iphones.js'

const KEY = 'mobos:demo-imei-queries:v1'
const SERVICIO = { clave: 'APPLE_BASIC', nombre: 'Apple Basic', precioUsd: 0.06, precioConfirmado: true, campos: ['blacklist actual', 'Find My/iCloud', 'garantía'], serviceId: '1' }

/** Valida como el backend, aceptando además los seriales ficticios del demo. */
export function validarImeiDemo(valor) {
  const limpio = String(valor ?? '').trim().toUpperCase()
  if (!limpio) return { ok: false, error: 'Falta el IMEI.' }
  if (/^AUR[0-9]{13}$/.test(limpio)) return { ok: true, imei: limpio, ficticio: true }
  const imei = limpio.replace(/\D/g, '')
  if (imei.length !== 15) return { ok: false, error: 'El IMEI debe tener 15 dígitos.' }
  let suma = 0
  for (let i = 0; i < 15; i += 1) { let d = Number(imei[14 - i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 } suma += d }
  if (suma % 10 !== 0) return { ok: false, error: 'El IMEI no pasa la verificación de dígito control (Luhn).' }
  return { ok: true, imei, ficticio: false }
}

const enmascarar = (imei) => (String(imei).length <= 4 ? '•'.repeat(String(imei).length) : `${'•'.repeat(String(imei).length - 4)}${String(imei).slice(-4)}`)
const leer = () => { try { const filas = JSON.parse(leerDemo(KEY)); return Array.isArray(filas) ? filas : [] } catch { return [] } }
const guardar = (filas) => guardarDemo(KEY, JSON.stringify(filas))
const semillaDe = (imei) => String(imei).split('').reduce((suma, char) => suma + char.charCodeAt(0), 0)
const verificadorDe = (imei) => EQUIPO_DEMO[semillaDe(imei) % EQUIPO_DEMO.length]

function camposDemo(imei) {
  const semilla = semillaDe(imei)
  const hora = new Date().toISOString()
  return [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: semilla % 5 === 0 ? 'Reportado' : 'Sin reportes actuales', fuente: 'IMEIcheck (demo)', hora },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: semilla % 7 === 0 ? 'On' : 'Off', fuente: 'IMEIcheck (demo)', hora },
    { clave: 'garantia', etiqueta: 'Garantía', valor: semilla % 3 === 0 ? 'Vencida' : 'Vigente', fuente: 'IMEIcheck (demo)', hora: null },
  ]
}

/** Mismo contrato que POST /api/imei, resuelto en el navegador. */
export async function postDemoImei(body = {}) {
  const accion = body.action === 'checks' ? 'checks' : body.action === 'precheck' ? 'precheck' : null
  if (!accion) throw Object.assign(new Error('Acción inválida: usá precheck o checks.'), { status: 400 })
  const validacion = validarImeiDemo(body.imei)
  if (!validacion.ok) throw Object.assign(new Error(validacion.error), { status: 400 })
  const filas = leer()
  if (accion === 'precheck') {
    const reciente = filas.find((fila) => fila.imei === validacion.imei)
    return {
      imei: enmascarar(validacion.imei), servicio: { ...SERVICIO }, requiereConfirmacion: true,
      costoEstimadoUsd: SERVICIO.precioUsd,
      advertencia: reciente ? 'Ya hay una consulta de este servicio para el mismo IMEI en la última jornada (demo).' : null,
      reciente: reciente ? { id: reciente.id, status: reciente.status, costUsd: reciente.costUsd, requestedAt: reciente.requestedAt } : null,
      simulado: true, esMock: true,
    }
  }
  if (body.confirm !== true) throw Object.assign(new Error('La consulta necesita confirmación explícita del costo.'), { status: 409, requiereConfirmacion: true, costoEstimadoUsd: SERVICIO.precioUsd })
  const requestId = String(body.requestId || '').trim()
  if (!requestId) throw Object.assign(new Error('Falta requestId para evitar dobles cobros.'), { status: 400 })
  const existente = filas.find((fila) => fila.requestId === requestId)
  if (existente) return { ...existente, repetida: true }
  const verificador = verificadorDe(validacion.imei)
  const consulta = {
    id: `demo-imei-${Date.now().toString(36)}`,
    provider: 'imeicheck.net (demo)', serviceKey: SERVICIO.clave, serviceName: SERVICIO.nombre, serviceId: SERVICIO.serviceId,
    imei: validacion.imei, imeiMasked: enmascarar(validacion.imei), status: 'verificado', etiqueta: 'Verificado',
    costUsd: SERVICIO.precioUsd, requestId, requestedAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
    normalized: camposDemo(validacion.imei), verificador: { id: verificador.id, nombre: verificador.nombre }, simulado: true, esMock: true,
  }
  guardar([consulta, ...filas].slice(0, 50))
  return consulta
}

export function consultasDemoImei(imei = '') {
  const filas = leer()
  return imei ? filas.filter((fila) => fila.imei === String(imei).toUpperCase()) : filas
}

/** Conciliación demo (#233): mismo contrato que la acción admin. */
export function conciliarDemoImei({ requestId, id, status = 'verificado', costUsd = 0.06, resolvedAt = null, externalId = '', normalized = null, note = '' } = {}) {
  const filas = leer()
  const fila = filas.find(item => (requestId && item.requestId === requestId) || (id && item.id === id))
  if (!fila) throw Object.assign(new Error('No se encontró la consulta a conciliar.'), { status: 404 })
  fila.status = status
  fila.etiqueta = status === 'verificado' ? 'Verificado' : status === 'parcial' ? 'Parcial' : 'No verificado'
  fila.costUsd = Number(costUsd) || 0
  if (resolvedAt) fila.resolvedAt = new Date(resolvedAt).toISOString()
  if (externalId) fila.externalId = externalId
  if (Array.isArray(normalized)) fila.normalized = normalized
  fila.conciliatedAt = new Date().toISOString()
  fila.conciliationNote = note
  guardar(filas.map(item => (item.id === fila.id ? fila : item)))
  return fila
}
