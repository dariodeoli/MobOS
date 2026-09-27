// #259: búsqueda de proveedores por abreviatura (`code`) o nombre, con los
// últimos usados como predeterminados. La UI vive en
// `components/shared/SupplierCombobox`; acá queda la lógica pura y la
// persistencia del «último usado» (mismo patrón que `lib/ultimoUsado.js`:
// en demo vive en memoria de la pestaña y nada toca la tienda real).
import { borrarDemo, guardarDemo, leerDemo } from './demoStorage.js'

export const MAX_PROVEEDORES_RECIENTES = 6

const claveRecientes = (empresaId) => `mobos:proveedores:recientes:${empresaId || 'sin-empresa'}`

// Comparación sin acentos ni mayúsculas: «IMPORTADORA TECNOLÓGICA» encuentra
// «importadora tecnologica» y la abreviatura «IMPTEC» también.
export function normalizarProveedor(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

// Etiqueta visible: abreviatura + nombre (o lo que haya).
export function etiquetaProveedor(proveedor) {
  const nombre = String(proveedor?.name || proveedor?.nombre || '').trim()
  const codigo = String(proveedor?.code || '').trim()
  if (codigo && nombre) return `${codigo} · ${nombre}`
  return codigo || nombre
}

// Filtro por nombre o abreviatura, parcial y sin acentos.
export function filtrarProveedores(proveedores = [], consulta = '') {
  const termino = normalizarProveedor(consulta)
  if (!termino) return [...proveedores]
  return proveedores.filter((proveedor) =>
    [proveedor?.name, proveedor?.nombre, proveedor?.code]
      .some((valor) => normalizarProveedor(valor).includes(termino)),
  )
}

// Los últimos usados primero (en el orden recordado); el resto por nombre.
export function ordenarConRecientes(proveedores = [], recientes = []) {
  const posicion = new Map(recientes.map((id, indice) => [id, indice]))
  return [...proveedores].sort((a, b) => {
    const posA = posicion.has(a?.id) ? posicion.get(a.id) : Number.POSITIVE_INFINITY
    const posB = posicion.has(b?.id) ? posicion.get(b.id) : Number.POSITIVE_INFINITY
    if (posA !== posB) return posA - posB
    return String(a?.name || a?.nombre || '').localeCompare(String(b?.name || b?.nombre || ''), 'es')
  })
}

// Sugerencias para la lista: acota y deja los recientes arriba. Es lo que se
// muestra al enfocar vacío (predeterminados) y al filtrar.
export function sugerenciasDeProveedores(proveedores = [], recientes = [], limite = 8) {
  return ordenarConRecientes(proveedores, recientes).slice(0, Math.max(0, limite))
}

// ¿El texto tipeado ya identifica a un proveedor del catálogo? (para no ofrecer
// crearlo de nuevo).
export function coincideExacto(proveedores = [], texto = '') {
  const termino = normalizarProveedor(texto)
  if (!termino) return null
  return proveedores.find((proveedor) =>
    normalizarProveedor(proveedor?.name || proveedor?.nombre) === termino || normalizarProveedor(proveedor?.code) === termino,
  ) || null
}

export function leerProveedoresRecientes(empresaId) {
  const guardado = leerDemo(claveRecientes(empresaId))
  if (!guardado) return []
  try {
    const lista = JSON.parse(guardado)
    return Array.isArray(lista) ? lista.filter((id) => typeof id === 'string' && id) : []
  } catch {
    return []
  }
}

export function recordarProveedorReciente(empresaId, id, maximo = MAX_PROVEEDORES_RECIENTES) {
  if (!id) return leerProveedoresRecientes(empresaId)
  const siguiente = [id, ...leerProveedoresRecientes(empresaId).filter((actual) => actual !== id)].slice(0, maximo)
  guardarDemo(claveRecientes(empresaId), JSON.stringify(siguiente))
  return siguiente
}

export function olvidarProveedoresRecientes(empresaId) {
  borrarDemo(claveRecientes(empresaId))
}
