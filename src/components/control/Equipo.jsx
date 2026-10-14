import { useState } from 'react'
import { Subtabs } from '@/components/ui'
import Vendedores from './Vendedores'
import RolesPermisos from './RolesPermisos'
import Config from './Config'
import UsuariosTabla from './config/UsuariosTabla'
import { pestanasConIconos } from './config/pestanasConIconos'

// Equipo y acceso (#299, #422): una sola pantalla con pestañas por tarea.
// Usuarios (tabla con estado, rol y seguridad) · Miembros (la ficha de cada
// persona) · Invitaciones · Permisos · Rendimiento. Cada pestaña muestra su
// tarea y nada más.
const SECCIONES = [
  ['usuarios', 'Usuarios'],
  ['miembros', 'Miembros'],
  ['invitaciones', 'Invitaciones'],
  ['permisos', 'Permisos'],
  ['rendimiento', 'Rendimiento'],
]

const ICONOS = { usuarios: 'users', miembros: 'user', invitaciones: 'mail', permisos: 'shield', rendimiento: 'trending' }

export default function Equipo() {
  const [vista, setVista] = useState('usuarios')
  return (
    <div className="space-y-3" data-testid="equipo-pantalla">
      <Subtabs value={vista} onChange={setVista} items={pestanasConIconos(SECCIONES, ICONOS)} ariaLabel="Secciones de Equipo y acceso" className="[&>button]:min-h-11 md:[&>button]:min-h-9" />
      {vista === 'usuarios' && <UsuariosTabla onGestionar={() => setVista('miembros')} onAgregar={() => setVista('invitaciones')} onRoles={() => setVista('permisos')} />}
      {vista !== 'usuarios' && <Vendedores seccion={vista} />}
      {vista === 'invitaciones' && <Config seccion="equipo" />}
      {vista === 'permisos' && <RolesPermisos />}
    </div>
  )
}
