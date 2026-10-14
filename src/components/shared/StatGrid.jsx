import { cn } from '@/lib/utils'

// Tira de KPI de UNA línea (#388, docs/PANTALLAS.md reglas 1-2): cada `Stat
// compact` es «etiqueta + cifra» en línea, ≤ 64px de alto. En escritorio los
// tiles se reparten el ancho; en celular la tira se desplaza horizontalmente en
// vez de apilarse en 2×2. `columnas` se conserva solo por compatibilidad.
export default function StatGrid({ children, testId, className }) {
  return (
    <div
      data-testid={testId}
      role="group"
      aria-label="Resumen"
      tabIndex={0}
      className={cn('flex min-w-0 items-stretch overflow-x-auto rounded-xl border border-ink-600 bg-ink-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {children}
    </div>
  )
}
