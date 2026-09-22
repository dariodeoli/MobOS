import Icon from '@/components/shared/Icon'
import { TONOS, estadoItem } from '@/lib/estadoEquipo'
import { CELDA_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Semáforo de un ítem del checklist (#240): bien / con observación / falla /
// sin verificar, con la etiqueta del punto y un detalle opcional. El estado se
// lee por color, ícono y texto accesible (el título del punto + el estado), no
// solo por color. `como="div"` para grillas que no son listas.
export default function SemaforoItem({ estado = 'sinVerificar', etiqueta, detalle, como = 'li', className, ...props }) {
  const config = estadoItem(estado)
  const Etiqueta = como === 'div' ? 'div' : 'li'
  return (
    <Etiqueta
      className={cn('flex items-center gap-2.5', className)}
      aria-label={etiqueta ? `${etiqueta}: ${config.etiqueta}` : config.etiqueta}
      {...props}
    >
      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', TONOS.punto[config.tono])} title={config.etiqueta} aria-hidden="true">
        <Icon name={config.icono} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{etiqueta}</span>
        {detalle && <span className={cn(CELDA_DATO, 'block')}>{detalle}</span>}
      </span>
    </Etiqueta>
  )
}
