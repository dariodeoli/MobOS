import Popup from './Popup'
import { cn } from '@/lib/utils'

// Ventana de detalle y vista previa (#386): un único componente para todo lo
// que antes abría un panel pegado a la derecha. Es el Popup único de MobOS
// (`shared/Popup`): centrado en escritorio, hoja desde abajo en celular, X roja
// de 44 px, Esc, foco atrapado y `busy`/`dirty` que bloquean o confirman el
// cierre. Las pantallas no declaran `max-w-*`: el ancho sale de `size`
// (sm/md/lg/xl). La clase `ventana-detalle` queda como marcador.
const ALIAS = { corto: 'sm', formulario: 'md', amplio: 'lg', completo: 'xl' }

export default function VentanaDetalle({ open = true, onClose, title, size = 'md', className, children, ...resto }) {
  return (
    <Popup open={open} onClose={onClose} title={title} tipo="detalle" tamano={ALIAS[size] || size} className={cn('ventana-detalle', className)} {...resto}>
      {children}
    </Popup>
  )
}
