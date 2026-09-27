import { NavegacionSeccion } from 'owncoding-ui'
import { useMenuConfigColapsado } from '@/lib/menuConfig'
import { grupoConfig } from './gruposConfig'

// Adaptador (#267/#253): el riel de secciones (colapso a íconos, tira
// horizontal en mobile, centrado del activo y descripción del grupo) vive en
// la biblioteca. Acá queda la preferencia del dispositivo
// (`useMenuConfigColapsado`, último usado) y el catálogo de los 7 grupos.
export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const [colapsado, setColapsado] = useMenuConfigColapsado()
  const grupos = items.map(([id, label]) => ({ id, label, ...(grupoConfig(id) || {}) }))

  return (
    <NavegacionSeccion
      items={grupos}
      value={value}
      onChange={onChange}
      colapsado={colapsado}
      onToggle={() => setColapsado(!colapsado)}
      ariaLabel="Secciones de Configuración"
      textoExpandir="Expandir el menú de Configuración"
      textoColapsar="Colapsar el menú de Configuración"
      testId="config-grupos"
      testIdDescripcion="config-grupo-descripcion"
    >
      {children}
    </NavegacionSeccion>
  )
}
