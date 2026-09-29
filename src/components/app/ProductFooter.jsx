// Pie institucional de la app: la implementación vive en `owncoding-ui` (como
// EmailField) y acá solo se aplican los valores de marca del producto
// (#291/#292): © + nombre + versión + «Desarrollado por Owncoding».
import { ProductFooter as Footer } from 'owncoding-ui'
import { APP_CREDIT, APP_CREDIT_URL, APP_NAME, APP_VERSION } from '@/lib/brand'

export function ProductFooter({ className = '', leading, children, ...props }) {
  return (
    <Footer
      nombre={APP_NAME}
      version={APP_VERSION}
      credito={APP_CREDIT}
      creditoUrl={APP_CREDIT_URL}
      className={`mobos-footer ${className}`.trim()}
      leading={leading}
      {...props}
    >
      {children}
    </Footer>
  )
}

export default ProductFooter
