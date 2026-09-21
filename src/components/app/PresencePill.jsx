import { usePresentes } from '@/hooks/usePresence'
import { useSesion } from '@/lib/sesion'
import { etiquetaPresencia } from '@/lib/presence'
import { cn } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'

// Nombre corto (primer nombre) para contextos compactos (#211).
function nombreCorto(nombre) {
  return String(nombre || '').trim().split(/\s+/)[0] || ''
}

// Foto de Google de una persona de la presencia: el API todavía no la expone
// por persona, así que se usa la que venga en el payload y, como puente, la del
// perfil de empresa cuando la persona es el dueño. Cuando aterrice el objeto
// unificado de identidad (#211, DSN) este helper se reemplaza por sus props.
function pictureDe(persona, perfilEmpresa) {
  if (persona?.picture) return persona.picture
  const esDueno = Boolean(perfilEmpresa?.name) && persona?.name === perfilEmpresa.name
  return esDueno ? perfilEmpresa?.picture : undefined
}

// Píldora del topbar: hasta 4 personas en línea con foto o iniciales y punto
// verde sobre quien tuvo actividad. La foto se resuelve con el `Avatar`
// compartido (foto local por id → Google → iniciales) para todas las personas,
// sin forzar `hasAvatar=false`. Sin nadie en línea no ocupa espacio.
// `className` permite que el shell decida en qué breakpoints se muestra.
export default function PresencePill({ className }) {
  const personas = usePresentes()
  const { perfilEmpresa } = useSesion()
  const visibles = personas.slice(0, 4)
  if (!personas.length) return null
  const etiqueta = etiquetaPresencia(personas)
  const resumen = personas.length === 1 ? `${nombreCorto(personas[0].name)} en línea` : `${personas.length} en línea`
  return (
    <div className={cn('items-center', className ?? 'hidden sm:flex')} role="group" aria-label="Personas en línea">
      <div className="flex items-center gap-2 rounded-full border border-fore/10 bg-ink-700/60 px-2.5 py-1" title={etiqueta} aria-label={etiqueta}>
        <span className="flex -space-x-2">
          {visibles.map((persona) => (
            <span key={persona.id} className="relative inline-flex">
              <Avatar user={persona} picture={pictureDe(persona, perfilEmpresa)} size="md" className="border-paper" title={`${persona.name}${persona.scope ? ` · ${persona.scope}` : ''}`} />
              {persona.active && <i className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-ok ring-1 ring-paper" aria-hidden="true" />}
            </span>
          ))}
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-mute">{resumen}</span>
      </div>
    </div>
  )
}
