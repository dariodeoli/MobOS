import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer, Badge, Button, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api, API_URL } from '@/lib/api/client'

const statusLabel = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const conditionLabel = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const badgeTone = { AVAILABLE: 'green', RESERVED: 'orange', IN_TRANSIT: 'blue', DEFECTIVE: 'slate', SOLD: 'red' }
const EVENT_LABEL = { audit: 'Auditoría', transfer: 'Traslado', comment: 'Comentario' }

const money = (value, currency) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return currency === 'USD' ? `US$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `Gs. ${Math.round(amount).toLocaleString('es-PY')}`
}
function iniciales(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || '?' }
function Avatar({ name, picture, size = 'sm' }) {
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-fono to-fono-dark font-bold text-onbrand ${size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'}`}>{picture ? <img src={picture} referrerPolicy="no-referrer" alt="" className="h-full w-full object-cover" /> : iniciales(name)}</span>
}
function relativeDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return `Hoy ${hora}`
  return `${date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} ${hora}`
}

// Miniatura de foto de comentario descargada con la sesión activa.
function FotoMini({ unitId, commentId, photo }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true; let objectUrl = ''
    fetch(`${API_URL}/api/inventory-units/${encodeURIComponent(unitId)}/comments/${encodeURIComponent(commentId)}/photos/${encodeURIComponent(photo.id)}`, { credentials: 'include' })
      .then(response => { if (!response.ok) throw new Error('sin foto'); return response.blob() })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [unitId, commentId, photo.id])
  if (photo.mimeType === 'application/pdf') return <button type="button" className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2 py-1.5 text-xs text-fono-light" onClick={() => url && window.open(url, '_blank')}><Icon name="report" className="h-3.5 w-3.5" /> {photo.fileName}</button>
  if (!url) return <span className="h-16 w-16 animate-pulse rounded-lg bg-ink-700" />
  return <button type="button" onClick={() => window.open(url, '_blank')} className="overflow-hidden rounded-lg border border-ink-600 transition hover:border-fono"><img src={url} alt={photo.fileName} className="h-16 w-16 object-cover" /></button>
}

// Detalle premium de una unidad de inventario: ficha completa, acciones y
// cronología con comentarios y fotos (misma experiencia que los pedidos).
export default function UnidadDetalle({ unit, perfilEmpresa, busy, canManage, onClose, onChanged, onSell, onReserve, onVerify, onArrive, onLabel, onRelease, onAdjust, onRemove }) {
  const toast = useToast()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comentario, setComentario] = useState('')
  const [adjunto, setAdjunto] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const payload = await api.get(`/api/inventory-units/${encodeURIComponent(unit.id)}/history`)
      setEvents(payload?.events || [])
    } catch (cause) { setError(cause?.message || 'No se pudo cargar la cronología.') } finally { setLoading(false) }
  }, [unit.id, canManage])
  useEffect(() => { load() }, [load])

  const verifier = unit.lastVerifiedBy?.name || (unit.verifiedByCode === 'VPE' ? 'Edgar' : unit.verifiedByCode === 'VPM' ? 'Matheo' : unit.verifiedByCode) || ''
  const verifierName = verifier === 'Administrador' && perfilEmpresa?.name ? perfilEmpresa.name : verifier

  async function enviarComentario(event) {
    event.preventDefault()
    if (subiendo || (!comentario.trim() && !adjunto)) return
    setSubiendo(true); setError('')
    try {
      const form = new FormData()
      if (comentario.trim()) form.append('body', comentario.trim())
      if (adjunto) form.append('file', adjunto)
      await api.post(`/api/inventory-units/${encodeURIComponent(unit.id)}/comments`, form)
      setComentario(''); setAdjunto(null); if (fileRef.current) fileRef.current.value = ''
      await load(); onChanged?.()
    } catch (cause) { setError(cause?.message || 'No se pudo guardar el comentario.') } finally { setSubiendo(false) }
  }

  function ejecutar(accion) { accion?.(); onChanged?.() }

  return (
    <Drawer open onClose={onClose} title={unit.product?.name || 'Unidad'} className="w-full sm:max-w-xl">
      <div className="space-y-5">
        {/* Encabezado */}
        <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={badgeTone[unit.status] || 'slate'}>{statusLabel[unit.status] || unit.status}</Badge>
            <Badge color={unit.condition === 'NEW' ? 'green' : 'orange'}>{conditionLabel[unit.condition] || unit.condition}</Badge>
            {unit.reservationCustomer && <Badge color="orange">Atajado por {unit.reservationCustomer}</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wide">{unit.serial}</span>
            <button type="button" className="rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore" title="Copiar IMEI/serial" aria-label="Copiar IMEI/serial" onClick={() => { navigator.clipboard?.writeText(unit.serial).catch(() => {}); toast.success('IMEI copiado.') }}><Icon name="copy" className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mt-1 text-xs text-mute">{unit.branch?.name || 'Sucursal'}{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.product?.sku ? ` · ${unit.product.sku}` : ''}</p>
          {verifierName && unit.lastVerifiedAt && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-mute"><Avatar name={verifierName} picture={perfilEmpresa?.picture} size="sm" /><span>Verificó {verifierName} · {relativeDate(unit.lastVerifiedAt)}{unit.verificationCount > 1 ? ` · ${unit.verificationCount} veces` : ''}</span></p>
          )}
          {!unit.lastVerifiedAt && <p className="mt-2 text-[11px] text-mute">Sin verificación física registrada.</p>}
        </section>

        {/* Datos */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Ficha del equipo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Batería</p><p className="mt-1 font-semibold">{unit.batteryHealth ? `${unit.batteryHealth}%` : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Proveedor</p><p className="mt-1 font-semibold">{unit.supplierName || '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Costo</p><p className="mt-1 font-semibold">{money(unit.originalCost, unit.costCurrency)}{unit.costPyg ? ` · ${money(unit.costPyg, 'PYG')}` : ''}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Compra</p><p className="mt-1 font-semibold">{unit.purchasedAt ? new Date(unit.purchasedAt).toLocaleDateString('es-PY') : '—'}</p></div>
            {unit.reservedUntil && <div className="col-span-2 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 p-3 text-sm"><p className="text-xs text-mute">Reserva</p><p className="mt-1 font-semibold">{unit.reservationCustomer || 'Cliente'} · vence {new Date(unit.reservedUntil).toLocaleString('es-PY')}</p></div>}
            {unit.notes && <div className="col-span-2 rounded-xl bg-ink-800/60 p-3 text-sm"><p className="text-xs text-mute">Nota</p><p className="mt-1">{unit.notes}</p></div>}
          </div>
        </section>

        {/* Acciones */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Acciones</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {unit.status === 'AVAILABLE' && <Button disabled={busy} onClick={() => ejecutar(() => onSell(unit))}>Vender</Button>}
            {unit.status === 'AVAILABLE' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onReserve(unit))}>Reservar</Button>}
            {unit.status === 'IN_TRANSIT' && <Button disabled={busy} onClick={() => ejecutar(() => onArrive(unit))}>Recibir en sucursal</Button>}
            {unit.status === 'RESERVED' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onRelease(unit.serial))}>Liberar reserva</Button>}
            {unit.status !== 'SOLD' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onVerify(unit))}>✓ Verificado</Button>}
            <Button variant="outline" onClick={() => onLabel(unit)}>Etiqueta</Button>
            <Button variant="outline" disabled={busy || ['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status)} onClick={() => ejecutar(() => onAdjust(unit))}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Marcar en revisión'}</Button>
            <Button variant="outline" disabled={busy || unit.status !== 'AVAILABLE'} onClick={() => ejecutar(() => onRemove(unit))}>Retirar</Button>
          </div>
        </section>

        {/* Cronología */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="clock" className="h-3.5 w-3.5" /> Cronología</h3>
          {!canManage && <p className="mt-2 text-sm text-mute">La cronología con comentarios y fotos está disponible para administración y gerencia.</p>}
          {canManage && (
            <>
              <form onSubmit={enviarComentario} className="mt-3 space-y-2">
                <textarea aria-label="Comentario de la unidad" rows={2} maxLength={2000} value={comentario} onChange={event => setComentario(event.target.value)} placeholder="Escribí un comentario o evidencia para esta unidad…" className="w-full rounded-xl border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-fore outline-none transition focus:border-fono" />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-mute transition hover:border-fono hover:text-fore">
                    <Icon name="image" className="h-3.5 w-3.5" />{adjunto ? adjunto.name : 'Adjuntar foto o PDF'}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={event => setAdjunto(event.target.files?.[0] || null)} />
                  </label>
                  <Button type="submit" disabled={subiendo || (!comentario.trim() && !adjunto)}>{subiendo ? 'Enviando…' : 'Comentar'}</Button>
                </div>
              </form>
              {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
              {loading && <div className="mt-4 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
              {!loading && <div className="mt-4 space-y-4">
                {events.map((event, index) => <article key={event.id || index} className="flex gap-3">
                  <Avatar name={event.user?.name || 'Sistema'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{event.user?.name || 'Sistema'}<span className="ml-2 font-normal text-mute">{relativeDate(event.createdAt)}</span><span className="ml-2 rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-normal text-mute">{EVENT_LABEL[event.type] || event.type}</span></p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fore/90">{event.detail}</p>
                    {(event.photos || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{event.photos.map(photo => <FotoMini key={photo.id} unitId={unit.id} commentId={event.id} photo={photo} />)}</div>}
                  </div>
                </article>)}
                {!events.length && <p className="text-sm text-mute">Todavía no hay movimientos para esta unidad.</p>}
              </div>}
            </>
          )}
        </section>
      </div>
    </Drawer>
  )
}
