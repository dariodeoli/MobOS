import PinSegmentado from '@/components/shared/PinSegmentado'
import { cn } from '@/lib/utils'

// Teclado de PIN estilo iPhone: teclas redondas grandes (hasta 80 px, casi todo
// el ancho en móvil), 4 puntos que se llenan, borrar y validación al completar
// (`onComplete` se dispara una sola vez al llegar al último dígito; la
// pantalla valida contra la API y marca `invalido` / `exito`). Es el objeto a
// usar para CUALQUIER PIN nuevo; la lógica de teclas está en `pinPadReglas.js` y las
// teclas en `PinTeclado`.
//
// En celular (o `tecladoTactil`) muestra las teclas propias y no abre el
// teclado del sistema; en escritorio queda el campo con teclado físico, igual
// que `PinSegmentado`. `tecladoTactil` fuerza las teclas (Biblioteca, kioscos).
//
//   <PinPad value={pin} onChange={setPin} onComplete={validar} invalido={Boolean(error)} />
export default function PinPad({ className, ...props }) {
  return <PinSegmentado discreto {...props} className={cn('pin-pad', className)} />
}
