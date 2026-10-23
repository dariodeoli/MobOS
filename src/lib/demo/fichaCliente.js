// Demo · acciones de la ficha de cliente. Cada acción escribe en la ficha de la
// sesión (memoria de la pestaña, vía actualizarClienteDemo) y la ficha se vuelve
// a leer igual que con el backend: etiquetas, direcciones, condiciones
// comerciales, notas, seguimientos, puntos y solicitudes. Se reinicia al salir.
import { actualizarClienteDemo, buscarClienteDemo } from '../demoClientes.js'
import { crearAutorizacionDemo, resolverAutorizacionDemo } from '../demoAutorizaciones.js'
import { identidadesFacturacionDemo } from '../demoBillingIdentities.js'
import { guardarDemo } from '../demoStorage.js'

const USUARIO = { id: 'demo-user', name: 'Equipo demo' }
const ahora = () => new Date().toISOString()
const nuevoId = (prefijo) => `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

function editar(id, mutar) {
  const base = buscarClienteDemo(id)
  if (!base) throw new Error('La ficha demo no existe.')
  const copia = JSON.parse(JSON.stringify(base))
  copia.demoProfile = copia.demoProfile || {}
  mutar(copia)
  return actualizarClienteDemo(copia)
}

/** PATCH /api/customers/:id: aplica los campos tal cual (tags, addresses, condiciones, notas…). */
export const patchClienteDemo = (id, cambios) => editar(id, (c) => {
  Object.assign(c, cambios)
  if (Array.isArray(cambios.addresses)) c.addresses = cambios.addresses.map((a, i) => ({ id: a.id || nuevoId('demo-dir'), ...a, isDefault: Boolean(a.isDefault) || (i === 0 && !cambios.addresses.some((x) => x.isDefault)) }))
})

export const agregarNotaClienteDemo = (id, content) => editar(id, (c) => {
  c.demoProfile.notes = [{ id: nuevoId('demo-nota'), content, createdAt: ahora(), user: USUARIO }, ...(c.demoProfile.notes || [])]
})
export const editarNotaClienteDemo = (id, notaId, content) => editar(id, (c) => {
  c.demoProfile.notes = (c.demoProfile.notes || []).map((n) => (n.id === notaId ? { ...n, content } : n))
})
export const borrarNotaClienteDemo = (id, notaId) => editar(id, (c) => {
  c.demoProfile.notes = (c.demoProfile.notes || []).filter((n) => n.id !== notaId)
})

export const agregarSeguimientoDemo = (id, { kind = 'CALL', note, dueAt }) => editar(id, (c) => {
  c.demoProfile.followUps = [{ id: nuevoId('demo-seg'), kind, note, dueAt: dueAt || null, doneAt: null, createdAt: ahora(), user: USUARIO }, ...(c.demoProfile.followUps || [])]
})
export const completarSeguimientoDemo = (id, segId) => editar(id, (c) => {
  c.demoProfile.followUps = (c.demoProfile.followUps || []).map((s) => (s.id === segId ? { ...s, doneAt: ahora() } : s))
})
export const borrarSeguimientoDemo = (id, segId) => editar(id, (c) => {
  c.demoProfile.followUps = (c.demoProfile.followUps || []).filter((s) => s.id !== segId)
})

/** Canje de puntos: pasan a saldo a favor del cliente. */
export function canjearPuntosDemo(id, pointsPyg) {
  const actual = Number(buscarClienteDemo(id)?.puntosPyg || 0)
  if (pointsPyg > actual) throw new Error('El cliente no tiene esa cantidad de puntos.')
  const ficha = editar(id, (c) => {
    c.puntosPyg = actual - pointsPyg
    c.saldoFavorPyg = Number(c.saldoFavorPyg || 0) + pointsPyg
    c.demoProfile.loyaltyMovements = [{ id: nuevoId('demo-punto'), kind: 'REDEEM', pointsPyg: -pointsPyg, note: 'Canje como saldo a favor', createdAt: ahora() }, ...(c.demoProfile.loyaltyMovements || [])]
  })
  return { pointsPyg: ficha.puntosPyg }
}

/** Fidelización de la ficha demo con la forma de GET /api/customers/:id/loyalty. */
export function fidelizacionDemo(id) {
  const c = buscarClienteDemo(id) || {}
  const movimientos = c.demoProfile?.loyaltyMovements || []
  const base = Number(c.puntosPyg || 0) > 0 || movimientos.length
    ? [{ id: `${id}-puntos-venta`, kind: 'EARN', pointsPyg: Number(c.puntosPyg || 0) - movimientos.reduce((s, m) => s + m.pointsPyg, 0), note: 'Puntos por compras', createdAt: c.createdAt || ahora() }]
    : []
  return { pointsPyg: Number(c.puntosPyg || 0), loyaltyPct: 1, movements: [...movimientos, ...base.filter((m) => m.pointsPyg > 0)] }
}

/** Solicitudes comerciales (mayorista, crédito, días) de una ficha. */
export function solicitarCondicionDemo(cliente, { kind, requestedValue = {}, note = '' }) {
  return crearAutorizacionDemo({ kind, customer: { id: cliente.id, name: cliente.name }, requestedValue, ...(note ? { note } : {}) })
}

export function resolverSolicitudClienteDemo({ id, action, resolvedValue = {}, resolvedNote = '' }, cliente) {
  const aprobada = action === 'approve'
  const fila = resolverAutorizacionDemo(id, {
    status: aprobada ? 'APPROVED' : 'REJECTED',
    resolvedBy: { name: 'Hernán Acosta' },
    resolvedAt: ahora(),
    ...(aprobada ? { resolvedValue } : {}),
    ...(resolvedNote ? { resolvedNote } : {}),
  })
  if (aprobada && cliente?.id && fila) {
    const cambios = {}
    if (fila.kind === 'WHOLESALE') cambios.pricingTier = 'WHOLESALE'
    if (fila.kind === 'CREDIT' && resolvedValue.creditLimitPyg !== undefined) cambios.creditLimitPyg = resolvedValue.creditLimitPyg
    if (resolvedValue.creditDays !== undefined) cambios.creditDays = resolvedValue.creditDays
    if (Object.keys(cambios).length) patchClienteDemo(cliente.id, cambios)
  }
  return fila
}

// Identidades de facturación: usar como actual y eliminar (el alta/edición ya existe).
const claveIdentidades = (cliente, empresaId) => `mobos:demo-billing-identities:v1:${encodeURIComponent(empresaId || 'demo')}:${encodeURIComponent(cliente.id)}`
export function usarIdentidadActualDemo(cliente, identityId, { empresaId = 'demo' } = {}) {
  const lista = identidadesFacturacionDemo(cliente, { empresaId })
  const elegida = lista.find((i) => i.id === identityId)
  if (!elegida) throw new Error('Identidad no encontrada.')
  guardarDemo(claveIdentidades(cliente, empresaId), JSON.stringify(lista.map((i) => (i.id === identityId ? { ...i, lastUsedAt: ahora() } : i))), { demo: true })
  patchClienteDemo(cliente.id, { billingName: elegida.name, billingDocument: elegida.document })
}
export function eliminarIdentidadFacturacionDemo(cliente, identityId, { empresaId = 'demo' } = {}) {
  const lista = identidadesFacturacionDemo(cliente, { empresaId })
  guardarDemo(claveIdentidades(cliente, empresaId), JSON.stringify(lista.filter((i) => i.id !== identityId)), { demo: true })
}
