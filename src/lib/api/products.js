import { api } from './client'

export function deleteProductoApi(id) {
  return api.delete(`/api/products?id=${encodeURIComponent(id)}`)
}
