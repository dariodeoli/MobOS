// Foto local del catálogo/pedidos del POS: se guarda tras cada hidratación
// exitosa y se usa cuando la API no responde al arrancar, así el vendedor puede
// seguir armando ventas sin conexión. Se guarda por empresa: nunca se mezcla
// información entre tiendas.
import { crearStoreDeSnapshots } from './idb'

const VERSION = 1
const clave = (empresaId) => `catalogo:${empresaId}`

export async function guardarSnapshotCatalogo(empresaId, datos) {
  if (!empresaId || !datos) return false
  try {
    await crearStoreDeSnapshots().guardar(clave(empresaId), { version: VERSION, ...datos })
    return true
  } catch {
    return false
  }
}

export async function leerSnapshotCatalogo(empresaId) {
  if (!empresaId) return null
  try {
    const fila = await crearStoreDeSnapshots().leer(clave(empresaId))
    if (!fila?.datos || fila.datos.version !== VERSION) return null
    return fila.datos
  } catch {
    return null
  }
}

export async function borrarSnapshotCatalogo(empresaId) {
  if (!empresaId) return
  try { await crearStoreDeSnapshots().borrar(clave(empresaId)) } catch { /* sin IndexedDB */ }
}
