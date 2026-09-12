import { api } from './client'

export const suppliersApi = {
  list: () => api.get('/api/suppliers'),
  create: (data) => api.post('/api/suppliers', data),
  update: (id, data) => api.patch('/api/suppliers', { id, ...data }),
}
