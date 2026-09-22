import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import Icon from '@/components/shared/Icon'
import { Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { whatsappUrl } from '@/utils/telefono'
import { renderPlantilla } from '@/lib/whatsappPlantillas'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { leerUltimo, recordarUltimo } from '@/lib/ultimoUsado'

// Menú reutilizable de WhatsApp (Clientes, Pedidos, Servicio Técnico y
// módulos futuros): el botón principal abre el chat con la última plantilla
// usada (o la predeterminada) sin enviar nada por sí solo; el botón chico de
// al lado abre el popover para elegir plantilla, editar el mensaje y
// previsualizarlo antes de abrir el chat. Si `onSent` existe se lo llama antes
// de abrir y puede devolver el enlace definitivo (por ejemplo, armado en el
// API) para marcar el envío en el servidor.
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
  preferKey = '',
  className,
}) {
  const { sesion, empresa, sucursal } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [cargado, setCargado] = useState(Array.isArray(plantillas))
  const [lista, setLista] = useState(() => Array.isArray(plantillas) ? plantillas : [])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [elegidaId, setElegidaId] = useState(() => leerUltimo(`wa:plantilla:${category}`, '') || (storageKey ? localStorage.getItem(storageKey) : '') || '')
  const [mensajeEditado, setMensajeEditado] = useState('')
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
  // Orden de preferencia: la última usada, la sugerida para el contexto actual
  // (p. ej. la plantilla del estado de una orden de servicio), la
  // predeterminada de la categoría y, si no hay nada, la primera activa.
  const principalDe = (candidatas) => candidatas.find((item) => item.id === elegidaId)
    || candidatas.find((item) => preferKey && item.key === preferKey)
    || candidatas.find((item) => item.isDefault)
    || candidatas[0]
    || null
  const elegida = principalDe(activas)
  const valores = {
    empresa: empresa?.nombre || '',
    sucursal: sucursal?.nombre || '',
    usuario: sesion?.nombre || '',
    vendedor: sesion?.nombre || '',
    ...contexto,
  }

  // La vista previa editable arranca con la plantilla elegida y se descarta al
  // cerrar: nunca se guarda el borrador sobre la plantilla.
  useEffect(() => {
    if (!abierto) return
    setMensajeEditado(elegida ? renderPlantilla(elegida.body, valores) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, elegida?.id])

  function reintentar() {
    setCargado(false)
    setError('')
  }

  async function abrirChat(plantilla, mensaje) {
    if (!plantilla || enviando) return
    setElegidaId(plantilla.id)
    recordarUltimo(`wa:plantilla:${category}`, plantilla.id)
    setAbierto(false)
    setEnviando(true)
    const texto = typeof mensaje === 'string' && mensaje.trim() ? mensaje : renderPlantilla(plantilla.body, valores)
    try {
      let url = whatsappUrl(telefono, texto, countryCode)
      if (onSent) {
        const resultado = await onSent({ template: plantilla, message: texto, url })
        if (typeof resultado === 'string' && resultado) url = resultado
      }
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setError(cause?.message || 'No se pudo preparar el mensaje.')
      setAbierto(true)
    } finally { setEnviando(false) }
  }

  // Botón principal: usa la última plantilla preparada. Si todavía no se
  // cargaron las plantillas, las pide y recién ahí abre el chat.
  async function abrirDirecto() {
    if (disabled || enviando) return
    if (cargado) {
      if (elegida) abrirChat(elegida)
      else setAbierto(true)
      return
    }
    setCargando(true); setError('')
    try {
      const rows = await api.get(`/api/message-templates?category=${encodeURIComponent(category)}`)
      const activasRemotas = (Array.isArray(rows) ? rows : []).filter((item) => item.isActive !== false && (!item.category || item.category === category))
      setLista(Array.isArray(rows) ? rows : [])
      setCargado(true)
      const principal = principalDe(activasRemotas)
      if (principal) await abrirChat(principal)
      else setAbierto(true)
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las plantillas.')
      setAbierto(true)
    } finally { setCargando(false) }
  }

  if (!telefono) return null

  return (
    <span ref={caja} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        disabled={disabled || enviando}
        aria-label={title ? `Enviar WhatsApp a ${title}` : 'Enviar WhatsApp'}
        title={disabled ? 'No disponible' : 'Abrir WhatsApp con la última plantilla'}
        onClick={(event) => { event.stopPropagation(); abrirDirecto() }}
        className={cn('grid h-8 w-8 place-items-center rounded-lg transition', disabled || enviando ? 'cursor-not-allowed text-mute' : 'text-ok hover:bg-ok/10')}
      >
        <Icon name="send" className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={disabled || enviando}
        aria-label={title ? `Elegir plantilla de WhatsApp para ${title}` : 'Elegir plantilla de WhatsApp'}
        aria-expanded={abierto}
        title="Elegir plantilla, editar y previsualizar"
        onClick={(event) => { event.stopPropagation(); setAbierto((current) => !current) }}
        className={cn('grid h-5 w-4 place-items-center rounded transition', disabled || enviando ? 'cursor-not-allowed text-mute' : 'text-mute hover:text-ok')}
      >
        <Icon name="chevron" className="h-3 w-3" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-ink-500 bg-paper p-2 text-left shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Plantillas de WhatsApp">
          <p className={cn('px-2 py-1', ROTULO_DATO)}>Plantilla de WhatsApp</p>
          {cargando && <p className="px-2 py-1 text-xs text-mute">Cargando plantillas…</p>}
          {!cargando && error && (
            <p role="alert" className="px-2 py-1 text-xs text-bad">{error} <button type="button" className="font-semibold text-fono-light hover:underline" onClick={reintentar}>Reintentar</button></p>
          )}
          {!cargando && !error && !activas.length && <p className="px-2 py-1 text-xs text-mute">No hay plantillas activas en esta categoría.</p>}
          {activas.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {activas.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => { setElegidaId(item.id); recordarUltimo(`wa:plantilla:${category}`, item.id); setMensajeEditado(renderPlantilla(item.body, valores)) }}
                  className={cn('flex w-full items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-ink-700', item.id === elegida?.id ? 'text-fono-light' : 'text-fore')}
                >
                  {item.isDefault && <Icon name="check" className="h-3 w-3" />}
                  <span className="truncate">{item.name}</span>
                  {item.id === elegidaId && <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide text-mute">Última usada</span>}
                  {!item.isDefault && preferKey && item.key === preferKey && <span className={cn('shrink-0 text-[9px] font-bold uppercase tracking-wide text-fono-light', item.id === elegidaId ? '' : 'ml-auto')}>Sugerida</span>}
                </button>
              ))}
            </div>
          )}
          {elegida && !error && (
            <div className="mt-1.5 space-y-1.5 border-t border-ink-600 pt-1.5">
              <Textarea
                aria-label="Mensaje de WhatsApp"
                rows={5}
                value={mensajeEditado}
                onChange={(event) => setMensajeEditado(event.target.value)}
                className="px-2.5 py-2 text-xs leading-5"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-mute transition hover:text-fore"
                  onClick={() => setMensajeEditado(renderPlantilla(elegida.body, valores))}
                >
                  Restaurar mensaje
                </button>
                <button
                  type="button"
                  disabled={enviando || !mensajeEditado.trim()}
                  onClick={() => abrirChat(elegida, mensajeEditado)}
                  className="rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {enviando ? 'Abriendo…' : 'Abrir WhatsApp'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
