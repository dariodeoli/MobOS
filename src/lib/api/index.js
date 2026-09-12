export { api, request, API_URL } from './client'
export { ApiError, isApiError } from './errors'
export { clearAccessToken, clearCompanyToken, clearSession, getAccessToken, getCompanyContext, getCompanyToken, setAccessToken, setCompanyToken, sessionApi } from './session'

export const resources = {
  customers: { list: (q = '') => api.get(`/api/customers?q=${encodeURIComponent(q)}`), create: data => api.post('/api/customers', data) },
  products: { list: (q = '') => api.get(`/api/products?q=${encodeURIComponent(q)}`), create: data => api.post('/api/products', data) },
  stock: { list: () => api.get('/api/stock'), adjust: data => api.patch('/api/stock', data) },
  inventoryBranches: { list: () => api.get('/api/inventory-branches') },
  inventoryUnits: { list: (q = '') => api.get(`/api/inventory-units${q ? `?q=${encodeURIComponent(q)}` : ''}`), create: data => api.post('/api/inventory-units', data), update: data => api.patch('/api/inventory-units', data), verify: data => api.post('/api/inventory-units/verify', data) },
  inventoryReservations: { list: () => api.get('/api/inventory-reservations'), create: data => api.post('/api/inventory-reservations', data), release: serials => api.patch('/api/inventory-reservations', { action: 'release', serials }) },
  stockLocations: { list: (branchId = '') => api.get(`/api/stock-locations${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`), create: data => api.post('/api/stock-locations', data), update: data => api.patch('/api/stock-locations', data) },
  sharedStock: { list: () => api.get('/api/shared-stock'), setGrant: data => api.post('/api/shared-stock', data) },
  transfers: { list: () => api.get('/api/transfers'), create: data => api.post('/api/transfers', data) },
  orders: { list: () => api.get('/api/orders'), create: data => api.post('/api/orders', data), get: id => api.get(`/api/orders/${encodeURIComponent(id)}`), updateDelivery: (id, data) => api.patch(`/api/orders/${encodeURIComponent(id)}`, data) },
  payments: { create: data => api.post('/api/payments', data) },
  users: { list: () => api.get('/api/users'), create: data => api.post('/api/users', data) },
}
