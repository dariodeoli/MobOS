// Adaptador aislado de IMEIcheck.net (#193) — FASE 1: MODO MOCK.
//
// Reglas duras:
// - Único lugar del repo que conoce la URL y el Bearer. El token se lee de
//   `process.env.IMEICHECK_TOKEN` (secreto de servidor; debe coincidir con la
//   variable IMEICHECK_TOKEN de Coolify › mobos-api): nunca al navegador,
//   nunca al repositorio y nunca a los logs (los errores se redactan).
// - Por defecto NO se hacen llamadas reales. Una consulta paga exige
//   `IMEICHECK_LIVE=1` *y* token; sin eso responde un mock determinista.
// - El IMEI se valida ANTES de cualquier llamada.
// - Pendiente, fallido o sin dato = "No verificado". Jamás "Limpio".
//
// Los `serviceId` y precios reales salen del catálogo de la cuenta
// (`GET /services`): acá viven solo las claves de flujo y el precio de
// referencia, nunca un ID inventado.

const BASE_URL = 'https://api.imeicheck.net/v1'
const TIMEOUT_MS = 8000

export const PROVEEDOR = 'imeicheck.net'

// Flujo por defecto. `precioConfirmado` marca lo único comprobado con un cargo
// real (Apple Basic USD 0,06); el resto son precios de referencia de la cuenta
// que hay que validar contra el catálogo autenticado antes de mostrarlos como coste.
export const SERVICIOS: Record<string, { nombre: string; precioUsd: number; precioConfirmado: boolean; campos: string[]; serviceId: string | null }> = {
  // IDs LIVE relevados de la cuenta (2026-09-21). NO usar los IDs 12-15
  // (Sandbox, 0,00): devuelven datos aleatorios y no existen en Live.
  APPLE_BASIC: { nombre: 'Apple Basic', precioUsd: 0.06, precioConfirmado: true, campos: ['blacklist actual', 'Find My/iCloud', 'garantía'], serviceId: '1' },
  APPLE_ADVANCED: { nombre: 'Apple Advanced', precioUsd: 0.12, precioConfirmado: false, campos: ['blacklist actual', 'operador', 'fecha de bloqueo'], serviceId: '2' },
  FULL_MDM: { nombre: 'Apple Full + MDM', precioUsd: 0.90, precioConfirmado: false, campos: ['MDM', 'Find My/iCloud', 'blacklist'], serviceId: '3' },
  BLACKLIST_PRO: { nombre: 'Blacklist Pro (historial)', precioUsd: 0.10, precioConfirmado: false, campos: ['historial de reportes', 'operador', 'fecha'], serviceId: '16' },
  FIND_MY: { nombre: 'Find My / iCloud', precioUsd: 0.01, precioConfirmado: false, campos: ['Find My/iCloud'], serviceId: '18' },
  IDENTIFICACION: { nombre: 'Marca, modelo y fabricante', precioUsd: 0.01, precioConfirmado: false, campos: ['marca', 'modelo', 'fabricante'], serviceId: '22' },
}

// IDs que NUNCA van a Live: 12-15 son de Sandbox (0,00, datos aleatorios).
export const IDS_SANDBOX = ['12', '13', '14', '15']

export type EscenarioMock = 'ok' | 'parcial' | 'pendiente' | 'timeout' | 'sin-saldo' | 'no-autorizado' | 'imei-invalido'
export type EstadoConsulta = 'verificado' | 'parcial' | 'pendiente' | 'fallido'
export type CampoVerificacion = { clave: string; etiqueta: string; valor: string | null; fuente: string; hora: string | null }

export const NO_VERIFICADO = 'No verificado'

/** IMEI de 15 dígitos con checksum Luhn. Se valida antes de llamar. */
export function validarImei(valor: unknown): { ok: true; imei: string } | { ok: false; error: string } {
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

/** El IMEI completo nunca se guarda ni se muestra en claro en pantallas. */
export function enmascararImei(imei: string, visibles = 4): string {
  const limpio = String(imei ?? '')
  if (limpio.length <= visibles) return '•'.repeat(limpio.length)
  return `${'•'.repeat(limpio.length - visibles)}${limpio.slice(-visibles)}`
}

/** Traduce el estado del proveedor a nuestro contrato; lo no verificado no es "Limpio". */
export function estadoDeConsulta(status: unknown): EstadoConsulta {
  const valor = String(status ?? '').toLowerCase()
  if (['done', 'completed', 'success', 'finished'].includes(valor)) return 'verificado'
  if (['partial', 'incomplete'].includes(valor)) return 'parcial'
  if (['pending', 'processing', 'queued'].includes(valor)) return 'pendiente'
  return 'fallido'
}

export const etiquetaEstado = (estado: EstadoConsulta) => (estado === 'verificado' ? 'Verificado' : estado === 'parcial' ? 'Parcial' : NO_VERIFICADO)

/** Normaliza la respuesta del proveedor a los campos que muestra la UI. */
export function normalizarRespuesta(payload: unknown, { fuente = PROVEEDOR, hora = new Date().toISOString() } = {}): CampoVerificacion[] {
  const raiz = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>
  const props = (raiz.properties && typeof raiz.properties === 'object' ? raiz.properties : raiz) as Record<string, any>
  const tomar = (...claves: string[]) => {
    for (const clave of claves) if (props[clave] !== undefined && props[clave] !== null && props[clave] !== '') return props[clave]
    return null
  }
  const texto = (valor: unknown) => (valor === null || valor === undefined ? null : String(valor))
  const campos: CampoVerificacion[] = []
  const agregar = (clave: string, etiqueta: string, valor: unknown, conHora = true) => campos.push({ clave, etiqueta, valor: texto(valor), fuente, hora: conHora ? hora : null })
  // Blacklist actual (estado del equipo hoy) vs historial Pro (reportes previos).
  const blacklist = tomar('blacklistStatus', 'blacklist', 'isBlacklisted')
  agregar('blacklist', 'Blacklist actual', blacklist === null ? null : blacklist === true || /black|reported|blocked/i.test(String(blacklist)) ? 'Reportado' : 'Sin reportes actuales')
  agregar('blacklistHistorial', 'Historial Blacklist Pro', tomar('blacklistHistory', 'reportedHistory', 'history'))
  agregar('findMy', 'Find My / iCloud', tomar('findMyStatus', 'iCloudLock', 'icloud', 'findMy') ?? (raiz.service?.toLowerCase?.().includes('apple') ? undefined : null))
  agregar('simLock', 'SIM lock', tomar('simLock', 'simLockStatus', 'carrierLock'))
  agregar('mdm', 'MDM', tomar('mdmStatus', 'mdm'))
  agregar('garantia', 'Garantía', tomar('warrantyStatus', 'warranty', 'estimatedPurchaseDate'), false)
  // El US Block es un estado del operador estadounidense: no se convierte en estado mundial.
  const usBlock = tomar('usBlockStatus', 'usBlock')
  if (usBlock !== null) campos.push({ clave: 'usBlock', etiqueta: 'Bloqueo operador EE.UU. (no es estado mundial)', valor: texto(usBlock), fuente, hora })
  return campos
}

// Respuestas simuladas, deterministas por escenario (sin red).
function mock(escenario: EscenarioMock, imei: string) {
  const base = { id: `mock-${imei.slice(-6)}`, service: 'Apple Basic (mock)', amount: '0.06', imei }
  switch (escenario) {
    case 'ok': return { status: 'done', ...base, properties: { blacklistStatus: 'Clean', findMyStatus: 'Off', simLock: 'Unlocked', warrantyStatus: 'Expired', model: 'iPhone 13', manufacturer: 'Apple', estimatedPurchaseDate: '2022-03-01' } }
    case 'parcial': return { status: 'partial', ...base, properties: { blacklistStatus: 'Clean', model: 'iPhone 13' } }
    case 'pendiente': return { status: 'pending', ...base, properties: {} }
    case 'timeout': return { status: 'failed', ...base, properties: {}, error: 'timeout del proveedor' }
    case 'sin-saldo': return { status: 'failed', ...base, properties: {}, error: 'saldo insuficiente' }
    case 'no-autorizado': return { status: 'failed', ...base, properties: {}, error: 'no autorizado' }
    default: return { status: 'failed', ...base, properties: {}, error: 'IMEI inválido' }
  }
}

// Redacta cualquier aparición del token en un texto de error.
const redactar = (texto: string) => texto.replace(/[A-Za-z0-9._-]{16,}/g, '«dato-redactado»')

export async function consultarImei(input: { imei: unknown; servicio: keyof typeof SERVICIOS | string; escenario?: EscenarioMock }): Promise<{ estado: EstadoConsulta; etiqueta: string; campos: CampoVerificacion[]; crudo: unknown; costoUsd: number; esMock: boolean; error?: string }> {
  const servicio = SERVICIOS[input.servicio] ?? SERVICIOS.APPLE_BASIC
  const validacion = validarImei(input.imei)
  // Fase 1: sin escenario explícito se simula una consulta exitosa.
  const escenario: EscenarioMock = validacion.ok ? input.escenario ?? 'ok' : 'imei-invalido'
  if (!validacion.ok && !input.escenario) {
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, campos: normalizarRespuesta({}), crudo: null, costoUsd: 0, esMock: true, error: validacion.error }
  }
  const token = process.env.IMEICHECK_TOKEN || ''
  const enVivo = process.env.IMEICHECK_LIVE === '1' && Boolean(token)
  // Fase 1: sin `IMEICHECK_LIVE=1` no hay ninguna llamada real, aunque haya token.
  if (!enVivo) {
    const simulado = mock(escenario, validacion.ok ? validacion.imei : String(input.imei ?? ''))
    const estado = estadoDeConsulta(simulado.status)
    return { estado, etiqueta: etiquetaEstado(estado), campos: normalizarRespuesta(simulado), crudo: simulado, costoUsd: estado === 'verificado' || estado === 'parcial' ? servicio.precioUsd : 0, esMock: true }
  }
  if (!validacion.ok) return { estado: 'fallido', etiqueta: NO_VERIFICADO, campos: normalizarRespuesta({}), crudo: null, costoUsd: 0, esMock: false, error: validacion.error }
  if (!servicio.serviceId) return { estado: 'fallido', etiqueta: NO_VERIFICADO, campos: normalizarRespuesta({}), crudo: null, costoUsd: 0, esMock: true, error: `El servicio «${servicio.nombre}» no tiene serviceId Live cargado: se toma del catálogo de la cuenta (GET /services).` }
  try {
    const respuesta = await fetch(`${BASE_URL}/checks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ deviceId: validacion.imei, serviceId: servicio.serviceId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = await respuesta.json().catch(() => null)
    if (!respuesta.ok) {
      const mensaje = redactar(String((payload as any)?.message || (payload as any)?.error || `HTTP ${respuesta.status}`))
      const estado: EstadoConsulta = respuesta.status === 402 ? 'fallido' : respuesta.status === 401 || respuesta.status === 403 ? 'fallido' : 'fallido'
      return { estado, etiqueta: NO_VERIFICADO, campos: normalizarRespuesta(payload), crudo: payload, costoUsd: 0, esMock: false, error: mensaje }
    }
    const estado = estadoDeConsulta((payload as any)?.status)
    return { estado, etiqueta: etiquetaEstado(estado), campos: normalizarRespuesta(payload), crudo: payload, costoUsd: estado === 'fallido' ? 0 : servicio.precioUsd, esMock: false, error: (payload as any)?.error ? redactar(String((payload as any).error)) : undefined }
  } catch (causa) {
    const mensaje = causa instanceof Error && causa.name === 'TimeoutError' ? 'El proveedor no respondió a tiempo (timeout).' : redactar(causa instanceof Error ? causa.message : 'Error de red.')
    return { estado: 'fallido', etiqueta: NO_VERIFICADO, campos: normalizarRespuesta({}), crudo: null, costoUsd: 0, esMock: false, error: mensaje }
  }
}
