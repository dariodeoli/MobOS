import { api } from './api/client'
import { isDemoRuntime } from './demoMode'

const ENDPOINT = '/api/payment-accounts'
const DEMO_KEY = 'mobos:demo-payment-accounts:v1'
const KINDS = ['CASH', 'TRANSFER', 'CARD', 'TRADE_IN']
const defaults = { name: '', bank: '', holder: '', accountNumber: '', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0 }
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
    if (['name', 'bank', 'holder', 'accountNumber'].includes(key)) {
      if (typeof value !== 'string') throw new Error('Los datos de la cuenta deben ser texto.')
      result[key] = value.trim()
      if (result[key].length > 200) throw new Error('Cada campo admite hasta 200 caracteres.')
    } else result[key] = value
  }
  if ('name' in result && !result.name) throw new Error('Ingresá un nombre para la cuenta.')
  if ('currency' in result && !['PYG', 'USD', 'BRL', 'EUR', 'USDT'].includes(result.currency)) throw new Error('Elegí una moneda válida.')
  if ('kind' in result && !KINDS.includes(result.kind)) throw new Error('Elegí un medio de pago válido.')
  if ('isActive' in result && typeof result.isActive !== 'boolean') throw new Error('Estado de cuenta inválido.')
  if ('feePercent' in result) {
    const fee = result.feePercent
    if (!['string', 'number'].includes(typeof fee) || String(fee).trim() === '' || !Number.isFinite(Number(fee)) || Number(fee) < 0 || Number(fee) > 100) {
      throw new Error('La comisión debe estar entre 0 y 100%.')
    }
    result.feePercent = Number(fee)
  }
  if (result.kind === 'TRANSFER' && (!partial || ['bank', 'holder', 'accountNumber'].every(key => key in result))) {
    if (!result.bank || !result.holder || !result.accountNumber) throw new Error('Completá banco, titular y número de cuenta para transferencias.')
  }
  if (partial && !Object.keys(result).length) throw new Error('No hay cambios para guardar.')
  return result
}

function saveDemo(accounts) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(accounts)) }
  catch { throw new Error('No se pudieron guardar las cuentas demo en este navegador.') }
  return accounts
}

function readDemo() {
  let raw
  try { raw = localStorage.getItem(DEMO_KEY) }
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
