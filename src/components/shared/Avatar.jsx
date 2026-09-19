import { useEffect, useState } from 'react'
import { getAvatarDataUrl } from '@/lib/userAvatar'

const TAMANOS = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-7 w-7 text-[11px]',
  lg: 'h-9 w-9 text-xs',
  xl: 'h-12 w-12 text-sm',
}

// Iniciales del nombre: primera y última palabra (formato único de la app).
export const inicialesDeNombre = (nombre) => {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!palabras.length) return '?'
  const primera = Array.from(palabras[0])[0]
  const ultima = palabras.length > 1 ? Array.from(palabras[palabras.length - 1])[0] : ''
  return `${primera}${ultima}`.toLocaleUpperCase('es')
}

// Único formato de avatar de la app: la foto del usuario si la subió (se pide
// una vez por pestaña y se cachea) y, si no, las iniciales en un círculo.
// Todos los lugares que muestran personas usan este componente.
export default function Avatar({ user, hasAvatar, size = 'md', className = '', title }) {
  const nombre = user?.name || 'Equipo'
  const puedeTenerFoto = hasAvatar ?? user?.hasAvatar !== false
  const [foto, setFoto] = useState('')
  useEffect(() => {
    let vigente = true
    if (puedeTenerFoto && user?.id) {
      getAvatarDataUrl(user.id).then((url) => { if (vigente && url) setFoto(url) })
    }
    return () => { vigente = false }
  }, [puedeTenerFoto, user?.id])
  const clases = TAMANOS[size] || TAMANOS.md
  const etiqueta = title ?? nombre
  if (foto) {
    return <img src={foto} alt={`Foto de ${nombre}`} loading="lazy" title={etiqueta} className={`${clases} shrink-0 rounded-full border border-ink-600 object-cover ${className}`} />
  }
  return <span title={etiqueta} className={`${clases} grid shrink-0 place-items-center rounded-full border border-ink-600 bg-ink-700 font-semibold text-mute ${className}`}>{inicialesDeNombre(nombre)}</span>
}
