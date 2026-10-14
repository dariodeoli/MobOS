// Adaptador (#253/#389): la UI vive en `owncoding-ui`; acá solo se fija el
// ancho de campo (docs/CAMPOS.md §2.1) y se conserva la ruta histórica. No
// reimplementar: el control de duplicados (camposReglas.test.js) lo exige.
import { PhoneField as CampoTelefono } from 'owncoding-ui'
import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'

export { parseTelefono, componerTelefono, CODIGOS_PAIS } from 'owncoding-ui'

export default function PhoneField({ className, ...props }) {
  return <CampoTelefono {...props} className={cn('w-full', ANCHO_CAMPO.telefono, className)} />
}
