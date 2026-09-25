// #253 · Estructura visual de los 7 grupos de Configuración: icono y
// descripción de cada grupo, en un solo módulo. Los rótulos, el orden y la
// visibilidad salen de `SUBPAGINAS.configuracion.tabs` (PanelVendedor): acá
// vive el detalle que hace que cada grupo se reconozca de un vistazo.
// No duplicar esta lista en pantallas ni en docs.
export const GRUPOS_CONFIG = {
  'mi-cuenta': { icono: 'user', descripcion: 'Tu perfil, tus preferencias y tus sesiones personales.' },
  'organizacion': { icono: 'store', descripcion: 'Datos de la tienda, identidad visual, titulares y sucursales.' },
  'equipo': { icono: 'users', descripcion: 'Integrantes, invitaciones, roles, horarios y comisiones.' },
  'comercial': { icono: 'tag', descripcion: 'Listas de precios, seguro de ventas, límites y fidelización.' },
  'seguridad': { icono: 'shield', descripcion: 'Sesiones, acciones sensibles, exportación y auditoría.' },
  'dispositivos': { icono: 'printer', descripcion: 'Impresoras, puentes, formatos y diagnóstico.' },
  'sistema': { icono: 'pulse', descripcion: 'Salud del sistema, correo saliente, AEX y webhooks.' },
}

export const ORDEN_GRUPOS_CONFIG = [
  'mi-cuenta',
  'organizacion',
  'equipo',
  'comercial',
  'seguridad',
  'dispositivos',
  'sistema',
]

export function grupoConfig(id) {
  return GRUPOS_CONFIG[id] || null
}

export function descripcionGrupoConfig(id) {
  return GRUPOS_CONFIG[id]?.descripcion || ''
}
