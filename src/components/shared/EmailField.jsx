// Adaptador (#253/#389): la UI vive en `owncoding-ui`; acá solo se fija el
// ancho de campo (docs/CAMPOS.md §2.1) y se conserva la ruta histórica. No
// volver a implementar: el control de duplicados (camposReglas.test.js) lo exige.
import { EmailField as CampoCorreo } from 'owncoding-ui'
import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'

export { DOMINIOS_EMAIL, sugerenciasDe } from 'owncoding-ui'

export default function EmailField({ className, ...props }) {
  return <CampoCorreo {...props} className={cn('w-full', ANCHO_CAMPO.correo, className)} />
}
