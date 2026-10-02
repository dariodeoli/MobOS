// Equipo demo (#324): resolución de la persona ficticia detrás de cada acceso.
// La sesión demo y el selector de Equipo leen la MISMA lista (EQUIPO_DEMO), así
// el nombre y el rol del menú siempre coinciden con la fila de Equipo.
// Sin dependencias de React: lo usan sesion.jsx, DemoAccess y los tests.
import { EQUIPO_DEMO } from './iphones.js'
import { ROLE_ORDER } from '../roles.js'

export const ROLES_DEMO = ROLE_ORDER

const porRol = (rol) => EQUIPO_DEMO.find((usuario) => usuario.rol === rol) || null

/** Integrante demo por rol (el primero del equipo con ese rol). */
export function perfilDemoPorRol(rol) {
  return porRol(rol)
}

/** Integrante demo por PIN de acceso (los PINs del equipo son ficticios). */
export function perfilDemoPorPin(pin) {
  const clave = String(pin || '').trim()
  return EQUIPO_DEMO.find((usuario) => usuario.pin === clave) || null
}

/**
 * Resuelve el acceso demo: acepta un integrante, un rol del sistema o un PIN.
 * Sin dato (o con un valor inválido) cae al Vendedor, igual que la sesión vieja.
 */
export function perfilDemo(valor) {
  if (valor && typeof valor === 'object' && valor.id) return valor
  return perfilDemoPorPin(valor) || perfilDemoPorRol(valor) || perfilDemoPorRol('VENDEDOR') || EQUIPO_DEMO[0]
}

// Perfiles visibles en /demo: un acceso por rol con su descripción de producto.
// Los PINs salen de EQUIPO_DEMO (una sola fuente de verdad).
const DESCRIPCIONES = {
  ADMIN: { nombre: 'Dueño', description: 'Operación completa.', permissions: 'Panel general, ventas, stock, caja, compras, garantías y usuarios.' },
  GERENTE: { nombre: 'Gerente', description: 'Conduce la operación.', permissions: 'Ventas, pedidos, catálogo, cobros y descuentos del equipo.' },
  VENDEDOR: { nombre: 'Vendedor', description: 'Ventas y clientes.', permissions: 'Ventas, productos, stock disponible y seguimiento de clientes.' },
  CAJERA: { nombre: 'Caja', description: 'Cobros y conciliación.', permissions: 'Ventas, cobros, conciliación de pagos y consulta de pedidos.' },
  TECNICO: { nombre: 'Técnico', description: 'Taller y servicio.', permissions: 'Recepción, diagnóstico, reparación y entrega de equipos.' },
  REPARTIDOR: { nombre: 'Delivery', description: 'Reparto y rendición.', permissions: 'Pedidos asignados, cobro en la calle y rendición al volver.' },
}

export const PERFILES_DEMO = ROLE_ORDER.map((rol) => {
  const perfil = porRol(rol)
  if (!perfil) return null
  const texto = DESCRIPCIONES[rol]
  return { rol, nombre: texto.nombre, description: texto.description, permissions: texto.permissions, pin: perfil.pin, persona: perfil.nombre }
}).filter(Boolean)
