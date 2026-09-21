import { cn } from '@/lib/utils'

// Layout de configuración: el contenido vive a la izquierda y el formulario en
// un panel a la derecha, fijo en escritorio (lg+) y apilado abajo en móvil o
// tablet. El panel nunca genera scroll horizontal: ambas columnas son
// `min-w-0` y el formulario se limita al ancho disponible.
//
// Uso:
//   <PanelDerecho id="equipo-form" panel={<Card>…form…</Card>}>
//     …contenido/lista…
//   </PanelDerecho>
export default function PanelDerecho({ children, panel, id, className, classNamePanel }) {
  return (
    <div className={cn('grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]', className)}>
      <div className="min-w-0 space-y-4">{children}</div>
      <aside id={id} className={cn('min-w-0 lg:sticky lg:top-24', classNamePanel)}>
        {panel}
      </aside>
    </div>
  )
}
