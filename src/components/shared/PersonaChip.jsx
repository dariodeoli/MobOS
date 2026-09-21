import Avatar from '@/components/shared/Avatar'
import { cn, primerNombre } from '@/lib/utils'

// Identidad de una persona (#211): UN solo objeto para mostrar a alguien en
// cualquier superficie. Envuelve al Avatar compartido —que resuelve la foto en
// orden único: foto local por id → foto de Google (picture) → iniciales— y
// agrega nombre (o solo el primer nombre en contextos compactos), presencia y
// tooltip. Los call sites no vuelven a pluckear `picture` ni a dibujar la
// persona por su cuenta.

const ESTADOS = {
  'en-linea': { etiqueta: 'En línea', punto: 'bg-ok' },
  ausente: { etiqueta: 'Ausente', punto: 'bg-warn' },
  ocupado: { etiqueta: 'Ocupado', punto: 'bg-bad' },
  offline: { etiqueta: 'Sin conexión', punto: 'bg-mute' },
}

export default function PersonaChip({
  user,
  picture,
  size = 'md',
  nombre = true,
  nombreCorto = false,
  estado,
  title,
  className,
  textoClassName,
  avatarClassName,
  children,
}) {
  const persona = typeof user === 'string' ? { name: user } : (user || {})
  const completo = persona.name || 'Usuario'
  const visible = nombreCorto ? primerNombre(completo) : completo
  const presencia = ESTADOS[estado] || null
  const etiqueta = title || [completo, presencia?.etiqueta, persona.scope].filter(Boolean).join(' · ')
  return (
    <span data-testid="persona-chip" className={cn('inline-flex min-w-0 items-center gap-2', className)} title={etiqueta}>
      <span className="relative inline-flex shrink-0">
        <Avatar
          user={persona}
          picture={picture ?? persona.picture}
          size={size}
          className={avatarClassName}
          title={etiqueta}
        />
        {presencia ? <i aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-paper', presencia.punto)} /> : null}
      </span>
      {nombre ? <span className={cn('min-w-0 truncate text-sm font-semibold', textoClassName)}>{visible}</span> : null}
      {children ? <span className="min-w-0 truncate text-xs text-mute">{children}</span> : null}
    </span>
  )
}
