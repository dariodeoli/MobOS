import { cn } from '@/lib/utils'

// Check de confirmación que se dibuja (#371): aro + trazo en ~0.7 s con un pulso
// final. Con prefers-reduced-motion (index.css) no se anima y queda el estado
// final. Decorativo: el texto vecino es el que anuncia el resultado.
export default function CheckAnimado({ size = 36, className }) {
  return (
    <span data-testid="check-animado" aria-hidden="true" className={cn('mobos-check text-ok', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle className="mobos-check-aro" cx="14" cy="14" r="12" />
        <path className="mobos-check-trazo" d="M8.5 14.5l4 4 7-8" />
      </svg>
    </span>
  )
}
