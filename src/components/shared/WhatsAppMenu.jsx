import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { whatsappUrl } from '@/components/customers/customerMessaging'
import { renderPlantilla } from '@/lib/whatsappPlantillas'

// Menú reutilizable de envío por WhatsApp: un botón con ícono send abre el
// popover de plantillas de la categoría pedida. Al elegir una, arma el mensaje
// con renderPlantilla y abre wa.me. Si `onSent` existe se lo llama antes de
// abrir: puede devolver el enlace definitivo (por ejemplo, armado en el API) y
// así marcar el envío en el servidor.
export default function WhatsAppMenu({
  telefono,
  countryCode = '+595',
  category = 'CUSTOMERS',
  contexto = {},
  onSent,
  disabled = false,
  plantillas,
  storageKey,
  title,
  className,
}) {
  const { sesion, empresa, sucursal } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [cargado, setCargado] = useState(Array.isArray(plantillas))
  const [lista, setLista] = useState(() => Array.isArray(plantillas) ? plantillas : [])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [elegidaId, setElegidaId] = useState(() => (storageKey ? localStorage.getItem(storageKey) : '') || '')
  const caja = useRef(null)

  useEffect(() => {
    if (!Array.isArray(plantillas)) return
    setLista(plantillas)
    setCargado(true)
    setCargando(false)
  }, [plantillas])

  useEffect(() => {
    if (!abierto || cargado || Array.isArray(plantillas)) return undefined
    let vivo = true
    setCargando(true); setError('')
    api.get(`/api/message-templates?category=${encodeURIComponent(category)}`)
      .then((rows) => { if (vivo) setLista(Array.isArray(rows) ? rows : []) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudieron cargar las plantillas.') })
      .finally(() => { if (vivo) { setCargando(false); setCargado(true) } })
    return () => { vivo = false }
  }, [abierto, cargado, category, plantillas])

  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (event) => { if (!caja.current?.contains(event.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  const activas = lista.filter((item) => item.isActive !== false && (!item.category || item.category === category))
  const elegida = activas.find((item) => item.id === elegidaId) || activas.find((item) => item.isDefault) || activas[0] || null
  const valores = {
    empresa: empresa?.nombre || '',
    sucursal: sucursal?.nombre || '',
    vendedor: sesion?.nombre || '',
    ...contexto,
  }

  function reintentar() {
    setCargado(false)
    setError('')
  }

  async function enviar(plantilla) {
    if (!plantilla || enviando) return
    setElegidaId(plantilla.id)
    if (storageKey) localStorage.setItem(storageKey, plantilla.id)
    setAbierto(false)
    setEnviando(true)
    const mensaje = renderPlantilla(plantilla.body, valores)
    try {
      let url = whatsappUrl(telefono, mensaje, countryCode)
      if (onSent) {
        const resultado = await onSent({ template: plantilla, message: mensaje, url })
        if (typeof resultado === 'string' && resultado) url = resultado
      }
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setError(cause?.message || 'No se pudo preparar el mensaje.')
      setAbierto(true)
    } finally { setEnviando(false) }
  }

  if (!telefono) return null

  return (
    <span ref={caja} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        disabled={disabled || enviando}
        aria-label={title ? `Enviar WhatsApp a ${title}` : 'Enviar WhatsApp'}
        aria-expanded={abierto}
        title={disabled ? 'No disponible' : 'Enviar por WhatsApp'}
        onClick={(event) => { event.stopPropagation(); setAbierto((current) => !current) }}
        className={cn('grid h-8 w-8 place-items-center rounded-lg transition', disabled || enviando ? 'cursor-not-allowed text-mute' : 'text-ok hover:bg-ok/10')}
      >
        <Icon name="send" className="h-4 w-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-ink-500 bg-paper p-2 text-left shadow-xl" onClick={(event) => event.stopPropagation()}>
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-mute">Plantilla de WhatsApp</p>
          {cargando && <p className="px-2 py-1 text-xs text-mute">Cargando plantillas…</p>}
          {!cargando && error && (
            <p role="alert" className="px-2 py-1 text-xs text-bad">{error} <button type="button" className="font-semibold text-fono-light hover:underline" onClick={reintentar}>Reintentar</button></p>
          )}
          {!cargando && !error && !activas.length && <p className="px-2 py-1 text-xs text-mute">No hay plantillas activas en esta categoría.</p>}
          {activas.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              {activas.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => enviar(item)}
                  className={cn('flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-ink-700', item.id === elegida?.id ? 'text-fono-light' : 'text-fore')}
                >
                  {item.isDefault && <Icon name="check" className="h-3 w-3" />}
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
          {elegida && !error && <p className="mt-1 rounded-lg bg-ink-800/60 px-2 py-1.5 text-[11px] leading-4 text-mute">{renderPlantilla(elegida.body, valores)}</p>}
        </div>
      )}
    </span>
  )
}
