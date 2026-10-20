import { checkoutVisibleName } from './checkoutIdentity.js'
import { customerIdentityPayload } from './customerIdentity.js'
import { actualizarClienteDemo, buscarClienteDemo } from './demoClientes.js'

// POS demo card writes use the same name/identity admission as real checkout,
// then only the contextual demo store. No API or durable storage participates.
export function guardarFichaClienteDemo(value = {}) {
  const actual = value.id ? buscarClienteDemo(value.id) : null
  if (value.id && !actual) throw new Error('El cliente no está en esta demo. Volvé a seleccionarlo.')
  const identity = customerIdentityPayload(value)
  const name = checkoutVisibleName(value)
  return actualizarClienteDemo({
    ...actual, ...value, ...identity,
    id: actual?.id || `demo-cliente-${crypto.randomUUID()}`,
    name, displayName: name,
    createdAt: actual?.createdAt || new Date().toISOString(),
    demoProfile: actual?.demoProfile || { orders: [], timeline: [], warranties: [], notes: [], followUps: [], notices: [], services: [] },
    phone: String(value.phone || '').trim(),
    email: String(value.email || '').trim(),
    document: String(value.document || '').trim(),
    addresses: Array.isArray(value.addresses) ? value.addresses : actual?.addresses || [],
  })
}
