import { usePresentes } from '@/hooks/usePresence'
import { useSesion } from '@/lib/sesion'
import { etiquetaPresencia } from '@/lib/presence'
import { identidadDeUsuario } from '@/lib/identidad'
import { cn } from '@/lib/utils'
import PersonaChip from '@/components/shared/PersonaChip'

// Foto de Google: el API de presencia todavía no expone `picture` por persona,
// así que se usa la del payload y, como puente, la del perfil de empresa cuando
// la persona es el dueño. El objeto unificado (#211) ya define el contrato
// (`identidadDeUsuario`); cuando el API devuelva `picture`/`foto` por persona,
// el puente sale.
function pictureDe(persona, identidad, perfilEmpresa) {
  if (identidad.picture) return identidad.picture
  const esDueno = Boolean(perfilEmpresa?.name) && persona?.name === perfilEmpresa.name
  return esDueno ? perfilEmpresa?.picture : undefined
}

// Píldora del topbar: hasta 4 personas en línea con foto o iniciales y punto
// verde sobre quien tuvo actividad. Cada persona se resuelve con el objeto
// unificado de identidad (#211: foto local por id → Google → iniciales, sin
// forzar `hasAvatar=false`) y el nombre corto se usa en contextos compactos.
// Sin nadie en línea no ocupa espacio. `className` decide en qué breakpoints
// se muestra (lo controla el shell).
export default function PresencePill({ className }) {
  const personas = usePresentes()
  const { perfilEmpresa } = useSesion()
  if (!personas.length) return null
  const identidades = personas.map((persona) => ({ persona, identidad: identidadDeUsuario(persona) }))
  const visibles = identidades.slice(0, 4)
  const etiqueta = etiquetaPresencia(personas)
  const resumen = identidades.length === 1 ? `${identidades[0].identidad.primerNombre} en línea` : `${personas.length} en línea`
  return (
    <div className={cn('items-center', className ?? 'hidden sm:flex')} role="group" aria-label="Personas en línea">
      <div className="flex items-center gap-2 rounded-full border border-fore/10 bg-ink-700/60 px-2.5 py-1" title={etiqueta} aria-label={etiqueta}>
        <span className="flex -space-x-2">
          {visibles.map(({ persona, identidad }) => (
            <PersonaChip
              key={persona.id}
              user={{ id: persona.id, name: identidad.nombre, hasAvatar: identidad.hasAvatar, scope: persona.scope }}
              picture={pictureDe(persona, identidad, perfilEmpresa)}
              size="md"
              nombre={false}
              estado={persona.active ? 'en-linea' : undefined}
              avatarClassName="border-paper"
              title={`${identidad.nombre}${persona.scope ? ` · ${persona.scope}` : ''}`}
            />
          ))}
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-mute">{resumen}</span>
      </div>
    </div>
  )
}
