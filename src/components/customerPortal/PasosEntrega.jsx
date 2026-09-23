// Pasos del envío/retiro en el portal (#240 → portal): la misma línea de
// progreso que la página pública del pedido, compacta para la tarjeta de la
// cuenta. El backend manda `{ encabezado, pasos: [{ key, label, hecho, actual, at }] }`.
import { fechaHora } from '@/utils/fecha'

export default function PasosEntrega({ tracking, className = '', ...props }) {
  const pasos = tracking?.pasos || []
  if (pasos.length < 2) return null
  return (
    <div className={className} {...props}>
      {tracking?.encabezado && <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{tracking.encabezado}</p>}
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
        {pasos.map((paso) => (
          <div key={paso.key} className="text-center">
            <div className={`h-1.5 rounded-full ${paso.hecho ? 'bg-fono-light' : 'bg-ink-600'} ${paso.actual ? 'ring-2 ring-fono/40' : ''}`} />
            <p className={`mt-1.5 text-[9px] font-semibold leading-tight sm:text-[10px] ${paso.hecho ? 'text-fore' : 'text-mute'}`}>{paso.label}</p>
            {paso.at && <p className="text-[9px] text-mute">{fechaHora(paso.at)}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
