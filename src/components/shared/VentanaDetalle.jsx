import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils'

// Ventana de detalle y vista previa (#386): un único componente para todo lo
// que antes abría un panel pegado a la derecha. Es el `Modal` de owncoding-ui
// (foco atrapado, Esc, clic afuera, `busy`/`dirty` que bloquean o confirman el
// cierre) con tamaño por contenido, encabezado fijo y una X roja grande de
// 44 px (reglas en `.ventana-detalle`, src/index.css). En celular ocupa la
// pantalla con margen seguro. Las pantallas no declaran `max-w-*`.
const TAMANOS = { sm: 'corto', md: 'formulario', lg: 'amplio', xl: 'completo' }

export default function VentanaDetalle({ open = true, onClose, title, size = 'md', className, children, ...resto }) {
  // La clase base se arma aparte: el ancho sale solo de `size`, nunca de `className`.
  const estilo = { className: cn('ventana-detalle', className) }
  return (
    <Modal open={open} onClose={onClose} title={title} size={TAMANOS[size] || size} {...estilo} {...resto}>
      {children}
    </Modal>
  )
}
