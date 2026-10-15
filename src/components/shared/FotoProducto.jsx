import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import { cargarFoto, esFuenteDirecta } from '@/lib/api/productImages'
import { cn } from '@/lib/utils'

// #404: miniatura de producto. Se baja recién cuando entra en pantalla
// (IntersectionObserver) y mientras tanto —o si no hay foto— muestra el ícono
// de la categoría. Tamaño fijo en px para no mover la tarjeta al cargar.
export default function FotoProducto({ src, alt = '', size = 40, icono = 'image', className, redondo = false }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(() => esFuenteDirecta(src) || typeof IntersectionObserver !== 'function')
  const [url, setUrl] = useState(() => (esFuenteDirecta(src) ? src : ''))
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    setFallo(false)
    setUrl(esFuenteDirecta(src) ? src : '')
  }, [src])

  useEffect(() => {
    if (visible || !src || !ref.current) return undefined
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) { setVisible(true); observador.disconnect() }
    }, { rootMargin: '200px' })
    observador.observe(ref.current)
    return () => observador.disconnect()
  }, [visible, src])

  useEffect(() => {
    if (!visible || !src || esFuenteDirecta(src)) return undefined
    let activo = true
    cargarFoto(src).then((objeto) => { if (activo) setUrl(objeto) }).catch(() => { if (activo) setFallo(true) })
    return () => { activo = false }
  }, [visible, src])

  return (
    <span
      ref={ref}
      data-testid="foto-producto"
      style={{ width: size, height: size }}
      className={cn('inline-grid shrink-0 place-items-center overflow-hidden border border-ink-600 bg-ink-800 text-mute', redondo ? 'rounded-full' : 'rounded-lg', className)}
    >
      {url && !fallo
        ? <img src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" onError={() => setFallo(true)} />
        : <Icon name={icono} className="h-1/2 w-1/2" aria-hidden="true" />}
    </span>
  )
}
