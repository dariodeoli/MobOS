import Popup from './Popup'
import { cn } from '@/lib/utils'

// Hoja inferior para celular (#429): ahora es el Popup único de MobOS
// (`shared/Popup`) con el mismo marco: asa para arrastrar hacia abajo, X roja
// de 44 px, Esc, foco atrapado, scroll del documento bloqueado, pie fijo y
// margen seguro del equipo.
//
//   size="auto"  → altura por contenido (hasta 92 % de la pantalla)
//   size="full"  → pantalla completa (cobro)
//
// `busy` bloquea el cierre mientras se guarda; `accion` es un nodo extra del
// encabezado, junto a la X.
export default function BottomSheet({
  open = true,
  onClose,
  title,
  children,
  footer = null,
  size = 'auto',
  busy = false,
  accion = null,
  className,
  testId,
}) {
  const completa = size === 'full'
  return (
    <Popup
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      busy={busy}
      accion={accion}
      testId={testId}
      className={cn(completa && 'h-[100dvh] max-h-[100dvh] rounded-none pt-[env(safe-area-inset-top,0px)] md:max-h-[100dvh]', className)}
    >
      {children}
    </Popup>
  )
}
