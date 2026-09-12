import { api } from './client'

export const purchasesApi = {
  list: () => api.get('/api/purchases'),
  create: (data) => api.post('/api/purchases', data),
  receive: (id) => api.patch('/api/purchases', { id, action: 'receive' }),
  pay: (id, data) => api.patch('/api/purchases', { id, action: 'pay', ...data }),
}
