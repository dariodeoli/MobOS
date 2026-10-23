// Demo · módulos de la sesión. Activar o desactivar un módulo en la demo se
// aplica de verdad (menú, pestañas y pantallas lo respetan) pero solo en
// memoria de la pestaña: nada va a localStorage y al recargar o salir vuelve
// el estado inicial (todo lo disponible activo).
import { estadoDemoModulos } from './modulos.js'

let estado = null
const oyentes = new Set()

/** Estado actual de módulos de la demo (`{ version, preset, modules }`). */
export function estadoModulosSesion() {
  if (!estado) estado = estadoDemoModulos().state
  return estado
}

/** Enciende o apaga un módulo y avisa a quien lo escucha. */
export function cambiarModuloSesion(id, enabled) {
  const actual = estadoModulosSesion()
  estado = {
    ...actual,
    modules: { ...actual.modules, [id]: { ...actual.modules[id], enabled: Boolean(enabled), manuallySelected: true, source: 'manual', updatedAt: new Date().toISOString() } },
  }
  oyentes.forEach(oyente => oyente())
  return estado
}

export function suscribirModulosSesion(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

/** Vuelve al estado inicial (salida de la demo y tests). */
export function reiniciarModulosSesion() {
  estado = null
  oyentes.forEach(oyente => oyente())
}
