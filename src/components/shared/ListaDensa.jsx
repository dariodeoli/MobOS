import { cn } from '@/lib/utils'
import PieListado from './PieListado'

// Listado denso reutilizable (docs/TABLAS.md): fila compacta en escritorio,
// tarjeta en celular (el CSS de cada pantalla decide la grilla), encabezado
// opcional y pie con «Mostrando X de Y». No carga datos ni toca selección:
// la pantalla pasa `lista` (usePaginaLista) y dibuja cada fila.
export default function ListaDensa({ lista, encabezado = null, renderFila, className, claseFilas = 'space-y-1', testId, etiquetaPie, unidad }) {
  if (!lista || !lista.total) return null
  return (
    <div className={cn('space-y-2', className)}>
      <div data-testid={testId}>
        {encabezado}
        <div className={claseFilas}>{lista.filas.map((fila, indice) => renderFila(fila, lista.inicio + indice))}</div>
      </div>
      <PieListado lista={lista} etiqueta={etiquetaPie} unidad={unidad} />
    </div>
  )
}
