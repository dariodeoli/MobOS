// Gift cards reales (#280): helpers de cliente y store de la demo. En la demo
// todo vive en memoria de la pestaña (demoStorage) con las mismas formas que el
// API, para que el POS no distinga demo de producción.
import { leerDemo, guardarDemo } from './demoStorage.js'

const KEY = 'mobos:demo-gift-cards:v1'
const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const GIFT_CARD_CODE_LENGTH = 12

/** Normaliza el código tipeado (minúsculas, guiones, O/I/L) al formato canónico. */
export function normalizarCodigoGiftCard(value) {
  if (typeof value !== 'string') return ''
  const limpio = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  const cuerpo = limpio.startsWith('GC') ? limpio.slice(2) : limpio
  if (cuerpo.length !== GIFT_CARD_CODE_LENGTH) return ''
  return `GC-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`
}

export function codigoGiftCardValido(value) {
  return normalizarCodigoGiftCard(value) || ''
}

/** Genera el código de la demo (mismo alfabeto y formato que el backend). */
export function generarCodigoGiftCardDemo() {
  const bytes = new Uint8Array(GIFT_CARD_CODE_LENGTH)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let indice = 0; indice < bytes.length; indice += 1) bytes[indice] = Math.floor(Math.random() * 256)
  let cuerpo = ''
  for (const byte of bytes) cuerpo += ALFABETO_CROCKFORD[byte % ALFABETO_CROCKFORD.length]
  return `GC-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`
}

export function estadoGiftCard(tarjeta) {
  if (!tarjeta) return '—'
  if (tarjeta.status === 'CANCELLED') return 'Anulada'
  if (tarjeta.expiresAt && new Date(tarjeta.expiresAt).getTime() <= Date.now()) return 'Vencida'
  if (Number(tarjeta.balancePyg || 0) <= 0) return 'Agotada'
  return 'Activa'
}

function leer() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    return Array.isArray(guardado?.tarjetas) ? guardado : { tarjetas: [] }
  } catch {
    return { tarjetas: [] }
  }
}

function escribir(store) {
  guardarDemo(KEY, JSON.stringify(store))
  return store
}

function publica(tarjeta) {
  return {
    id: tarjeta.id,
    codeLast4: tarjeta.codeLast4,
    amountPyg: tarjeta.amountPyg,
    balancePyg: tarjeta.balancePyg,
    status: tarjeta.status,
    expiresAt: tarjeta.expiresAt || null,
    note: tarjeta.note || '',
    createdAt: tarjeta.createdAt,
    customer: tarjeta.customerId ? { id: tarjeta.customerId, name: tarjeta.customerName || '' } : null,
  }
}

export function listarGiftCardsDemo() {
  return leer().tarjetas
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map(publica)
}

export function detalleGiftCardDemo(id) {
  const tarjeta = leer().tarjetas.find((fila) => fila.id === id)
  if (!tarjeta) throw new Error('Gift card no encontrada.')
  return { ...publica(tarjeta), movements: tarjeta.movements || [] }
}

export function emitirGiftCardDemo({ amountPyg, customerId = '', customerName = '', accountId = '', accountName = '', note = '', expiresAt = null } = {}) {
  const monto = Number(amountPyg) || 0
  if (!Number.isSafeInteger(monto) || monto <= 0) throw new Error('El monto de la gift card tiene que ser un entero positivo.')
  const code = generarCodigoGiftCardDemo()
  const ahora = new Date().toISOString()
  const tarjeta = {
    id: `demo-gc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    code,
    codeLast4: code.slice(-4),
    amountPyg: monto,
    balancePyg: monto,
    status: 'ACTIVE',
    expiresAt: expiresAt || null,
    note,
    customerId: customerId || '',
    customerName: customerName || '',
    createdAt: ahora,
    updatedAt: ahora,
    movements: [{
      id: `demo-gcm-${Date.now().toString(36)}-emision`,
      kind: 'ISSUE',
      amountPyg: monto,
      balanceAfterPyg: monto,
      accountId: accountId || null,
      accountSnapshot: accountName ? { name: accountName } : null,
      createdAt: ahora,
    }],
  }
  const store = leer()
  escribir({ tarjetas: [tarjeta, ...store.tarjetas] })
  return { ...publica(tarjeta), code }
}

export function buscarGiftCardDemo(code) {
  const normalizado = codigoGiftCardValido(code)
  if (!normalizado) throw new Error('El código de gift card no es válido.')
  const tarjeta = leer().tarjetas.find((fila) => fila.code === normalizado)
  if (!tarjeta) throw new Error('No encontramos una gift card con ese código.')
  const vencida = tarjeta.expiresAt && new Date(tarjeta.expiresAt).getTime() <= Date.now()
  return {
    id: tarjeta.id,
    codeLast4: tarjeta.codeLast4,
    balancePyg: tarjeta.balancePyg,
    status: vencida ? 'EXPIRED' : tarjeta.status,
    expiresAt: tarjeta.expiresAt || null,
    customerName: tarjeta.customerName || null,
  }
}

export function canjearGiftCardDemo({ code, amountPyg, orderId = null, orderNumber = '' } = {}) {
  const normalizado = codigoGiftCardValido(code)
  if (!normalizado) throw new Error('El código de gift card no es válido.')
  const monto = Number(amountPyg) || 0
  if (!Number.isSafeInteger(monto) || monto <= 0) throw new Error('El monto del canje debe ser un entero positivo.')
  const store = leer()
  const indice = store.tarjetas.findIndex((fila) => fila.code === normalizado)
  if (indice < 0) throw new Error('No encontramos una gift card con ese código.')
  const tarjeta = store.tarjetas[indice]
  if (tarjeta.status !== 'ACTIVE') throw new Error('La gift card está anulada.')
  if (tarjeta.expiresAt && new Date(tarjeta.expiresAt).getTime() <= Date.now()) throw new Error('La gift card venció.')
  const saldo = Number(tarjeta.balancePyg) || 0
  if (saldo < monto) throw new Error(`La gift card no tiene saldo suficiente (disponible ${saldo.toLocaleString('es-PY')} Gs).`)
  const saldoDespues = saldo - monto
  const movimientos = [...(tarjeta.movements || []), {
    id: `demo-gcm-${Date.now().toString(36)}-canje`,
    kind: 'REDEEM',
    amountPyg: monto,
    balanceAfterPyg: saldoDespues,
    orderId,
    orderNumber,
    createdAt: new Date().toISOString(),
  }]
  const actualizada = { ...tarjeta, balancePyg: saldoDespues, updatedAt: new Date().toISOString(), movements: movimientos }
  escribir({ tarjetas: store.tarjetas.map((fila, i) => (i === indice ? actualizada : fila)) })
  return { id: tarjeta.id, balanceAfterPyg: saldoDespues }
}

export function anularGiftCardDemo(id) {
  const store = leer()
  const indice = store.tarjetas.findIndex((fila) => fila.id === id)
  if (indice < 0) throw new Error('Gift card no encontrada.')
  const tarjeta = store.tarjetas[indice]
  if (tarjeta.status !== 'ACTIVE') throw new Error('La gift card ya está anulada.')
  const saldo = Number(tarjeta.balancePyg) || 0
  const movimientos = [...(tarjeta.movements || []), {
    id: `demo-gcm-${Date.now().toString(36)}-anulacion`,
    kind: 'CANCEL',
    amountPyg: saldo,
    balanceAfterPyg: 0,
    createdAt: new Date().toISOString(),
  }]
  const actualizada = { ...tarjeta, status: 'CANCELLED', balancePyg: 0, updatedAt: new Date().toISOString(), movements: movimientos }
  escribir({ tarjetas: store.tarjetas.map((fila, i) => (i === indice ? actualizada : fila)) })
  return { id: tarjeta.id, status: 'CANCELLED', balancePyg: 0 }
}
