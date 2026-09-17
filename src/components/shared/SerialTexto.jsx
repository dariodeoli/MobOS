import { cn } from '@/lib/utils'
import { partirSerial } from '@/utils/serial'

// Serial/IMEI en tablas y fichas: se ve completo cuando entra y, si la columna
// queda corta, se recorta la cabeza y los últimos 4 siguen siempre visibles.
export default function SerialTexto({ serial, className, tonoCola = 'text-fore', vacio = '—' }) {
  const { cabeza, cola } = partirSerial(serial)
  if (!cola) return <span className={cn('font-mono', className)}>{vacio}</span>
  return (
    <span className={cn('flex min-w-0 font-mono', className)} title={String(serial)}>
      <span className="min-w-0 truncate">{cabeza}</span>
      <b className={cn('shrink-0', tonoCola)}>{cola}</b>
    </span>
  )
}
