import Icon from '@/components/shared/Icon'

// #410 · Pestañas internas de Configuración con ícono. `Subtabs` acepta un nodo
// como rótulo: acá se arma sin tocar el componente compartido. El ícono es
// decorativo (el nombre accesible sigue siendo el texto) y la pestaña de
// peligro lleva la marca `config-tab-peligro`, que el CSS pinta en rojo.
export function pestanasConIconos(items, iconos, { peligro } = {}) {
  return items.map(([id, label, contador]) => [
    id,
    <span key={id} className={`inline-flex items-center gap-1.5 ${id === peligro ? 'config-tab-peligro' : ''}`}>
      {iconos[id] && <Icon name={iconos[id]} className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {label}
    </span>,
    contador,
  ])
}
