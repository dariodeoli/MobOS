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
  // La foto local se guarda con su dueño: nunca se pinta la de otro usuario
  // (#271). Mientras resuelve, el placeholder es neutro (iniciales) — tampoco
  // se adelanta la foto de Google, que se vería como «la foto anterior».
  const [foto, setFoto] = useState(null)
  const [localListo, setLocalListo] = useState(false)
  // La foto de Google puede caer (la URL caduca): si falla, se cae a iniciales
  // en vez de dejar una imagen rota (#164).
  const [googleRota, setGoogleRota] = useState(false)
  useEffect(() => {
    let vigente = true
    setFoto(null)
    setLocalListo(false)
    if (puedeTenerFoto && user?.id) {
      getAvatarDataUrl(user.id).then((url) => {
        if (!vigente) return
        if (url) setFoto({ id: user.id, url })
        setLocalListo(true)
      })
    } else {
      setLocalListo(true)
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
  const fotoVisible = foto && foto.id === user?.id ? foto.url : ''
  if (fotoVisible) {
    return <img src={fotoVisible} alt={`Foto de ${nombre}`} loading="lazy" title={etiqueta} className={`${clases} shrink-0 rounded-full border border-ink-600 object-cover ${className}`} />
  }
  // Google solo entra cuando la foto local ya se descartó (o no puede existir).
  if (picture && !googleRota && localListo) {
    return <img src={picture} alt={`Foto de ${nombre}`} loading="lazy" title={etiqueta} referrerPolicy="no-referrer" onError={() => setGoogleRota(true)} className={`${clases} shrink-0 rounded-full border border-ink-600 object-cover ${className}`} />
  }
  return <span title={etiqueta} className={`${clases} grid shrink-0 place-items-center rounded-full border border-ink-600 bg-ink-700 font-semibold text-mute ${className}`}>{inicialesDe(nombre)}</span>
}
