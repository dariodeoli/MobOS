import { Button } from '@/components/ui'
import { textoMostrando } from './paginacion'

// Pie común de los listados densos: «Mostrando X de Y» + paginación o
// «Cargar más». Recibe el resultado de `usePaginaLista`.
export default function PieListado({ lista, etiqueta = 'Paginación del listado', unidad = '', testId = 'pie-listado' }) {
  if (!lista || lista.total === 0) return null
  const sufijo = unidad ? ` ${unidad}` : ''
  if (lista.modo === 'mas') {
    if (lista.total <= lista.size) return null
    return (
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid={testId}>
        <p className="text-xs text-mute" role="status">{textoMostrando(lista.mostrados, lista.total)}{sufijo}</p>
        {lista.hayMas && (
          <Button type="button" variant="outline" className="min-h-11 px-4 text-xs" onClick={lista.cargarMas}>
            Cargar más
          </Button>
        )}
      </div>
    )
  }
  if (lista.paginas <= 1) return null
  return (
    <nav aria-label={etiqueta} className="space-y-1" data-testid={testId}>
      <p className="text-center text-[11px] text-mute">{textoMostrando(lista.mostrados, lista.total)}{sufijo}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={lista.actual === 0} onClick={() => lista.setPagina(lista.actual - 1)}>Anterior</Button>
        <span className="text-xs text-mute" role="status">Página {lista.actual + 1} de {lista.paginas}</span>
        <Button type="button" variant="outline" className="min-h-11" disabled={!lista.hayMas} onClick={() => lista.setPagina(lista.actual + 1)}>Siguiente</Button>
      </div>
    </nav>
  )
}
