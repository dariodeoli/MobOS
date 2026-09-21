import { api } from './api/client'
import { isDemoRuntime } from './demoMode'
import { errorDeMoneda } from './paymentAccountsReglas.js'
import { leerDemo, guardarDemo } from './demoStorage.js'

const ENDPOINT = '/api/payment-accounts'
const DEMO_KEY = 'mobos:demo-payment-accounts:v1'
const KINDS = ['CASH', 'TRANSFER', 'CARD', 'TRADE_IN', 'PIX', 'CRYPTO']
// Etiquetas del medio para listados y buscadores (#142/#141).
export const KIND_LABELS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', PIX: 'Pix', CRYPTO: 'USDT - Cripto', TRADE_IN: 'Canje' }
const CAMPOS_TEXTO = ['name', 'bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel', 'holderId', 'companyId']
const defaults = { name: '', bank: '', holder: '', accountNumber: '', document: '', processor: '', pixKey: '', reference: '', currencyLabel: '', holderId: '', companyId: '', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0, discountPct: 0, settlementDays: 0 }
const seed = [
  { ...defaults, id: 'demo-cash-pyg', name: 'Caja demo · Gs' },
  { ...defaults, id: 'demo-cash-usd', name: 'Caja demo · USD', currency: 'USD' },
  { ...defaults, id: 'demo-transfer', name: 'Transferencia ficticia', kind: 'TRANSFER', bank: 'Banco ficticio demo', holder: 'Comercio ficticio demo', accountNumber: 'DEMO-0001' },
  { ...defaults, id: 'demo-card', name: 'Tarjeta demo', kind: 'CARD' },
  { ...defaults, id: 'demo-trade-in', name: 'Canje demo', kind: 'TRADE_IN' },
]

function validate(data, partial = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Datos de cuenta inválidos.')
  const result = partial ? {} : { ...defaults }
  for (const key of Object.keys(defaults)) {
    if (!Object.hasOwn(data, key)) continue
    const value = data[key]
    if (CAMPOS_TEXTO.includes(key)) {
      // La API devuelve null en los opcionales vacíos: se normaliza a '' (el
      // servidor lo vuelve a guardar como null). El nombre no admite vacío.
      if (value === null && key !== 'name') { result[key] = ''; continue }
      if (typeof value !== 'string') throw new Error('Los datos de la cuenta deben ser texto.')
      result[key] = value.trim()
      const max = key === 'currencyLabel' ? 12 : 200
      if (result[key].length > max) throw new Error(`Cada campo admite hasta ${max} caracteres.`)
    } else result[key] = value
  }
  if ('name' in result && !result.name) throw new Error('Ingresá un nombre para la cuenta.')
  if ('currency' in result && !['PYG', 'USD', 'BRL', 'EUR', 'USDT'].includes(result.currency)) throw new Error('Elegí una moneda válida.')
  if ('kind' in result && !KINDS.includes(result.kind)) throw new Error('Elegí un medio de pago válido.')
  if ('isActive' in result && typeof result.isActive !== 'boolean') throw new Error('Estado de cuenta inválido.')
  for (const [key, mensaje] of [['feePercent', 'La comisión debe estar entre 0 y 100%.'], ['discountPct', 'El descuento debe estar entre 0 y 100%.']]) {
    if (!(key in result)) continue
    const valor = result[key]
    if (!['string', 'number'].includes(typeof valor) || String(valor).trim() === '' || !Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 100) {
      throw new Error(mensaje)
    }
    result[key] = Number(valor)
  }
  if ('settlementDays' in result) {
    const days = Number(result.settlementDays)
    if (!Number.isSafeInteger(days) || days < 0 || days > 90) throw new Error('Los días en acreditarse deben estar entre 0 y 90.')
    result.settlementDays = days
  }
  if (result.kind === 'TRANSFER') {
    // El banco identifica la transferencia. Titular y número se exigen al
    // crear; al editar alcanza el banco para poder renombrar o desactivar una
    // cuenta predeterminada (#118) todavía incompleta.
    if ((!partial || 'bank' in result) && !result.bank) throw new Error('Completá el banco de la transferencia.')
    if (!partial && (!result.holder || !result.accountNumber)) throw new Error('Completá banco, titular y número de cuenta para transferencias.')
  }
  // Cada medio tiene su moneda (#142): Pix en reales, Cripto/USDT en dólares y
  // la transferencia no mezcla USDT (reglas compartidas con el backend, #204).
  const errorMoneda = errorDeMoneda(result.kind, result.currency)
  if (errorMoneda) throw new Error(errorMoneda)
  if (partial && !Object.keys(result).length) throw new Error('No hay cambios para guardar.')
  return result
}

function saveDemo(accounts) {
  try { guardarDemo(DEMO_KEY, JSON.stringify(accounts)) }
  catch { throw new Error('No se pudieron guardar las cuentas demo en este navegador.') }
  return accounts
}

function readDemo() {
  let raw
  try { raw = leerDemo(DEMO_KEY) }
  catch { throw new Error('El almacenamiento local de la demo no está disponible.') }
  if (raw === null) return saveDemo(seed.map(account => ({ ...account })))
  try {
    const accounts = JSON.parse(raw)
    if (!Array.isArray(accounts) || accounts.some(account => !account?.id)) throw new Error()
    return accounts.map(account => ({ ...validate(account), id: account.id }))
  } catch { throw new Error('Las cuentas demo guardadas no son válidas. No se sobrescribieron los datos.') }
}

function accountResponse(payload) {
  const account = payload?.account ?? payload?.data ?? payload
  if (!account || typeof account !== 'object' || Array.isArray(account) || !account.id) throw new Error('La API no devolvió la cuenta guardada.')
  return account
}

/** Promise<Account[]>; incluye cuentas inactivas para conservar sus referencias. */
export async function getPaymentAccounts() {
  if (isDemoRuntime) return readDemo()
  const payload = await api.get(ENDPOINT)
  const accounts = payload?.accounts ?? payload?.data ?? payload
  if (!Array.isArray(accounts)) throw new Error('La API no devolvió una lista de cuentas válida.')
  return accounts
}

/** Promise<Account>; POST /api/payment-accounts con los campos editables. */
export async function createPaymentAccount(data) {
  const values = validate(data)
  if (!isDemoRuntime) return accountResponse(await api.post(ENDPOINT, values))
  const accounts = readDemo()
  const account = { ...values, id: `demo-${globalThis.crypto.randomUUID()}` }
  saveDemo([...accounts, account])
  return account
}

/** Promise<Account>; PATCH /api/payment-accounts con { id, ...data }. Nunca elimina. */
export async function updatePaymentAccount(id, data) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Identificador de cuenta inválido.')
  const values = validate(data, true)
  if (!isDemoRuntime) return accountResponse(await api.patch(ENDPOINT, { ...values, id }))
  const accounts = readDemo()
  const current = accounts.find(account => account.id === id)
  if (!current) throw new Error('La cuenta ya no está disponible.')
  const updated = { ...validate({ ...current, ...values }), id }
  saveDemo(accounts.map(account => account.id === id ? updated : account))
  return updated
}
