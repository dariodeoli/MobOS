import { usePresentes } from '@/hooks/usePresence'
import { etiquetaPresencia } from '@/lib/presence'
import Avatar from '@/components/shared/Avatar'

// Píldora del topbar: hasta 4 personas en línea con foto o iniciales y punto
// verde sobre quien tuvo actividad. Sin nadie en línea no ocupa espacio.
export default function PresencePill() {
  const personas = usePresentes()
  const visibles = personas.slice(0, 4)
  if (!personas.length) return null
  const etiqueta = etiquetaPresencia(personas)
  return (
    <div className="hidden items-center sm:flex" role="group" aria-label="Personas en línea">
      <div className="flex items-center gap-2 rounded-full border border-fore/10 bg-ink-700/60 px-2.5 py-1" title={etiqueta} aria-label={etiqueta}>
        <span className="flex -space-x-2">
          {visibles.map((persona) => (
            <span key={persona.id} className="relative inline-flex">
              <Avatar user={persona} size="md" className="border-paper" title={`${persona.name}${persona.scope ? ` · ${persona.scope}` : ''}`} />
              {persona.active && <i className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-ok ring-1 ring-paper" aria-hidden="true" />}
            </span>
          ))}
        </span>
        <span className="text-xs font-semibold text-mute">{personas.length} en línea</span>
      </div>
    </div>
  )
}
