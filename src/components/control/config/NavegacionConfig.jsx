import { NavegacionSeccion } from 'owncoding-ui'
import { grupoConfig } from './gruposConfig'

// Adaptador (#253): el riel de secciones (tira horizontal en mobile, centrado
// del activo y descripción del grupo) vive en la biblioteca; acá queda el
// catálogo de los 7 grupos.
//
// #298: una sola navegación de Configuración, **siempre con texto**. Se retiró
// el colapso a solo iconos (la navegación sin rótulos no se entendía); el riel
// conserva los testids y el deep link intactos.
export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const grupos = items.map(([id, label]) => ({ id, label, ...(grupoConfig(id) || {}) }))

  return (
    <NavegacionSeccion
      items={grupos}
      value={value}
      onChange={onChange}
      ariaLabel="Secciones de Configuración"
      testId="config-grupos"
      testIdDescripcion="config-grupo-descripcion"
    >
      {children}
    </NavegacionSeccion>
  )
}
