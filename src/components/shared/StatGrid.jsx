import { cn } from '@/lib/utils'

// Grilla de tiles `Stat compact`: 2 columnas en celular, 4 desde md
// (docs/PANTALLAS.md reglas 1-2).
export default function StatGrid({ children, className }) {
  return <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3', className)}>{children}</div>
}
