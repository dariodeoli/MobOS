import Avatar from '@/components/shared/Avatar'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE } from '@/components/shared/tabla'
import { identidadDeUsuario } from '@/lib/identidad'
import { cn } from '@/lib/utils'

// Identidad de una persona (#211): UN solo objeto para mostrar a alguien en
// cualquier superficie. Envuelve al Avatar compartido y resuelve nombre y foto
// con el adaptador compartido `identidadDeUsuario` (#212), que aplica el orden
// único: foto local por id → foto de Google (picture) → iniciales. Agrega
// nombre (o solo el primer nombre en contextos compactos), presencia y tooltip:
// los call sites no vuelven a pluckear `picture` ni a dibujar a la persona.

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
  const fuente = typeof user === 'string' ? { name: user } : (user || {})
  const identidad = identidadDeUsuario(fuente)
  const visible = nombreCorto ? identidad.primerNombre : identidad.nombre
  const presencia = ESTADOS[estado] || null
  const etiqueta = title || [identidad.nombre, presencia?.etiqueta, fuente.scope].filter(Boolean).join(' · ')
  return (
    <span data-testid="persona-chip" className={cn('inline-flex min-w-0 items-center gap-2', className)} title={etiqueta}>
      <span className="relative inline-flex shrink-0">
        {/* El tooltip vive solo en el chip (evita dos nodos con el mismo title). */}
        <Avatar
          user={fuente}
          picture={picture ?? identidad.picture}
          hasAvatar={identidad.hasAvatar}
          size={size}
          className={avatarClassName}
        />
        {presencia ? <i aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-paper', presencia.punto)} /> : null}
      </span>
      {nombre ? <span className={cn('min-w-0', CELDA_IDENTIDAD_GRANDE, textoClassName)}>{visible}</span> : null}
      {children ? <span className={CELDA_DATO}>{children}</span> : null}
    </span>
  )
}
