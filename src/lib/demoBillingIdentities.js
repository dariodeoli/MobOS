import { leerDemo, guardarDemo } from './demoStorage.js'

// Exclusivamente memoria demo de esta pestaña, incluso en un navegador fuera
// de /demo. No muta seeds, localStorage, el cliente real ni consume API/cupo.
const key = (customer, empresaId) => `mobos:demo-billing-identities:v1:${encodeURIComponent(empresaId || 'demo')}:${encodeURIComponent(customer.id)}`
export function identidadesFacturacionDemo(customer = {}, { empresaId = 'demo' } = {}) {
  let saved
  try { saved = JSON.parse(leerDemo(key(customer, empresaId), { demo: true }) || 'null') } catch { /* seed si no hay memoria válida */ }
  const identities = Array.isArray(saved) ? saved : customer.demoProfile?.billingIdentities || []
  return identities.map(identity => ({ ...identity }))
}

export function guardarIdentidadFacturacionDemo(customer, form, { empresaId = 'demo', actorId = 'demo-user', now = new Date().toISOString(), id = globalThis.crypto.randomUUID() } = {}) {
  if (!customer?.id) throw new Error('Cliente obligatorio.')
  const { name } = form
  const document = typeof form.document === 'string' ? form.document.trim() : ''
  if (typeof name !== 'string' || !name.trim() || name.length > 2000) throw new Error('La razón social es obligatoria (hasta 2000 caracteres).')
  if (!document || document.length > 100) throw new Error('El RUC es obligatorio (hasta 100 caracteres).')
  const identities = identidadesFacturacionDemo(customer, { empresaId })
  const existing = form.id ? identities.find(identity => identity.id === form.id) : null
  if (form.id && !existing) throw new Error('Identidad no encontrada para este cliente.')
  if (identities.some(identity => identity.document === document && identity.id !== existing?.id)) throw new Error('Ya existe una identidad con ese RUC para este cliente.')
  const identity = existing ? { ...existing, name, document, updatedAt: now }
    : { id, customerId: customer.id, name, document, uses: 0, lastUsedAt: null, createdById: actorId, createdAt: now, updatedAt: now }
  guardarDemo(key(customer, empresaId), JSON.stringify(existing ? identities.map(row => row.id === existing.id ? identity : row) : [...identities, identity]), { demo: true })
  return identity
}
