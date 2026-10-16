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

export function restoreBillingIdentity(value) {
  if (!value || typeof value !== 'object') return { name: '', document: '' }
  return { ...value, name: typeof value.name === 'string' ? value.name : '',
    document: typeof value.document === 'string' ? value.document : '' }
}

// Contrato admitido por /api/orders: los metadatos fiscales se conservan en
// borradores, pero nunca se agregan claves que ese endpoint rechaza.
export function checkoutBillingPayload(current) {
  return {
    ...(current.name?.trim() ? { name: typeof current.nameOfficial === 'string' ? current.nameOfficial : current.name.trim() } : {}),
    ...(current.document?.trim() ? { document: current.document.trim() } : {}),
  }
}
