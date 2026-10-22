// Estructura visual de los 9 grupos de Configuración: icono y descripción de
// cada grupo, en un solo módulo. Los rótulos, el orden y la visibilidad salen de
// `SUBPAGINAS.configuracion.tabs` (PanelVendedor): acá vive el detalle que hace
// que cada grupo se reconozca de un vistazo. No duplicar esta lista en
// pantallas ni en docs.
export const GRUPOS_CONFIG = {
  'negocio': { titulo: 'Negocio', icono: 'store', descripcion: 'Datos generales, identidad visual, sucursales, datos fiscales, numeración, políticas y plan.' },
  'modulos': { titulo: 'Módulos', icono: 'grid', descripcion: 'Activá solo las funciones que usa tu negocio. Lo que apagues se oculta; tus datos se conservan.' },
  'equipo': { titulo: 'Equipo y acceso', icono: 'users', descripcion: 'Usuarios, invitaciones, roles y horarios.' },
  'ventas-cobros': { titulo: 'Ventas y cobros', icono: 'tag', descripcion: 'Cotización del dólar, seguro de ventas, límites y fidelización.' },
  'impresion': { titulo: 'Impresión y documentos', icono: 'printer', descripcion: 'Impresoras, puentes, cola e historial, etiquetas, tickets y comprobantes.' },
  'mensajes': { titulo: 'Mensajes y avisos', icono: 'send', descripcion: 'Plantillas de WhatsApp y correo, remitente y avisos al equipo.' },
  'seguridad': { titulo: 'Seguridad', icono: 'shield', descripcion: 'Sesiones, acciones sensibles, exportación y auditoría.' },
  'sistema': { titulo: 'Integraciones y sistema', icono: 'pulse', descripcion: 'Correo saliente, AEX, webhooks, conectores y errores.' },
  'mi-cuenta': { titulo: 'Mi cuenta', icono: 'user', descripcion: 'Tu perfil, tus preferencias y tus sesiones personales.' },
}

export const ORDEN_GRUPOS_CONFIG = [
  'negocio',
  'modulos',
  'equipo',
  'ventas-cobros',
  'impresion',
  'mensajes',
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
