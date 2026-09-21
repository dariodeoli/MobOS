import { api, request, apiFetch, API_URL } from './client'
import { isDemoRuntime } from '@/lib/demoMode'
import { createDemoTransfer, createDemoUnit, listDemoBranches, listDemoLocations, listDemoReservations, listDemoTransfers, listDemoUnits, releaseDemoReservations, reserveDemoUnits, saveDemoLocation, updateDemoUnit, verifyDemoUnit } from '@/lib/demoInventory'
// El módulo de Inventario funciona igual en demo (#213): cuando hay sesión demo
// los recursos leen el store session-only; con cuenta real van al API.
const demo = (real, local) => (...args) => Promise.resolve(isDemoRuntime ? local(...args) : real(...args))
export { api, request, apiFetch, API_URL }
export { ApiError, isApiError } from './errors'
export { clearAccessToken, clearCompanyToken, clearSession, getAccessToken, getCompanyContext, getCompanyToken, setAccessToken, setCompanyToken, sessionApi } from './session'

export const resources = {
  customers: { list: (q = '') => api.get(`/api/customers?q=${encodeURIComponent(q)}`), create: data => api.post('/api/customers', data) },
  products: { list: (q = '') => api.get(`/api/products?q=${encodeURIComponent(q)}`), create: data => api.post('/api/products', data) },
  stock: { list: () => api.get('/api/stock'), adjust: data => api.patch('/api/stock', data) },
  inventoryBranches: { list: demo(() => api.get('/api/inventory-branches'), () => listDemoBranches()) },
  branches: { list: () => api.get('/api/branches'), create: data => api.post('/api/branches', data), update: data => api.patch('/api/branches', data) },
  inventoryUnits: { list: demo((q = '', view = 'active') => api.get(`/api/inventory-units?${new URLSearchParams({ ...(q ? { q } : {}), ...(view !== 'active' ? { view } : {}) })}`), (q = '', view = 'active') => listDemoUnits(q, view)), create: demo(data => api.post('/api/inventory-units', data), data => createDemoUnit(data)), update: demo(data => api.patch('/api/inventory-units', data), data => updateDemoUnit(data)), verify: demo(data => api.post('/api/inventory-units/verify', data), data => verifyDemoUnit(data)) },
  inventoryReservations: { list: demo(() => api.get('/api/inventory-reservations'), () => listDemoReservations()), create: demo(data => api.post('/api/inventory-reservations', data), data => reserveDemoUnits(data)), release: demo(serials => api.patch('/api/inventory-reservations', { action: 'release', serials }), serials => releaseDemoReservations(serials)) },
  stockLocations: { list: demo((branchId = '') => api.get(`/api/stock-locations${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`), (branchId = '') => listDemoLocations(branchId)), create: demo(data => api.post('/api/stock-locations', data), data => saveDemoLocation(data)), update: demo(data => api.patch('/api/stock-locations', data), data => saveDemoLocation(data)) },
  sharedStock: { list: demo(() => api.get('/api/shared-stock'), () => []), mine: demo(() => api.get('/api/shared-stock?mine=true'), () => []), setGrant: demo(data => api.post('/api/shared-stock', data), () => null) },
  tenants: { search: (q = '') => api.get(`/api/tenants?q=${encodeURIComponent(q)}`) },
  transfers: { list: demo(() => api.get('/api/transfers'), () => listDemoTransfers()), create: demo(data => api.post('/api/transfers', data), data => createDemoTransfer(data)), update: demo(data => api.patch('/api/transfers', data), data => data), accessToken: demo((id, regenerate = false) => api.post(`/api/transfers/${encodeURIComponent(id)}/access-token`, { regenerate }), () => ({ publicToken: 'demo-remito' })) },
  combos: { list: (all = false) => api.get('/api/combos' + (all ? '?all=1' : '')), create: data => api.post('/api/combos', data), update: data => api.patch('/api/combos', data) },
  priceLists: { list: () => api.get('/api/price-lists'), create: data => api.post('/api/price-lists', data), update: (id, data) => api.patch(`/api/price-lists/${encodeURIComponent(id)}`, data), deactivate: id => api.delete(`/api/price-lists/${encodeURIComponent(id)}`), pricing: params => api.get(`/api/pricing?${new URLSearchParams(params)}`) },
  quotes: { list: (status = '') => api.get(`/api/quotes${status ? `?status=${status}` : ''}`), create: data => api.post('/api/quotes', data), update: data => api.patch('/api/quotes', data), convert: id => api.post(`/api/quotes/${encodeURIComponent(id)}/convert`, {}), accessToken: (id, regenerate = false) => api.post(`/api/quotes/${encodeURIComponent(id)}/access-token`, { regenerate }) },
  orders: { list: () => api.get('/api/orders'), create: data => api.post('/api/orders', data), get: id => api.get(`/api/orders/${encodeURIComponent(id)}`), updateDelivery: (id, data) => api.patch(`/api/orders/${encodeURIComponent(id)}`, data) },
  payments: { create: data => api.post('/api/payments', data) },
  users: { list: () => api.get('/api/users'), create: data => api.post('/api/users', data) },
  audit: { list: (params = {}) => api.get(`/api/audit?${new URLSearchParams(params)}`) },
  sessions: { list: () => api.get('/api/sessions'), revoke: sessionId => api.delete('/api/sessions', { body: { sessionId } }) },
}

export { presenciaApi } from './presence'
