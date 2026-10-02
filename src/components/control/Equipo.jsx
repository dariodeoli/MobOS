import { useState } from 'react'
import { Subtabs } from '@/components/ui'
import Vendedores from './Vendedores'
import RolesPermisos from './RolesPermisos'
import Config from './Config'

// Equipo y acceso (#299): una sola pantalla con pestañas por tarea.
// Miembros · Invitaciones · Permisos · Rendimiento. Antes era una columna
// única que mezclaba integrantes, metas, historial, invitaciones y la matriz
// de roles; cada pestaña muestra su tarea y nada más.
const SECCIONES = [
  ['miembros', 'Miembros'],
  ['invitaciones', 'Invitaciones'],
  ['permisos', 'Permisos'],
  ['rendimiento', 'Rendimiento'],
]

export default function Equipo() {
  const [vista, setVista] = useState('miembros')
  return (
    <div className="space-y-3" data-testid="equipo-pantalla">
      <Subtabs value={vista} onChange={setVista} items={SECCIONES} ariaLabel="Secciones de Equipo y acceso" className="[&>button]:min-h-11 md:[&>button]:min-h-9" />
      <Vendedores seccion={vista} />
      {vista === 'invitaciones' && <Config seccion="equipo" />}
      {vista === 'permisos' && <RolesPermisos />}
    </div>
  )
}
