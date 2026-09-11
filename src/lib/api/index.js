export { api, request, API_URL } from './client'
export { ApiError, isApiError } from './errors'
export { clearSession, getAccessToken, setAccessToken, sessionApi } from './session'

export const resources = {
  customers: { list: (q = '') => api.get(`/api/customers?q=${encodeURIComponent(q)}`), create: data => api.post('/api/customers', data) },
  products: { list: (q = '') => api.get(`/api/products?q=${encodeURIComponent(q)}`), create: data => api.post('/api/products', data) },
  stock: { list: () => api.get('/api/stock'), adjust: data => api.patch('/api/stock', data) },
  orders: { list: () => api.get('/api/orders'), create: data => api.post('/api/orders', data) },
  payments: { create: data => api.post('/api/payments', data) },
  users: { list: () => api.get('/api/users'), create: data => api.post('/api/users', data) },
}

export const authApi = {
  pin: (pin) => api.post('/api/auth/pin', { pin }),
}
