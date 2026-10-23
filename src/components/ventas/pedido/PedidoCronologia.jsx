import { useMemo, useRef, useState } from 'react'
import { Aviso, Button, Money, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import Avatar from '@/components/shared/Avatar'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { consultaDeMencion, insertarMencion, tramosDeMencion } from '@/utils/menciones'
import { cn } from '@/lib/utils'
import { AUDIT_LABELS, PAYMENT_STATUS, PhotoThumb, nombreActor } from './eventos'

const hora = (valor) => new Date(valor).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
const fechaCompleta = (valor) => `${new Date(valor).toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' })} · ${hora(valor)}`

/** Etiqueta del día: Hoy, Ayer o «12 de octubre de 2026». */
export function etiquetaDia(valor, ahora = new Date()) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'Sin fecha'
  if (fecha.toDateString() === ahora.toDateString()) return 'Hoy'
  if (fecha.toDateString() === new Date(ahora.getTime() - 86400000).toDateString()) return 'Ayer'
  return fecha.toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Agrupa los eventos (ya ordenados) por día conservando el orden. */
export function agruparPorDia(eventos = [], ahora = new Date()) {
  const grupos = []
  for (const evento of eventos) {
    const fecha = new Date(evento.at)
    const clave = Number.isNaN(fecha.getTime()) ? 'sin-fecha' : fecha.toDateString()
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave) ultimo.eventos.push(evento)
    else grupos.push({ clave, etiqueta: etiquetaDia(evento.at, ahora), eventos: [evento] })
  }
  return grupos
}

function tituloDe(evento) {
  if (evento.type === 'created') return 'Pedido creado'
  if (evento.type === 'payment') {
    const pago = evento.payment || {}
    return <>{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.method} · <b className="text-fore"><Money value={Number(pago.amountPyg || 0)} /></b> · {PAYMENT_STATUS[pago.status] || pago.status}</>
  }
  return AUDIT_LABELS[evento.action]?.(evento.metadata) || 'Movimiento del pedido'
}

function detalleDe(evento) {
  if (evento.type === 'comment') return null
  const pago = evento.payment
  return (
    <>
      {pago && (pago.accountSnapshot?.name || pago.reference) && <p>{[pago.accountSnapshot?.name ? `Cuenta: ${pago.accountSnapshot.name}` : '', pago.reference ? `Referencia: ${pago.reference}` : ''].filter(Boolean).join(' · ')}</p>}
      <p>{evento.user?.name ? `Por ${evento.user.name}` : 'Registrado por el sistema'} · {fechaCompleta(evento.at)}</p>
    </>
  )
}

function Evento({ evento, nombresEquipo, orderId }) {
  const [abierto, setAbierto] = useState(false)
  const detalle = detalleDe(evento)
  const idDetalle = `evento-${String(evento.id).replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <article className="flex gap-3" data-testid="pedido-evento">
      <Avatar user={evento.user || { name: 'Sistema' }} picture={evento.user?.picture} size="md" className="mt-0.5 shrink-0" title={evento.user?.name || 'Sistema'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-mute"><span className="font-semibold text-fore">{nombreActor(evento.user?.name)}</span><span>· {hora(evento.at)}</span></p>
        {evento.type === 'comment' ? (
          <>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{tramosDeMencion(evento.body, nombresEquipo).map((tramo, indice) => (tramo.mencion ? <span key={indice} className="font-semibold text-fono-light">{tramo.texto}</span> : <span key={indice}>{tramo.texto}</span>))}</p>
            {(evento.photos || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{evento.photos.map((photo) => <PhotoThumb key={photo.id} orderId={orderId} commentId={evento.id} photo={photo} />)}</div>}
          </>
        ) : (
          <>
            <p className="mt-0.5 break-words text-sm text-mute">{tituloDe(evento)}</p>
            {detalle && (
              <>
                <button type="button" aria-expanded={abierto} aria-controls={idDetalle} data-testid="pedido-evento-detalle" onClick={() => setAbierto((valor) => !valor)} className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-[11px] font-semibold text-fono-light hover:underline md:min-h-0">
                  {abierto ? 'Ocultar detalle' : 'Ver detalle'}<Icon name="chevron" className={cn('h-3 w-3 transition', abierto && 'rotate-180')} />
                </button>
                {abierto && <div id={idDetalle} className="mt-1 space-y-0.5 rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-mute">{detalle}</div>}
              </>
            )}
          </>
        )}
      </div>
    </article>
  )
}

// Cronología estilo Shopify: caja «Dejá un comentario…» con tu avatar y «Publicar»,
// y debajo los movimientos agrupados por día con usuario, hora y detalle expandible.
// Los comentarios son internos: nunca salen en la página pública ni en comprobantes.
export default function PedidoCronologia({ orderId, events = [], esDemo = false, nombresEquipo = [], usuarioActual, onPublicar }) {
  const [comentario, setComentario] = useState('')
  const [adjunto, setAdjunto] = useState(null)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const grupos = useMemo(() => agruparPorDia(events), [events])
  const consulta = consultaDeMencion(comentario)
  const sugerencias = consulta === null ? [] : nombresEquipo.filter((nombre) => nombre.toLowerCase().includes(consulta.toLowerCase())).slice(0, 5)
  const vacio = !comentario.trim() && !adjunto

  async function publicar(event) {
    event.preventDefault()
    if (publicando || vacio) return
    setPublicando(true); setError('')
    try {
      await onPublicar({ texto: comentario.trim(), adjunto })
      setComentario(''); setAdjunto(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (cause) { setError(cause?.message || 'No se pudo guardar el comentario.') } finally { setPublicando(false) }
  }

  return (
    <section className="ventas-f3-detail-section p-3" data-testid="pedido-cronologia" aria-label="Cronología">
      <h3 className="ventas-f3-card-title !px-0 !pt-0"><Icon name="clock" className="h-3.5 w-3.5" /> Cronología</h3>
      <form onSubmit={publicar} className="flex gap-3" data-testid="pedido-comentario-form">
        <Avatar user={usuarioActual} size="md" className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea aria-label="Comentario del pedido" rows={2} maxLength={2000} value={comentario} onChange={(event) => setComentario(event.target.value)} placeholder="Dejá un comentario… Usá @ para mencionar" className="rounded-xl px-3 py-2 text-sm" />
          {sugerencias.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-mute">Mencionar:</span>
              {sugerencias.map((nombre) => (
                <button key={nombre} type="button" onMouseDown={(event) => { event.preventDefault(); setComentario((texto) => insertarMencion(texto, nombre)) }} className="rounded-full border border-fono/30 bg-fono/10 px-2.5 py-1 text-xs font-semibold text-fono-light transition hover:bg-fono/20">@{nombre}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!esDemo && (
              <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-xs text-mute transition hover:border-fono hover:text-fore md:min-h-9">
                <Icon name="image" className="h-3.5 w-3.5" />{adjunto ? adjunto.name : 'Adjuntar foto o PDF'}
                <AttachmentInput inputRef={fileRef} className="hidden" onSelect={(file) => { setAdjunto(file); setError('') }} onError={setError} />
              </label>
            )}
            <p className="min-w-0 flex-1 basis-40 text-[11px] text-mute">Solo vos y el equipo ven los comentarios.</p>
            <Button type="submit" className="ml-auto" disabled={publicando || vacio}>{publicando ? 'Publicando…' : 'Publicar'}</Button>
          </div>
          {error && <Aviso tono="error" compact>{error}</Aviso>}
        </div>
      </form>
      <div className="mt-4 space-y-4">
        {grupos.map((grupo) => (
          <div key={grupo.clave} data-testid="pedido-cronologia-dia">
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-mute">{grupo.etiqueta}</h4>
            <div className="space-y-3 border-l border-ink-600 pl-3">
              {grupo.eventos.map((evento) => <Evento key={`${evento.type}-${evento.id}`} evento={evento} nombresEquipo={nombresEquipo} orderId={orderId} />)}
            </div>
          </div>
        ))}
        {!grupos.length && <p className="text-sm text-mute">Todavía no hay movimientos.</p>}
      </div>
    </section>
  )
}
