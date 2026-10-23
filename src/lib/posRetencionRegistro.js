// Puente sin dependencias entre el POS (que sabe qué IMEI tiene retenidos) y el
// cierre de sesión (que no debe importar componentes). El POS registra cómo
// liberar su carrito; cerrar sesión lo invoca antes de borrar las credenciales.
let liberador = null

export function registrarLiberadorDeRetenciones(fn) {
  liberador = typeof fn === 'function' ? fn : null
  return () => { if (liberador === fn) liberador = null }
}

export function liberarRetencionesAlCerrarSesion() {
  try { liberador?.() } catch (error) { console.error('[retencion] no se pudo liberar al cerrar sesión:', error) }
}
