import { cn } from '@/lib/utils'

// Vista previa del documento impreso (#241, "preview v2"): el papel con su
// ancho real (mm a 96 dpi) para que lo que se ve coincida con lo que sale
// impreso, sin franjas blancas. Antes cada pantalla repetía el mapa de anchos y
// las clases del iframe (comprobantes, reportes e informe).
export const ANCHOS_PAPEL = {
  'thermal-80': 'max-w-[302px]',
  'thermal-58': 'max-w-[219px]',
  'thermal-55': 'max-w-[208px]',
  thermal: 'max-w-[219px]',
  a4: 'max-w-[794px]',
}

export default function VistaPreviaPapel({ formato = 'thermal-80', contenido, titulo = 'Vista previa del documento', alto = 'h-[60vh]', className, ...props }) {
  const ancho = ANCHOS_PAPEL[formato]
  return (
    <iframe
      title={titulo}
      srcDoc={contenido}
      className={cn('w-full rounded-xl border border-ink-600 bg-white', alto, ancho ? `mx-auto ${ancho}` : '', className)}
      {...props}
    />
  )
}
