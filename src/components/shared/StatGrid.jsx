import { cn } from '@/lib/utils'

// Tira de KPI compacta (docs/PANTALLAS.md reglas 1-2): 2 columnas en celular,
// 3-6 desde md/xl según `columnas`, gap 8-12px, sin celdas vacías (quien arma
// la tira reparte los tiles con `col-span` para cerrar la última fila).
const COLUMNAS = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-3 xl:grid-cols-5',
  6: 'md:grid-cols-3 xl:grid-cols-6',
}

export default function StatGrid({ children, columnas = 4, testId, className }) {
  return (
    <div data-testid={testId} className={cn('grid grid-cols-2 gap-2 md:gap-3', COLUMNAS[columnas] || COLUMNAS[4], className)}>
      {children}
    </div>
  )
}
