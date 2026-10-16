import { leerDemo, guardarDemo } from './demoStorage.js'

const key = empresaId => `mobos:demo-account-identity:v1:${encodeURIComponent(empresaId || 'mobos-demo')}`
export function leerIdentidadCuentaDemo(empresaId) {
  const value = leerDemo(key(empresaId), { demo: true })
  if (!value) return {}
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Los datos demo de la tienda no son válidos.')
  return parsed
}
export function guardarIdentidadCuentaDemo(empresaId, changes) {
  const next = { ...leerIdentidadCuentaDemo(empresaId) }
  for (const field of ['name', 'email', 'ruc', 'phone', 'city', 'department', 'address', 'nameOfficial']) {
    if (field === 'nameOfficial' && changes[field] === null) delete next[field]
    else if (typeof changes[field] === 'string') next[field] = changes[field]
  }
  guardarDemo(key(empresaId), JSON.stringify(next), { demo: true })
  return next
}
