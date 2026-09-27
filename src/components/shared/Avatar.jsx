import { useEffect, useState } from 'react'
import { getAvatarDataUrl, suscribirAvatar } from '@/lib/userAvatar'
import { inicialesDe } from '@/lib/iniciales'

const TAMANOS = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-7 w-7 text-[11px]',
  lg: 'h-9 w-9 text-xs',
  xl: 'h-12 w-12 text-sm',
}

// Único formato de avatar de la app: la foto del usuario si la subió (se pide
// una vez por pestaña y se cachea), si no la foto de su identidad Google
// (picture) y, si no, las iniciales en un círculo. Todos los lugares que
// muestran personas usan este componente.
//
// #271: mientras la foto local resuelve **no se pinta nada anterior** —ni la
// del usuario anterior, ni la de Google—: queda el placeholder neutro de
// iniciales y, cuando llega, aparece la foto correcta (sin flash). La foto se
// guarda **por usuario** (`local.id`), así un cambio de `user` no reusa la
// anterior, y cada `<img>` va con `key`/capa de carga para que el navegador no
// mantenga la imagen vieja mientras carga la nueva. `userAvatar` invalida la
// caché al cambiar o quitar la foto y avisa a los avatares montados.
export default function Avatar({ user, hasAvatar, picture, size = 'md', className = '', title }) {
  const nombre = user?.name || 'Equipo'
  const id = user?.id || ''
  const puedeTenerFoto = hasAvatar ?? user?.hasAvatar !== false
  const [local, setLocal] = useState({ id: '', url: '', listo: false })
  const [revision, setRevision] = useState(0)
  const [cargada, setCargada] = useState('')
  const [rota, setRota] = useState('')

  // Cambio o quita de foto en cualquier parte: se recarga (nunca la anterior).
  useEffect(() => suscribirAvatar((cambiado) => {
    if (cambiado && id && cambiado !== id) return
    setRevision((valor) => valor + 1)
  }), [id])

  useEffect(() => {
    let vigente = true
    if (!puedeTenerFoto || !id) {
      setLocal({ id, url: '', listo: true })
      return () => { vigente = false }
    }
    // Se limpia antes de pedir: mientras resuelve queda el placeholder neutro.
    setLocal({ id, url: '', listo: false })
    getAvatarDataUrl(id).then((url) => { if (vigente) setLocal({ id, url: url || '', listo: true }) })
    return () => { vigente = false }
  }, [puedeTenerFoto, id, revision])

  const localDeEste = local.id === id ? local : { id, url: '', listo: false }
  const esperando = puedeTenerFoto && Boolean(id) && !localDeEste.listo
  const enlace = esperando ? '' : (localDeEste.url || (picture && picture !== rota ? picture : ''))
  const clases = TAMANOS[size] || TAMANOS.md
  const etiqueta = title ?? nombre
  const visible = Boolean(enlace) && cargada === enlace

  return (
    <span
      title={etiqueta}
      className={`${clases} relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-700 font-semibold text-mute ${className}`}
    >
      {visible ? null : <span aria-hidden="true">{inicialesDe(nombre)}</span>}
      {enlace ? (
        <img
          key={enlace}
          src={enlace}
          alt={`Foto de ${nombre}`}
          loading="lazy"
          referrerPolicy={enlace.startsWith('data:') ? undefined : 'no-referrer'}
          onLoad={() => setCargada(enlace)}
          onError={() => setRota(enlace)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      ) : null}
    </span>
  )
}
