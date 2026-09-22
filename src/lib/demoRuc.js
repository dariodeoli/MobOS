// Extractor de RUC de la demo (#234): mismo patrón que el mock de IMEI (#219).
// Resuelve en el navegador, sin llamar a `GET /api/ruc` y sin consumir cuota,
// con una razón social ficticia marcada como simulada. La demo no consulta
// registros reales: el resultado se ofrece y se aplica solo si la persona
// confirma ("Usar estos datos"), nunca pisa lo cargado.
const EMPRESAS_DEMO = [
  'DISTRIBUIDORA DEL SUR S.A.',
  'IMPORTADORA GUARANÍ S.R.L.',
  'COMERCIAL ASUNCIÓN S.A.',
  'TECNOLOGÍA PARAGUAY S.A.',
  'SERVICIOS DEL ESTE S.R.L.',
  'ALIMENTOS DEL CHACO S.A.',
]

// El estado "Consultando…" tiene que verse: la respuesta simulada tarda lo
// mismo que una llamada corta para que la demo muestre el mismo recorrido.
export const DEMO_RUC_DELAY_MS = 400

/** Dígito verificador paraguayo (módulo 11, pesos 2..11 de derecha a izquierda). */
export function digitoVerificadorRuc(base) {
  const digitos = String(base || '').replace(/\D/g, '')
  if (!digitos) return ''
  let suma = 0
  let peso = 2
  for (let indice = digitos.length - 1; indice >= 0; indice -= 1) {
    suma += Number(digitos[indice]) * peso
    peso = peso === 11 ? 2 : peso + 1
  }
  const resto = suma % 11
  return String(resto > 1 ? 11 - resto : 0)
}

/**
 * Valida como el backend (`normalizeRuc`): 5 a 12 dígitos con guion opcional.
 * Devuelve el RUC completo con dígito verificador para mostrarlo tal cual.
 */
export function normalizarRucDemo(valor) {
  const crudo = String(valor ?? '').trim()
  if (!crudo || crudo.length > 32 || /[^0-9.\-\s]/.test(crudo)) return { ok: false, error: 'Ingresá un RUC válido, con o sin puntos y guion.' }
  const compacto = crudo.replace(/[.\s]/g, '')
  if ((compacto.match(/-/g) || []).length > 1) return { ok: false, error: 'Ingresá un RUC válido, con o sin puntos y guion.' }
  const [base, verificador] = compacto.split('-')
  if (!/^\d{5,12}$/.test(base || '') || (verificador !== undefined && !/^\d$/.test(verificador))) return { ok: false, error: 'Ingresá un RUC válido, con o sin puntos y guion.' }
  return { ok: true, base, fullRuc: verificador === undefined ? `${base}-${digitoVerificadorRuc(base)}` : `${base}-${verificador}` }
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

/**
 * Mismo contrato visible que `GET /api/ruc` (el `result` que aplica el campo),
 * resuelto sin red: nombre ficticio estable por RUC, marcado `simulado`.
 */
export async function consultarRucDemo(valor) {
  const normalizado = normalizarRucDemo(valor)
  if (!normalizado.ok) throw new Error(normalizado.error)
  await esperar(DEMO_RUC_DELAY_MS)
  const semilla = normalizado.base.split('').reduce((suma, digito) => suma + Number(digito), 0)
  return {
    name: EMPRESAS_DEMO[semilla % EMPRESAS_DEMO.length],
    fullRuc: normalizado.fullRuc,
    simulado: true,
  }
}
