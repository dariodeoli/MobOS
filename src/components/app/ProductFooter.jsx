import { APP_CREDIT, APP_CREDIT_URL, APP_NAME, APP_VERSION } from '@/lib/brand'
import { cn } from '@/lib/utils'

export function ProductFooter({ className, leading, children }) {
  return (
    <footer className={cn('mobos-footer border-t border-fore/10 bg-transparent px-4 py-3 text-center text-[11px] text-mute', className)}>
      {leading}
      <span>© 2026 {APP_NAME}. Todos los derechos reservados. · {APP_VERSION}</span>{' · '}
      {children}
      <a href={APP_CREDIT_URL} target="_blank" rel="noreferrer" className="font-medium text-fono-dark hover:underline">{APP_CREDIT}</a>
    </footer>
  )
}

export default ProductFooter
