import { api } from './client'

export const purchasesApi = {
  list: (q = '') => api.get(`/api/purchases${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (data) => api.post('/api/purchases', data),
  receive: (id) => api.patch('/api/purchases', { id, action: 'receive' }),
  pay: (id, data) => api.patch('/api/purchases', { id, action: 'pay', ...data }),
  advance: (id, data) => api.patch('/api/purchases', { id, action: 'advance', ...data }),
  updateCosts: (id, lines) => api.patch('/api/purchases', { id, action: 'update-costs', lines }),
}
