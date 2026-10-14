import SectionTabs from '@/components/app/SectionTabs'
import { grupoConfig } from './gruposConfig'
import './configTouch.css'

// Configuración: riel vertical a la izquierda desde lg y tira de pestañas con
// scroll debajo de lg. Conserva el testid `config-grupos` y el nombre accesible.
export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const group = grupoConfig(value)
  return (
    <div data-testid="config-pagina" className="config-pagina lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <SectionTabs
        variant="vertical"
        items={items}
        value={value}
        onChange={onChange}
        label="Secciones de Configuración"
        testId="config-grupos"
        className="mb-3 lg:sticky lg:top-4 lg:mb-0 lg:border-b-0"
      />
      <div className="min-w-0">
        {group?.descripcion && (
          <p data-testid="config-grupo-descripcion" className="mb-4 text-sm text-mute">
            {group.descripcion}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
