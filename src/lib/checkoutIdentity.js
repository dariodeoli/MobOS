import { acceptedCustomerIdentity } from './customerIdentity.js'
import { normalizarNombre } from '../utils/nombre.js'

// La identidad fiscal no es un nombre de mostrador ni permite inferir PERSON.
// Los metadatos viven en el formulario/borrador; la API de pedidos admite name.
export function applyCheckoutIdentity(current, result) {
  const official = result?.nameOfficial ?? result?.name
  if (typeof official !== 'string' || !official.trim()) return { ...current, document: result?.fullRuc || current.document }
  return { ...acceptedCustomerIdentity(current, result), name: official,
    displayName: current.displayName ?? current.name ?? '' }
}

export function clearCheckoutIdentity(current) {
  const next = { ...current }
  for (const key of ['nameOfficial', 'identityKind', 'givenNames', 'surnames', 'personConfirmed']) delete next[key]
  return next
}

export function checkoutName(current, fallback = current?.name || '') {
  return typeof current?.nameOfficial === 'string' ? current.nameOfficial : normalizarNombre(fallback)
}

// The order/customer API's visible name is limited to 200 characters. Fiscal
// text can be longer and must never be truncated into this field. A long fiscal
// result therefore requires a separate manual display name before submission.
export function checkoutVisibleName(current, fallback = '') {
  const fiscal = typeof current?.nameOfficial === 'string' ? current.nameOfficial : null
  const manual = typeof current?.displayName === 'string' && current.displayName.trim() ? current.displayName : null
  const name = typeof current?.name === 'string' && current.name.trim() ? current.name : null
  // A short fiscal company name is also a valid visible name. For a long
  // fiscal result, prefer an explicit display name or the caller fallback.
  const candidate = manual || (name && (name !== fiscal || (fiscal && fiscal.trim().length <= 200)) ? name : null) || (fiscal && fiscal.trim().length <= 200 ? fiscal : null) || fallback
  const visible = typeof candidate === 'string' ? candidate.trim() : ''
  if (!visible) throw new Error('Ingresá un nombre visible de hasta 200 caracteres para el cliente.')
  if (visible.length > 200) throw new Error('El nombre visible debe tener hasta 200 caracteres; el nombre fiscal se conserva aparte.')
  return visible
}

export function restoreBillingIdentity(value) {
  if (!value || typeof value !== 'object') return { name: '', document: '' }
  return { ...value, name: typeof value.name === 'string' ? value.name : '',
    document: typeof value.document === 'string' ? value.document : '' }
}

// El nombre visible y la identidad fiscal se envían como campos separados; los
// borradores conservan ambos sin truncar el nombre fiscal.
export function checkoutBillingPayload(current) {
  return {
    ...(current.name?.trim() ? { name: typeof current.nameOfficial === 'string' ? current.nameOfficial : current.name.trim() } : {}),
    ...(current.document?.trim() ? { document: current.document.trim() } : {}),
  }
}
