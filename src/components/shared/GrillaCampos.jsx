import { cn } from '@/lib/utils'
import { ANCHO_CAMPO } from './anchoCampos'

// Grilla de formulario (#389, docs/CAMPOS.md §2.1): en >=768px los campos
// cortos se agrupan en la misma fila y saltan de línea solos, sin huecos; en
// celular van uno debajo del otro a todo el ancho. Cada `Campo` fija su ancho
// según el tipo de dato (`ancho`: telefono, documento, correo, ciudad, pais,
// corto) o crece (`ancho="flexible"`) para direcciones, notas y nombres.
export function GrillaCampos({ className, children, ...props }) {
  return <div className={cn('flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start', className)} {...props}>{children}</div>
}

export function Campo({ ancho, como: Etiqueta = 'label', rotulo, className, children, ...props }) {
  const flexible = ancho === 'flexible'
  return (
    <Etiqueta
      className={cn('block w-full min-w-0 text-xs text-mute', flexible ? 'md:min-w-[16rem] md:flex-1' : ANCHO_CAMPO[ancho], className)}
      {...props}
    >
      {rotulo && <span className="mb-1 block">{rotulo}</span>}{children}
    </Etiqueta>
  )
}
