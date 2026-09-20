import { api } from './client'

export const purchasesApi = {
  list: (q = '') => api.get(`/api/purchases${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (data) => api.post('/api/purchases', data),
  receive: (id, lines) => api.patch('/api/purchases', { id, action: 'receive', ...(Array.isArray(lines) ? { lines } : {}) }),
  returnPurchase: (id, data) => api.patch('/api/purchases', { id, action: 'return', ...data }),
  pay: (id, data) => api.patch('/api/purchases', { id, action: 'pay', ...data }),
  advance: (id, data) => api.patch('/api/purchases', { id, action: 'advance', ...data }),
  updateCosts: (id, lines) => api.patch('/api/purchases', { id, action: 'update-costs', lines }),
}
