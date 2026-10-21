// #410 · Índice de ajustes de Configuración. Lo usan el buscador del menú de
// Configuración y la búsqueda global (⌘K): un solo lugar con el nombre de cada
// ajuste, sus sinónimos y el camino hasta él. No concede permisos: solo
// filtra lo que el rol ya puede abrir (`roles`), el servidor sigue siendo la
// autoridad.
//
// Entrada: { id, label, section, tab, anchor, synonyms[], roles[] }
//  - section: slug de la sección de Configuración (organizacion, equipo…); si
//    el ajuste vive fuera de Configuración, `vista` + `miga` lo describen.
//  - tab: rótulo de la pestaña interna donde está (o null si es la principal).
//  - anchor: valor de `data-config-anchor` del bloque a resaltar; si el bloque
//    no existe se resalta el encabezado de la pestaña.
//  - roles: 'owner' (dueño/administrador) o 'all' (cualquier rol: lo personal).

export const SECCIONES_CONFIG = {
  negocio: 'Negocio',
  modulos: 'Módulos',
  equipo: 'Equipo y acceso',
  'ventas-cobros': 'Ventas y cobros',
  impresion: 'Impresión y documentos',
  mensajes: 'Mensajes y avisos',
  seguridad: 'Seguridad',
  sistema: 'Integraciones y sistema',
  'mi-cuenta': 'Mi cuenta',
}

const DUENO = ['owner']
const TODOS = ['owner', 'all']

export const INDICE_CONFIG = [
  // Impresión y documentos
  { id: 'impresoras', label: 'Impresoras', section: 'impresion', tab: null, anchor: 'impresoras', synonyms: ['impresora', 'imprimir', 'termica', 'térmica', '58mm', '80mm', 'puente de impresion', 'agente de impresion'], roles: DUENO },
  { id: 'ticket', label: 'Ticket de venta', section: 'impresion', tab: null, anchor: 'ticket', synonyms: ['ticket', 'recibo', 'comprobante', 'plantilla de ticket', 'papel', 'pie del ticket'], roles: DUENO },
  { id: 'etiquetas', label: 'Etiquetas', section: 'impresion', tab: null, anchor: 'etiquetas', synonyms: ['etiqueta', 'gondola', 'góndola', 'codigo de barras', 'precio en estante', 'rotulo'], roles: DUENO },
  { id: 'ruteo-documentos', label: 'Ruteo de documentos', section: 'impresion', tab: null, anchor: 'ruteo', synonyms: ['ruteo', 'que impresora usa', 'documento a impresora', 'por sucursal'], roles: DUENO },
  // Equipo y acceso
  { id: 'costos-vendedor', label: 'Costos visibles para vendedores', section: 'equipo', tab: 'Permisos', anchor: 'costos-vendedor', synonyms: ['costo', 'costos', 'vendedor', 'margen', 'ver costos', 'precio de costo', 'permiso', 'rol'], roles: DUENO },
  { id: 'equipo-usuarios', label: 'Usuarios del equipo', section: 'equipo', tab: 'Usuarios', anchor: 'usuarios', synonyms: ['usuarios', 'tabla de usuarios', 'exportar usuarios', 'agregar usuarios', 'solo pos', 'pendientes', 'activos', 'estado del usuario', 'aviso de seguridad', 'cuenta bloqueada'], roles: DUENO },
  { id: 'permisos-roles', label: 'Roles y permisos', section: 'equipo', tab: 'Permisos', anchor: 'permisos', synonyms: ['rol', 'roles', 'permiso', 'acceso', 'administrador', 'gerente', 'cajero'], roles: DUENO },
  { id: 'equipo-invitar', label: 'Invitar a una persona', section: 'equipo', tab: 'Invitaciones', anchor: 'invitar', synonyms: ['equipo', 'invitar', 'invitacion', 'agregar usuario', 'nuevo integrante', 'sumar persona', 'correo de invitacion'], roles: DUENO },
  { id: 'equipo-miembros', label: 'Integrantes del equipo', section: 'equipo', tab: 'Miembros', anchor: 'miembros', synonyms: ['equipo', 'miembros', 'vendedores', 'empleados', 'horarios', 'comisiones', 'metas', 'pin del vendedor', 'pin'], roles: DUENO },
  { id: 'equipo-rendimiento', label: 'Rendimiento del equipo', section: 'equipo', tab: 'Rendimiento', anchor: 'rendimiento', synonyms: ['rendimiento', 'metas', 'ventas por vendedor', 'ranking'], roles: DUENO },
  // Ventas y cobros
  { id: 'cotizacion-dolar', label: 'Cotización del dólar', section: 'ventas-cobros', tab: null, anchor: 'cotizacion', synonyms: ['cotizacion', 'dolar', 'dólar', 'tipo de cambio', 'usd', 'divisa', 'moneda extranjera', 'reales'], roles: DUENO },
  { id: 'seguro-ventas', label: 'Seguro de ventas', section: 'ventas-cobros', tab: null, anchor: 'seguro', synonyms: ['seguro', 'garantia extendida', 'proteccion', 'cobertura'], roles: DUENO },
  { id: 'limites-autorizaciones', label: 'Límites y autorizaciones', section: 'ventas-cobros', tab: null, anchor: 'limites', synonyms: ['limite', 'descuento maximo', 'autorizacion', 'aprobacion', 'tope de descuento', 'credito'], roles: DUENO },
  { id: 'fidelizacion-mora', label: 'Fidelización y mora', section: 'ventas-cobros', tab: null, anchor: 'fidelizacion', synonyms: ['fidelizacion', 'puntos', 'mora', 'recargo', 'interes', 'cuotas atrasadas'], roles: DUENO },
  // Negocio
  { id: 'datos-generales', label: 'Datos de la tienda', section: 'negocio', tab: 'Datos generales', anchor: 'datos', synonyms: ['nombre de la empresa', 'razon social', 'direccion', 'telefono', 'correo de la tienda', 'datos de la empresa', 'ciudad'], roles: DUENO },
  { id: 'logo-colores', label: 'Logo y colores', section: 'negocio', tab: 'Identidad visual', anchor: 'logo', synonyms: ['logo', 'logotipo', 'colores', 'marca', 'identidad', 'imagen de la empresa', 'color de marca'], roles: DUENO },
  { id: 'sucursales', label: 'Sucursales', section: 'negocio', tab: 'Sucursales y depósitos', anchor: 'sucursales', synonyms: ['sucursal', 'tienda', 'local', 'nueva sucursal', 'casa matriz'], roles: DUENO },
  { id: 'ubicaciones-deposito', label: 'Ubicaciones y depósitos', section: 'negocio', tab: 'Sucursales y depósitos', anchor: 'ubicaciones', synonyms: ['ubicacion', 'ubicaciones', 'deposito', 'depósito', 'almacen', 'bodega', 'estante', 'vitrina'], roles: DUENO },
  { id: 'datos-fiscales', label: 'RUC y timbrado', section: 'negocio', tab: 'Datos fiscales', anchor: 'fiscales', synonyms: ['ruc', 'timbrado', 'datos fiscales', 'razon social', 'factura', 'sifen', 'establecimiento', 'punto de expedicion', 'impuestos', 'iva'], roles: DUENO },
  { id: 'numeracion', label: 'Numeración de pedidos', section: 'negocio', tab: 'Numeración', anchor: 'numeracion', synonyms: ['numeracion', 'numero de pedido', 'prefijo', 'correlativo', 'numero inicial', 'secuencia'], roles: DUENO },
  { id: 'politicas-tienda', label: 'Políticas de la tienda', section: 'negocio', tab: 'Políticas', anchor: 'politicas', synonyms: ['politicas', 'políticas', 'garantia', 'garantía', 'cambios', 'devoluciones', 'envios', 'privacidad', 'terminos', 'términos', 'condiciones', 'contacto', 'pagina publica'], roles: DUENO },
  { id: 'contacto-tienda', label: 'Contacto y dirección de la tienda', section: 'negocio', tab: 'Datos generales', anchor: 'datos', synonyms: ['contacto', 'correo de contacto', 'telefono de la tienda', 'direccion de la tienda', 'informacion comercial', 'pais'], roles: DUENO },
  { id: 'valores-predeterminados', label: 'Moneda, zona horaria y unidades', section: 'negocio', tab: 'Datos generales', anchor: 'predeterminados', synonyms: ['moneda', 'guaranies', 'pyg', 'zona horaria', 'huso horario', 'asuncion', 'unidades', 'sistema metrico', 'valores predeterminados'], roles: DUENO },
  { id: 'formato-pedido', label: 'Formato del ID del pedido', section: 'negocio', tab: 'Datos generales', anchor: 'formato-pedido', synonyms: ['id del pedido', 'formato del pedido', 'prefijo', 'sufijo', 'vista previa', 'numero de pedido'], roles: DUENO },
  { id: 'archivado-pedidos', label: 'Archivar pedidos preparados y pagados', section: 'negocio', tab: 'Datos generales', anchor: 'procesamiento', synonyms: ['archivar', 'archivado automatico', 'pedidos preparados', 'procesamiento de pedidos', 'pedidos pagados', 'preparar automaticamente'], roles: DUENO },
  { id: 'recursos', label: 'Registro de cambios, atajos y actividad', section: 'negocio', tab: 'Datos generales', anchor: 'recursos', synonyms: ['novedades', 'registro de cambios', 'changelog', 'atajos de teclado', 'teclado', 'registro de actividad', 'que hay de nuevo'], roles: DUENO },
  { id: 'sucursales-uso', label: 'Uso de sucursales', section: 'negocio', tab: 'Sucursales y depósitos', anchor: 'sucursales-uso', synonyms: ['sucursales activas', 'cuantas sucursales', 'limite de sucursales', 'sucursales inactivas', 'filtrar sucursales'], roles: DUENO },
  { id: 'portal-saldo', modulo: 'portal-clientes', label: 'Saldo a favor en el portal', section: 'negocio', tab: 'Portal de clientes', anchor: 'portal-saldo', synonyms: ['portal', 'cuentas de cliente', 'saldo a favor', 'credito de tienda', 'ocultar saldo', 'portal de clientes'], roles: DUENO },
  { id: 'portal-url', modulo: 'portal-clientes', label: 'Dirección del portal de clientes', section: 'negocio', tab: 'Portal de clientes', anchor: 'portal-url', synonyms: ['portal', 'url del portal', 'enlace del portal', 'clientes.moboss.online', 'copiar enlace'], roles: DUENO },
  { id: 'notificaciones-remitente', label: 'Correo del remitente', section: 'mensajes', tab: null, anchor: 'notificaciones-remitente', synonyms: ['remitente', 'correo saliente', 'gmail', 'dominio publico', 'correo de la tienda', 'notificaciones'], roles: DUENO },
  { id: 'notificaciones-clientes', label: 'Notificaciones a clientes', section: 'mensajes', tab: null, anchor: 'notificaciones-clientes', synonyms: ['avisos a clientes', 'mensajes a clientes', 'plantillas', 'whatsapp', 'recordatorio de cobro'], roles: DUENO },
  { id: 'notificaciones-equipo', label: 'Notificaciones al equipo', section: 'mensajes', tab: null, anchor: 'notificaciones-equipo', synonyms: ['avisos al equipo', 'empleados', 'notificaciones push', 'avisos de pedidos'], roles: DUENO },
  { id: 'notificaciones-webhooks', label: 'Correo saliente y webhooks', section: 'mensajes', tab: null, anchor: 'notificaciones-webhooks', synonyms: ['webhook', 'webhooks', 'integraciones', 'cola de correo', 'envio de correos'], roles: DUENO },
  { id: 'zona-peligro', label: 'Archivar o eliminar la empresa', section: 'negocio', tab: 'Zona de peligro', anchor: 'peligro', synonyms: ['archivar', 'eliminar empresa', 'borrar empresa', 'cerrar cuenta', 'dar de baja', 'zona de peligro'], roles: DUENO },
  { id: 'modulos', label: 'Módulos', section: 'modulos', tab: null, anchor: 'modulos', synonyms: ['modulo', 'tienda de modulos', 'activar', 'desactivar', 'funciones', 'apps', 'complementos', 'taller', 'delivery', 'trade-in', 'comisiones'], roles: DUENO },
  // Seguridad y auditoría
  { id: 'contrasena-reauth', label: 'Contraseña y acciones sensibles', section: 'seguridad', tab: null, anchor: 'contrasena', synonyms: ['contrasena', 'contraseña', 'password', 'clave', 'reautenticar', 'acciones sensibles', 'confirmar identidad', 'exportar datos'], roles: DUENO },
  { id: 'auditoria', label: 'Historial de actividad', section: 'seguridad', tab: null, anchor: 'auditoria', synonyms: ['auditoria', 'historial', 'registro de cambios', 'quien hizo', 'actividad', 'log'], roles: DUENO },
  // Sistema
  { id: 'estado-sistema', label: 'Estado del sistema', section: 'sistema', tab: null, anchor: 'sincronizacion', synonyms: ['sincronizacion', 'estado', 'salud', 'cola', 'fuera de linea', 'offline', 'webhooks', 'aex', 'correo saliente'], roles: DUENO },
  // Mi cuenta (personal: cualquier rol)
  { id: 'sesiones', label: 'Sesiones y dispositivos', section: 'mi-cuenta', tab: null, anchor: 'sesiones', synonyms: ['sesion', 'sesiones', 'dispositivos', 'cerrar sesion', 'otros equipos', 'pin', 'bloqueo', 'seguridad de la cuenta'], roles: TODOS },
  { id: 'perfil', label: 'Perfil y foto', section: 'mi-cuenta', tab: null, anchor: 'perfil', synonyms: ['perfil', 'mi nombre', 'foto', 'avatar', 'correo', 'mi cuenta'], roles: TODOS },
  { id: 'preferencias', label: 'Preferencias del dispositivo', section: 'mi-cuenta', tab: null, anchor: 'preferencias', synonyms: ['preferencias', 'bloqueo por inactividad', 'notificaciones', 'avisos', 'tema', 'oscuro', 'claro'], roles: TODOS },
  // Fuera de Configuración (se abren en su propia vista)
  { id: 'whatsapp-plantillas', label: 'Plantillas de WhatsApp', section: null, vista: 'plantillas', miga: ['Clientes', 'Plantillas'], tab: null, anchor: 'plantillas', synonyms: ['whatsapp', 'plantilla', 'mensaje', 'mensajes automaticos', 'recordatorio de cobro', 'wsp'], roles: DUENO },
]

// Sin acentos ni mayúsculas, para comparar.
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function ajustePermitido(entrada, { esOwner = false } = {}) {
  return esOwner ? true : entrada.roles.includes('all')
}

// Camino visible: «Configuración › Impresoras».
export function migasAjuste(entrada) {
  if (!entrada.section) return [...(entrada.miga || [])]
  return ['Configuración', SECCIONES_CONFIG[entrada.section], entrada.tab].filter(Boolean)
}

// Puntaje por coincidencia: nombre > sinónimo > camino. Cero = no coincide.
// Todas las palabras de la consulta tienen que aparecer (coincidencia parcial).
function puntaje(entrada, palabras) {
  const nombre = normalizarTexto(entrada.label)
  const sinonimos = entrada.synonyms.map(normalizarTexto)
  const camino = normalizarTexto(migasAjuste(entrada).join(' '))
  let total = 0
  for (const palabra of palabras) {
    let mejor = 0
    if (nombre.startsWith(palabra)) mejor = 6
    else if (nombre.split(/\s+/).some(parte => parte.startsWith(palabra))) mejor = 5
    else if (sinonimos.some(s => s === palabra || s.split(/\s+/).some(parte => parte.startsWith(palabra)))) mejor = 4
    else if (nombre.includes(palabra) || sinonimos.some(s => s.includes(palabra))) mejor = 3
    else if (camino.includes(palabra)) mejor = 1
    if (!mejor) return 0
    total += mejor
  }
  return total
}

// `modulos`: función opcional `(idDeModulo) => boolean`. Un ajuste que pertenece a
// un módulo apagado no se ofrece. Solo resta: nunca concede acceso.
export function buscarAjustes(consulta, { esOwner = false, limite = 8, modulos = null } = {}) {
  const palabras = normalizarTexto(consulta).split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  return INDICE_CONFIG
    .filter(entrada => ajustePermitido(entrada, { esOwner }))
    .filter(entrada => !entrada.modulo || !modulos || modulos(entrada.modulo))
    .map(entrada => ({ entrada, puntos: puntaje(entrada, palabras) }))
    .filter(item => item.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map(item => item.entrada)
}

export function ajustePorId(id) {
  return INDICE_CONFIG.find(entrada => entrada.id === id) || null
}

// Destino para el navegador del panel: `ir(vista, opciones)`.
export function destinoAjuste(entrada, { esOwner = false } = {}) {
  if (!entrada.section) return { vista: entrada.vista, opciones: { ajuste: entrada.id } }
  if (!esOwner || entrada.section === 'mi-cuenta') return { vista: 'mi-cuenta', opciones: { ajuste: entrada.id } }
  return { vista: 'equipo', opciones: { subtab: entrada.section, ajuste: entrada.id } }
}
