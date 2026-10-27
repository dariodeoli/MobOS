// Invitaciones del equipo en la demo (Configuración → Equipo y acceso), con la
// misma forma que `/api/user-invitations`: una pendiente, una vencida y una ya
// aceptada (Marcos Aquino, que hoy figura en el equipo). Se invitan, reenvían
// y revocan en memoria de la pestaña; no sale ningún correo.
import { guardarDemo, leerDemo } from '../demoStorage.js'

const KEY = 'mobos:demo-invitaciones:v1'
const DIA = 86_400_000
const ROLES = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO', 'REPARTIDOR']
const INVITA = 'Hernán Acosta'

const enDias = (dias, ahora) => new Date(ahora + dias * DIA).toISOString()

export function semillaInvitacionesDemo(ahora = Date.now()) {
  return [
    { id: 'demo-inv-lorena', name: 'Lorena Ortiz', email: '35800108@correo.com.py', role: 'CAJERA', status: 'PENDING', inviterName: INVITA, createdAt: enDias(-2, ahora), expiresAt: enDias(5, ahora), resendAvailableAt: enDias(-1, ahora) },
    { id: 'demo-inv-pablo', name: 'Pablo Ruiz Díaz', email: '35800109@correo.com.py', role: 'TECNICO', status: 'EXPIRED', inviterName: INVITA, createdAt: enDias(-12, ahora), expiresAt: enDias(-5, ahora), resendAvailableAt: enDias(-11, ahora) },
    { id: 'demo-inv-marcos', name: 'Marcos Aquino', email: '35800107@correo.com.py', role: 'REPARTIDOR', status: 'ACCEPTED', inviterName: INVITA, createdAt: enDias(-40, ahora), expiresAt: enDias(-33, ahora), resendAvailableAt: enDias(-39, ahora) },
  ]
}

function leer() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (Array.isArray(guardado)) return guardado
  } catch { /* dato dañado: semilla */ }
  return semillaInvitacionesDemo()
}

const escribir = (lista) => { guardarDemo(KEY, JSON.stringify(lista)); return lista }

// Una pendiente cuyo plazo ya pasó se muestra vencida, como en el servidor.
const vigente = (invitacion, ahora) => (invitacion.status === 'PENDING' && new Date(invitacion.expiresAt).getTime() <= ahora ? { ...invitacion, status: 'EXPIRED' } : { ...invitacion })

export function listarInvitacionesDemo(ahora = Date.now()) {
  return leer().map((invitacion) => vigente(invitacion, ahora)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function invitarDemo({ name, email, role } = {}, ahora = Date.now()) {
  const nombre = String(name || '').trim()
  const correo = String(email || '').trim().toLowerCase()
  if (!nombre) throw new Error('Ingresá el nombre del integrante.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Ingresá un correo válido.')
  const lista = leer()
  const activa = lista.map((invitacion) => vigente(invitacion, ahora)).find((invitacion) => invitacion.email === correo && invitacion.status === 'PENDING')
  if (activa) {
    const error = new Error('Ya existe una invitación activa para ese correo.')
    error.details = { invitation: activa }
    throw error
  }
  const invitacion = { id: `demo-inv-${ahora.toString(36)}${lista.length}`, name: nombre, email: correo, role: ROLES.includes(role) ? role : 'VENDEDOR', status: 'PENDING', inviterName: INVITA, createdAt: enDias(0, ahora), expiresAt: enDias(7, ahora), resendAvailableAt: new Date(ahora + 60_000).toISOString() }
  escribir([invitacion, ...lista])
  return { invitation: invitacion, deliveryState: 'sent' }
}

function cambiar(id, cambio, ahora) {
  const lista = leer()
  const actual = lista.find((invitacion) => invitacion.id === id)
  if (!actual) throw new Error('La invitación ya no está disponible.')
  const estado = vigente(actual, ahora).status
  const siguiente = { ...actual, ...cambio(estado) }
  escribir(lista.map((invitacion) => (invitacion.id === id ? siguiente : invitacion)))
  return siguiente
}

export function reenviarInvitacionDemo(id, ahora = Date.now()) {
  const invitacion = cambiar(id, (estado) => {
    if (estado !== 'PENDING') throw new Error('Solo se reenvían invitaciones pendientes.')
    return { expiresAt: enDias(7, ahora), resendAvailableAt: new Date(ahora + 60_000).toISOString() }
  }, ahora)
  return { invitation: invitacion, deliveryState: 'sent' }
}

export function revocarInvitacionDemo(id, ahora = Date.now()) {
  return cambiar(id, (estado) => {
    if (estado !== 'PENDING' && estado !== 'EXPIRED') throw new Error('Esta invitación ya no se puede revocar.')
    return { status: 'REVOKED' }
  }, ahora)
}
