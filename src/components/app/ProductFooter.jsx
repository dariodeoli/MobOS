import { ProductFooter as PieInstitucional } from 'owncoding-ui'
import { APP_CREDIT, APP_CREDIT_URL, APP_NAME, APP_VERSION } from '@/lib/brand'
import { cn } from '@/lib/utils'

// Pie institucional (#291): la regla y el objeto viven en la biblioteca
// (`ProductFooter`, REGLAS §14); acá solo se inyecta la identidad de la app:
// marca, versión publicada (fuente única: `lib/brand`) y crédito. Obligatorio
// en todas las superficies: panel (AppShell), acceso (AuthLayout y pantallas
// sueltas), públicas y tokenizadas.
export function ProductFooter({ className, leading, children }) {
  return (
    <PieInstitucional
      nombre={APP_NAME}
      version={APP_VERSION}
      credito={APP_CREDIT}
      creditoUrl={APP_CREDIT_URL}
      leading={leading}
      className={cn('mobos-footer', className)}
    >
      {children}
    </PieInstitucional>
  )
}

export default ProductFooter
