// #253 · Estructura visual de los 7 grupos de Configuración: icono y
// descripción de cada grupo, en un solo módulo. Los rótulos, el orden y la
// visibilidad salen de `SUBPAGINAS.configuracion.tabs` (PanelVendedor): acá
// vive el detalle que hace que cada grupo se reconozca de un vistazo.
// No duplicar esta lista en pantallas ni en docs.
export const GRUPOS_CONFIG = {
  'organizacion': { titulo: 'Organización', icono: 'store', descripcion: 'Datos generales, identidad visual, sucursales, portal de clientes, notificaciones y plan.' },
  'equipo': { titulo: 'Equipo y acceso', icono: 'users', descripcion: 'Usuarios, invitaciones, roles, horarios y comisiones.' },
  'dispositivos': { titulo: 'Impresoras', icono: 'printer', descripcion: 'Impresoras, puentes, cola e historial, etiquetas, tickets y formatos.' },
  'comercial': { titulo: 'Comercial', icono: 'tag', descripcion: 'Listas de precios, seguro de ventas, límites y fidelización.' },
  'seguridad': { titulo: 'Seguridad', icono: 'shield', descripcion: 'Sesiones, acciones sensibles, exportación y auditoría.' },
  'sistema': { titulo: 'Sistema', icono: 'pulse', descripcion: 'Servicios de la empresa: correo saliente, AEX, webhooks y errores.' },
  'mi-cuenta': { titulo: 'Mi cuenta', icono: 'user', descripcion: 'Tu perfil, tus preferencias y tus sesiones personales.' },
}

export const ORDEN_GRUPOS_CONFIG = [
  'organizacion',
  'equipo',
  'dispositivos',
  'comercial',
  'seguridad',
  'sistema',
  'mi-cuenta',
]

export function grupoConfig(id) {
  return GRUPOS_CONFIG[id] || null
}

export function descripcionGrupoConfig(id) {
  return GRUPOS_CONFIG[id]?.descripcion || ''
}
