// #422 · Modelo de la tabla de Usuarios (Equipo y acceso): junta los usuarios
// del equipo con las invitaciones sin responder en una sola lista de filas,
// con su estado, el rol, la sucursal y un aviso de seguridad. Todo sale de
// `/api/users` y `/api/user-invitations`; acá no se inventa ningún dato.
import { etiquetaRol } from '../../../lib/roles.js'

// «Solo POS»: quienes usan el punto de venta y no administran la tienda.
export const ROLES_SOLO_POS = ['VENDEDOR', 'CAJERA']

export const FILTROS_USUARIOS = [
  ['todos', 'Todos'],
  ['activos', 'Activos'],
  ['pendientes', 'Pendientes'],
  ['pos', 'Solo POS'],
]

export const ESTADOS_USUARIO = {
  activo: { etiqueta: 'Activo', color: 'green' },
  inactivo: { etiqueta: 'Inactivo', color: 'slate' },
  suspendido: { etiqueta: 'Suspendido', color: 'orange' },
  pendiente: { etiqueta: 'Pendiente', color: 'blue' },
  vencida: { etiqueta: 'Vencida', color: 'red' },
}

const ESTADO_DE_USUARIO = { ACTIVE: 'activo', INACTIVE: 'inactivo', SUSPENDED: 'suspendido' }

// Aviso de seguridad de un usuario real. Todo usuario del equipo tiene PIN
// (es obligatorio al crearlo), así que el aviso de la tabla es la cuenta
// bloqueada por intentos fallidos.
export function avisoSeguridad(usuario) {
  if (usuario?.isLocked) return 'Cuenta bloqueada por intentos fallidos: se libera sola o con un PIN nuevo.'
  return null
}

export function filasUsuarios({ usuarios = [], invitaciones = [], sucursales = [] } = {}) {
  const nombreSucursal = new Map((sucursales || []).map((s) => [s.id, s.name]))
  const filas = (usuarios || []).map((usuario) => ({
    id: usuario.id,
    tipo: 'usuario',
    nombre: usuario.name || usuario.email || 'Sin nombre',
    correo: usuario.email || '',
    rol: usuario.role,
    rolEtiqueta: etiquetaRol(usuario.role),
    estado: ESTADO_DE_USUARIO[usuario.status] || 'inactivo',
    sucursal: usuario.branchId ? (nombreSucursal.get(usuario.branchId) || 'Sucursal') : 'Todas',
    soloPos: ROLES_SOLO_POS.includes(usuario.role),
    aviso: avisoSeguridad(usuario),
    hasAvatar: Boolean(usuario.hasAvatar),
  }))
  for (const invitacion of invitaciones || []) {
    if (invitacion.status !== 'PENDING' && invitacion.status !== 'EXPIRED') continue
    filas.push({
      id: `inv-${invitacion.id}`,
      tipo: 'invitacion',
      nombre: invitacion.name || invitacion.email,
      correo: invitacion.email || '',
      rol: invitacion.role,
      rolEtiqueta: etiquetaRol(invitacion.role),
      estado: invitacion.status === 'EXPIRED' ? 'vencida' : 'pendiente',
      sucursal: invitacion.branchId ? (nombreSucursal.get(invitacion.branchId) || 'Sucursal') : 'Todas',
      soloPos: ROLES_SOLO_POS.includes(invitacion.role),
      aviso: null,
      hasAvatar: false,
    })
  }
  return filas
}

export function filtrarUsuarios(filas, filtro) {
  const lista = filas || []
  if (filtro === 'activos') return lista.filter((fila) => fila.estado === 'activo')
  if (filtro === 'pendientes') return lista.filter((fila) => fila.estado === 'pendiente' || fila.estado === 'vencida')
  if (filtro === 'pos') return lista.filter((fila) => fila.soloPos && fila.tipo === 'usuario' && fila.estado === 'activo')
  return lista
}

export function contarUsuarios(filas) {
  return Object.fromEntries(FILTROS_USUARIOS.map(([id]) => [id, filtrarUsuarios(filas, id).length]))
}

const celda = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`

// CSV de lo que se está viendo (respeta el filtro activo).
export function csvUsuarios(filas) {
  const encabezado = ['Nombre', 'Correo', 'Rol', 'Estado', 'Sucursal'].map(celda).join(',')
  const cuerpo = (filas || []).map((fila) => [fila.nombre, fila.correo, fila.rolEtiqueta, ESTADOS_USUARIO[fila.estado]?.etiqueta || fila.estado, fila.sucursal].map(celda).join(','))
  return [encabezado, ...cuerpo].join('\r\n')
}
