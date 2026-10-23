import { api } from './client'
import { isDemoRuntime } from '@/lib/demoMode'
import { loadDemoPurchases, payDemoPurchase, receiveDemoPurchaseLines, returnDemoPurchase, updateDemoPurchaseCosts } from '@/lib/demoPurchases'

// En la demo cada operación escribe en las compras de la sesión (memoria de la pestaña).
const demo = (real, local) => (...args) => Promise.resolve(isDemoRuntime ? local(...args) : real(...args))

export const purchasesApi = {
  list: demo((q = '') => api.get(`/api/purchases${q ? `?q=${encodeURIComponent(q)}` : ''}`), () => loadDemoPurchases()),
  create: (data) => api.post('/api/purchases', data),
  receive: demo((id, lines) => api.patch('/api/purchases', { id, action: 'receive', ...(Array.isArray(lines) ? { lines } : {}) }), (id, lines) => receiveDemoPurchaseLines(id, lines)),
  returnPurchase: demo((id, data) => api.patch('/api/purchases', { id, action: 'return', ...data }), (id, data) => returnDemoPurchase(id, data)),
  pay: demo((id, data) => api.patch('/api/purchases', { id, action: 'pay', ...data }), (id, data) => payDemoPurchase(id, data, 'pay')),
  advance: demo((id, data) => api.patch('/api/purchases', { id, action: 'advance', ...data }), (id, data) => payDemoPurchase(id, data, 'advance')),
  updateCosts: demo((id, lines) => api.patch('/api/purchases', { id, action: 'update-costs', lines }), (id, lines) => updateDemoPurchaseCosts(id, lines)),
}
