import { api } from './client'

export const suppliersApi = {
  list: () => api.get('/api/suppliers'),
  create: (data) => api.post('/api/suppliers', data),
  update: (data) => api.patch('/api/suppliers', data),
  balance: (id) => api.get(`/api/suppliers/${encodeURIComponent(id)}/balance`),
}
