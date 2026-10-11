import SectionSelector from '@/components/app/SectionSelector'
import { grupoConfig } from './gruposConfig'

export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const group = grupoConfig(value)
  return (
    <>
      <SectionSelector
        items={items}
        value={value}
        onChange={onChange}
        label="Secciones de Configuración"
        testId="config-grupos"
      />
      {group?.descripcion && (
        <p data-testid="config-grupo-descripcion" className="mb-4 text-sm text-mute">
          {group.descripcion}
        </p>
      )}
      {children}
    </>
  )
}
