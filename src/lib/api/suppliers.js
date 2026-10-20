import { api } from './client'
import { isDemoRuntime } from '../demoMode'
import { listDemoSuppliers, saveDemoSupplier } from '../demoInventory'

// Proveedores: en demo salen del store session-only (#213); con cuenta real van
// al API como siempre.
const demo = (real, local) => (...args) => Promise.resolve(isDemoRuntime ? local(...args) : real(...args))

export const suppliersApi = {
  // Compras can create a supplier immediately before mounting its combobox.
  // Bypass the shared GET cache so the freshly-created tenant-scoped record is
  // available to the picker without requiring a reload or a second search.
  list: demo(() => api.get('/api/suppliers', { cacheMs: 0 }), () => listDemoSuppliers()),
  create: demo(data => api.post('/api/suppliers', data), data => saveDemoSupplier(data)),
  update: demo(data => api.patch('/api/suppliers', data), data => saveDemoSupplier(data)),
  balance: demo(id => api.get(`/api/suppliers/${encodeURIComponent(id)}/balance`), () => null),
}
