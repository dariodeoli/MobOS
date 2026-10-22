// Módulos del negocio (núcleo simple + módulos «pro»). El catálogo y la regla
// viven en backend/lib/modulos-catalogo.mjs, compartidos con el servidor.
import { MODULE_CATALOG, moduloActivo, moduloDef, moduloDePrefijo, leerModuleStore } from '../../backend/lib/modulos-catalogo.mjs'

export { MODULE_CATALOG, moduloActivo, moduloDef, moduloDePrefijo, leerModuleStore }

/**
 * Módulo que controla un id de navegación (navIds) o de pestaña (tabIds);
 * null si el id es del núcleo o no pertenece a ningún módulo.
 */
export function moduloDeVista(id) {
  const def = MODULE_CATALOG.find(modulo => !modulo.nucleo && (modulo.navIds.includes(id) || modulo.tabIds.includes(id)))
  return def ? def.id : null
}

/** true si la vista (ítem de menú o pestaña) se puede mostrar con el estado dado. */
export function vistaActiva(fuente, id, opciones) {
  const modulo = moduloDeVista(id)
  return modulo === null || moduloActivo(fuente, modulo, opciones)
}
