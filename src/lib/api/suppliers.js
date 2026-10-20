import { api } from './client'
import { isDemoRuntime } from '../demoMode'
import { listDemoSuppliers, saveDemoSupplier } from '../demoInventory'

// Proveedores: en demo salen del store session-only (#213); con cuenta real van
// al API como siempre.
const demo = (real, local) => (...args) => Promise.resolve(isDemoRuntime ? local(...args) : real(...args))

export const suppliersApi = {
  // Mutations through this client invalidate the shared query cache; keep the
  // normal short GET cache for every consumer of the supplier catalog.
  list: demo(() => api.get('/api/suppliers'), () => listDemoSuppliers()),
  create: demo(data => api.post('/api/suppliers', data), data => saveDemoSupplier(data)),
  update: demo(data => api.patch('/api/suppliers', data), data => saveDemoSupplier(data)),
  balance: demo(id => api.get(`/api/suppliers/${encodeURIComponent(id)}/balance`), () => null),
}
