import { api } from './client'
import { isDemoRuntime } from '@/lib/demoMode'

// Cliente de impresión: puentes, impresoras y trabajos de la empresa. Usa la
// sesión normal (cookies HttpOnly); el token del puente nunca pasa por acá.
// Las lecturas evitan la caché corta del cliente donde el backend manda
// (configuración y cola se refrescan a mano).
export const printingApi = {
  // En demo no hay sesión: el listado se responde vacío sin tocar la red
  // (#194). La pantalla de Impresoras usa sus datos ficticios y los flujos que
  // no están disponibles avisan antes de llegar acá.
  trabajos: ({ state, limit, before } = {}) => {
    if (isDemoRuntime) return Promise.resolve({ jobs: [], remoteEnabled: true })
    return consultarTrabajos({ state, limit, before })
  },
  puentes: () => api.get('/api/print/bridges', { cacheMs: 0 }),
  crearPuente: (name, branchId = null) => api.post('/api/print/bridges', { name, ...(branchId ? { branchId } : {}) }),
  actualizarPuente: (id, datos) => api.patch(`/api/print/bridges/${encodeURIComponent(id)}`, datos),
  regenerarCodigo: (id) => api.post(`/api/print/bridges/${encodeURIComponent(id)}/pairing`),
  revocarPuente: (id) => api.delete(`/api/print/bridges/${encodeURIComponent(id)}`),
  impresoras: () => api.get('/api/print/printers', { cacheMs: 0 }),
  // `id` nulo o local (`imp-…`) crea; un id del backend edita.
  guardarImpresora: (id, datos) => (id ? api.patch(`/api/print/printers/${encodeURIComponent(id)}`, datos) : api.post('/api/print/printers', datos)),
  eliminarImpresora: (id) => api.delete(`/api/print/printers/${encodeURIComponent(id)}`),
  importar: (config, { force = false } = {}) => api.post('/api/print/printers/import', { ...config, ...(force ? { force: true } : {}) }),
  encolar: (job) => api.post('/api/print/jobs', job),
  confirmar: (id, suffix) => api.post(`/api/print/jobs/${encodeURIComponent(id)}/confirm`, { suffix }),
  // Cancelación (#128): solo trabajos PENDIENTES; el backend responde 409 si el
  // puente ya los reclamó. En lote, por selección de ids y/o impresora/tipo.
  cancelar: (id) => api.post(`/api/print/jobs/${encodeURIComponent(id)}/cancel`),
  cancelarLote: ({ ids, printerId, kind } = {}) => api.post('/api/print/jobs/cancel', {
    ...(Array.isArray(ids) && ids.length ? { ids } : {}),
    ...(printerId ? { printerId } : {}),
    ...(kind ? { kind } : {}),
  }),
  // Métricas de impresión: rango, impresora y la marca de una corrida de
  // comparativa (prefijo de `reference`). Siempre frescas: alimentan gráficos.
  metricas: ({ desde, hasta, printerId, reference } = {}) => {
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (printerId) params.set('printerId', printerId)
    if (reference) params.set('reference', reference)
    const query = params.toString()
    return api.get(`/api/print/metrics${query ? `?${query}` : ''}`, { cacheMs: 0 })
  },
}

function consultarTrabajos({ state, limit, before } = {}) {
  const params = new URLSearchParams()
  if (state) params.set('state', state)
  if (limit) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const query = params.toString()
  return api.get(`/api/print/jobs${query ? `?${query}` : ''}`, { cacheMs: 0 })
}
