import { API_URL } from '@/lib/api/client'

// Avatar de quien hizo un movimiento: su foto si la subió, y si no las
// iniciales en un círculo, para que la cronología se lea de un vistazo.
const iniciales = (nombre) => String(nombre || 'Equipo').trim().split(/\s+/).slice(0, 2).map(parte => parte[0] || '').join('').toUpperCase() || 'EQ'

export default function ActorAvatar({ user, hasAvatar = false, size = 'md' }) {
  const nombre = user?.name || 'Equipo'
  const clases = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]'
  if (hasAvatar && user?.id) {
    return <img src={`${API_URL}/api/users/${encodeURIComponent(user.id)}/avatar`} alt={`Foto de ${nombre}`} loading="lazy" className={`${clases} shrink-0 rounded-full border border-ink-600 object-cover`} />
  }
  return <span aria-hidden="true" className={`${clases} grid shrink-0 place-items-center rounded-full border border-ink-600 bg-ink-700 font-semibold text-mute`}>{iniciales(nombre)}</span>
}
