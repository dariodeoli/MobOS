import Toolbar from '@/components/shared/Toolbar'
import SearchField from '@/components/shared/SearchField'
import ChipsFiltro from '@/components/ventas/ChipsFiltro'
import '@/components/ventas/ventasF3.css'
import './gestionProfundo.css'

// Barra única de las vistas de gestión (patrón Pedidos/Clientes): búsqueda +
// pestañas de estado + orden + acción primaria en UNA fila. Todo es opcional;
// un hueco vacío no deja contenedor. Solo presentación: el filtrado lo decide
// quien la usa. Estilos en gestionProfundo.css (raíz `.gp`).
export default function BarraGestion({ etiqueta = 'Acciones', testId = 'barra-gestion', buscar, onBuscar, placeholder = 'Buscar', ariaBuscar, tabs, tabsMas, tab, onTab, etiquetaTabs = 'Filtrar', sort, display, primary, more, children }) {
  return (
    <Toolbar
      label={etiqueta}
      lista
      plano
      testId={testId}
      className="ventas-f3-toolbar"
      search={onBuscar ? <SearchField ariaLabel={ariaBuscar || placeholder} placeholder={placeholder} value={buscar} onChange={(event) => onBuscar(event.target.value)} /> : undefined}
      filters={tabs?.length ? <ChipsFiltro className="min-w-0" etiqueta={etiquetaTabs} opciones={tabs} mas={tabsMas} valor={tab} onChange={onTab} /> : undefined}
      sort={sort}
      display={display}
      primary={primary}
      more={more}
    >
      {children}
    </Toolbar>
  )
}
