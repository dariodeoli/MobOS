import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer, Badge, Button, Input, MoneyInput, Select, Skeleton, Textarea, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import AttachmentInput from '@/components/shared/AttachmentInput'
import Avatar from '@/components/shared/Avatar'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { qrUnidad } from '@/lib/printing/qr'
import { api, API_URL } from '@/lib/api/client'

const statusLabel = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const conditionLabel = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const badgeTone = { AVAILABLE: 'green', RESERVED: 'orange', IN_TRANSIT: 'blue', DEFECTIVE: 'slate', SOLD: 'red' }
const EVENT_LABEL = { audit: 'Auditoría', transfer: 'Traslado', comment: 'Comentario', sale: 'Venta' }

const money = (value, currency) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return currency === 'USD' ? `US$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `Gs. ${Math.round(amount).toLocaleString('es-PY')}`
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
export default function UnidadDetalle({ unit, busy, canManage, locations = [], onClose, onChanged, onSell, onReserve, onVerify, onArrive, onLabel, onRelease, onAdjust, onRemove, onMove }) {
  const toast = useToast()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comentario, setComentario] = useState('')
  const [adjunto, setAdjunto] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef(null)
  const [codigos, setCodigos] = useState(null)
  const [nota, setNota] = useState(unit.notes || '')
  const [guardandoNota, setGuardandoNota] = useState(false)
  // Retiro/ajuste con autorización para roles que no gestionan inventario:
  // se pide desde acá y, con una aprobada, se ejecuta sobre la unidad.
  const [authStock, setAuthStock] = useState(null)
  const [authStockVersion, setAuthStockVersion] = useState(0)
  const [stockAction, setStockAction] = useState(null)
  const [stockMotivo, setStockMotivo] = useState('')
  const [stockError, setStockError] = useState('')
  const [stockBusy, setStockBusy] = useState(false)
  const [consignador, setConsignador] = useState(unit.consignorName || '')
  const [consignadorTel, setConsignadorTel] = useState(unit.consignorPhone || '')
  const [consignadorMonto, setConsignadorMonto] = useState(unit.consignorPyg === null || unit.consignorPyg === undefined ? '' : String(unit.consignorPyg))
  const [guardandoConsignacion, setGuardandoConsignacion] = useState(false)

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const payload = await api.get(`/api/inventory-units/${encodeURIComponent(unit.id)}/history`)
      setEvents(payload?.events || [])
    } catch (cause) { setError(cause?.message || 'No se pudo cargar la cronología.') } finally { setLoading(false) }
  }, [unit.id, canManage])
  useEffect(() => { load() }, [load])
  useEffect(() => { setNota(unit.notes || '') }, [unit.notes])

  // QR y código de barras de esta unidad (se generan al abrir el detalle). El
  // QR abre la unidad en la app; el código de barras conserva `MOBOS:<serial>`
  // para el escáner del local.
  useEffect(() => {
    let active = true
    const code = "MOBOS:" + unit.serial
    const enlace = qrUnidad(unit.serial)
    ;(async () => {
      try {
        const qr = enlace ? await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 0, width: 220 }) : ''
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        JsBarcode(svg, code, { format: 'CODE128', displayValue: false, width: 2, height: 54, margin: 0 })
        if (active) setCodigos({ qr, barcode: svg.outerHTML })
      } catch { if (active) setCodigos(null) }
    })()
    return () => { active = false }
  }, [unit.serial])

  async function guardarNota() {
    if (guardandoNota) return
    setGuardandoNota(true)
    try {
      await api.patch('/api/inventory-units', { id: unit.id, action: 'details', notes: nota.trim() })
      toast.success('Nota guardada.')
      onChanged?.()
    } catch (cause) { toast.error(cause?.message || 'No se pudo guardar la nota.') } finally { setGuardandoNota(false) }
  }

  // Equipo de un tercero: la tienda lo vende y le paga el monto acordado.
  async function guardarConsignacion() {
    if (guardandoConsignacion) return
    setGuardandoConsignacion(true)
    try {
      await api.patch('/api/inventory-units', { id: unit.id, action: 'details', consignorName: consignador.trim(), consignorPhone: consignadorTel.trim(), consignorPyg: consignadorMonto.trim() === '' ? null : Number(consignadorMonto) })
      toast.success(consignador.trim() ? 'Consignación guardada.' : 'Consignación quitada.')
      onChanged?.()
    } catch (cause) { toast.error(cause?.message || 'No se pudo guardar la consignación.') } finally { setGuardandoConsignacion(false) }
  }

  const verifier = unit.lastVerifiedBy?.name || (unit.verifiedByCode === 'VPE' ? 'Edgar' : unit.verifiedByCode === 'VPM' ? 'Matheo' : unit.verifiedByCode) || ''
  const verificador = verifier ? (unit.lastVerifiedBy?.id ? unit.lastVerifiedBy : { name: verifier }) : null
  // Antigüedad del stock: desde el ingreso de la unidad.
  const ingreso = unit.createdAt ? new Date(unit.createdAt) : null
  const diasEnStock = ingreso ? Math.max(0, Math.floor((Date.now() - ingreso.getTime()) / 86400000)) : null

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

  function abrirStock(accion) {
    setStockMotivo('')
    setStockError('')
    setStockAction(accion)
  }

  // Sin autorización aprobada la acción se convierte en solicitud; con una
  // aprobada se ejecuta el retiro/ajuste y la autorización queda consumida.
  async function confirmarStock() {
    const motivo = stockMotivo.trim()
    if (motivo.length < 3) { setStockError('Indicá un motivo de al menos 3 caracteres.'); return }
    if (!stockAction) return
    setStockBusy(true); setStockError('')
    try {
      if (authStock) {
        await api.patch('/api/inventory-units', { id: unit.id, action: stockAction, reason: motivo, authorizationId: authStock.id })
        toast.success('Unidad actualizada con la autorización de gerencia.')
      } else {
        await api.post('/api/authorizations', { kind: 'STOCK_ADJUST', requestedValue: { unitId: unit.id, action: stockAction, reason: motivo } })
        toast.success('Solicitud enviada', 'Gerencia tiene que resolverla; después ejecutá la acción desde esta unidad.')
      }
      setStockAction(null)
      setStockMotivo('')
      setAuthStockVersion(v => v + 1)
      await load()
      onChanged?.()
    } catch (cause) {
      setStockError(cause?.message || 'No se pudo completar la operación.')
    } finally { setStockBusy(false) }
  }

  return (
    <Drawer open onClose={onClose} title={unit.product?.name || 'Unidad'} className="w-full sm:max-w-xl">
      <div className="space-y-5">
        {/* Encabezado */}
        <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge data-testid="unidad-estado" color={badgeTone[unit.status] || 'slate'}>{statusLabel[unit.status] || unit.status}</Badge>
            <Badge color={unit.condition === 'NEW' ? 'green' : 'orange'}>{conditionLabel[unit.condition] || unit.condition}</Badge>
            {unit.reservationCustomer && <Badge color="orange">Atajado por {unit.reservationCustomer}</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wide">{unit.serial}</span>
            <button type="button" className="rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore" title="Copiar IMEI/serial" aria-label="Copiar IMEI/serial" onClick={() => { navigator.clipboard?.writeText(unit.serial).catch(() => {}); toast.success('IMEI copiado.') }}><Icon name="copy" className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mt-1 text-xs text-mute">{unit.branch?.name || 'Sucursal'}{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.product?.sku ? ` · ${unit.product.sku}` : ''}</p>
          {verificador && unit.lastVerifiedAt && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-mute" title={`Verificó ${verificador.name}`}><Avatar user={verificador} size="sm" /><span>Verificado por {verificador.name} · {relativeDate(unit.lastVerifiedAt)}{unit.verificationCount > 1 ? ` · ${unit.verificationCount} veces` : ''}</span></p>
          )}
          {!unit.lastVerifiedAt && <p className="mt-2 text-[11px] text-mute">Sin verificación física registrada.</p>}
        </section>

        {/* Datos */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Ficha del equipo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Ubicación</p>
              {canManage
                ? <Select aria-label="Ubicación de la unidad" className="mt-1" value={unit.locationId || ''} disabled={busy} onChange={event => ejecutar(() => onMove?.(unit, event.target.value || null))}>
                    <option value="">Sin ubicación</option>
                    {locations.filter(location => location.branchId === unit.branchId && location.isActive).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </Select>
                : <p className="mt-1 font-semibold">{unit.location?.name || '—'}</p>}
            </div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Batería</p><p className="mt-1 font-semibold">{unit.batteryHealth ? `${unit.batteryHealth}%` : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Proveedor</p><p className="mt-1 font-semibold">{unit.supplier?.name || unit.supplierName || '—'}{unit.supplier?.name && unit.supplier?.code ? ' (' + unit.supplier.code + ')' : ''}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Costo</p><p className="mt-1 font-semibold">{money(unit.originalCost, unit.costCurrency)}{unit.costPyg ? ` · ${money(unit.costPyg, 'PYG')}` : ''}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Ingresó a stock</p><p className="mt-1 font-semibold">{ingreso ? ingreso.toLocaleDateString('es-PY') : '—'}{diasEnStock != null ? <span className="ml-2 text-xs font-normal text-mute">{diasEnStock} {diasEnStock === 1 ? 'día' : 'días'} en stock</span> : null}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Compra</p><p className="mt-1 font-semibold">{unit.purchasedAt ? new Date(unit.purchasedAt).toLocaleDateString('es-PY') : '—'}</p></div>
            {unit.reservedUntil && <div className="col-span-2 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 p-3 text-sm"><p className="text-xs text-mute">Reserva</p><p className="mt-1 font-semibold">{unit.reservationCustomer || 'Cliente'} · vence {new Date(unit.reservedUntil).toLocaleString('es-PY')}</p></div>}
            <div className="col-span-2 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm">
              <p className="text-xs text-mute">Consignación de terceros</p>
              <p className="mt-1 text-xs text-mute">Si el equipo no es de la tienda, cargá quién lo dejó y cuánto hay que pagarle al venderse.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input aria-label="Consignador" maxLength={160} value={consignador} onChange={event => setConsignador(event.target.value)} placeholder="Nombre de quien lo dejó" className="min-h-9" autoCapitalize="words" />
                <Input aria-label="Teléfono del consignador" maxLength={40} value={consignadorTel} onChange={event => setConsignadorTel(event.target.value)} placeholder="Teléfono" className="min-h-9" autoCapitalize="none" />
                <MoneyInput aria-label="Monto a pagar al consignador" value={consignadorMonto} onValueChange={value => setConsignadorMonto(value === '' ? '' : String(value))} placeholder="A pagar (Gs)" className="min-h-9" />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-mute">{unit.consignorName ? `En consignación de ${unit.consignorName}${unit.consignorPyg ? ` · a pagar ${money(unit.consignorPyg, 'PYG')}` : ''}` : 'Sin consignación'}</span>
                <Button type="button" variant="outline" disabled={guardandoConsignacion || (consignador.trim() === (unit.consignorName || '') && consignadorTel.trim() === (unit.consignorPhone || '') && consignadorMonto.trim() === (unit.consignorPyg === null || unit.consignorPyg === undefined ? '' : String(unit.consignorPyg)))} onClick={guardarConsignacion}>{guardandoConsignacion ? 'Guardando…' : 'Guardar consignación'}</Button>
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-ink-800/60 p-3 text-sm"><p className="text-xs text-mute">Nota interna</p><div className="mt-1.5 flex flex-wrap items-center gap-2"><Input aria-label="Nota interna de la unidad" maxLength={500} value={nota} onChange={event => setNota(event.target.value)} placeholder="Raya lateral, caja dañada, accesorio faltante…" className="min-h-9 min-w-[12rem] flex-1" /><Button type="button" variant="outline" disabled={guardandoNota || nota.trim() === (unit.notes || "")} onClick={guardarNota}>{guardandoNota ? "Guardando…" : "Guardar nota"}</Button></div></div>
          </div>
        </section>

        {/* Códigos de esta unidad */}
        {codigos && (
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Códigos de esta unidad</h3>
            <p className="mt-1 text-xs text-mute">El QR y el código de barras identifican esta unidad física (etiquetas, escaneo y verificación).</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-3">
              <span className="min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: codigos.barcode }} />
              <img src={codigos.qr} alt={"QR de " + unit.serial} className="h-24 w-24" />
            </div>
            <p className="mt-2 font-mono text-[11px] text-mute">{unit.serial}</p>
          </section>
        )}

        {/* Acciones */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Acciones</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {unit.status === 'AVAILABLE' && <Button disabled={busy} onClick={() => ejecutar(() => onSell(unit))}>Vender</Button>}
            {unit.status === 'AVAILABLE' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onReserve(unit))}>Reservar</Button>}
            {unit.status === 'IN_TRANSIT' && <Button disabled={busy} onClick={() => ejecutar(() => onArrive(unit))}>Recibir en sucursal</Button>}
            {unit.status === 'RESERVED' && <Button disabled={busy} onClick={() => ejecutar(() => onSell(unit))}>Finalizar venta</Button>}
            {unit.status === 'RESERVED' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onRelease(unit.serial))}>Liberar reserva</Button>}
            {unit.status !== 'SOLD' && <Button variant="outline" disabled={busy} onClick={() => ejecutar(() => onVerify(unit))}>✓ Verificado</Button>}
            <Button variant="outline" onClick={() => onLabel(unit)}>Etiqueta</Button>
            <Button variant="outline" disabled={busy || ['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status)} onClick={() => ejecutar(() => onAdjust(unit))}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Enviar a revisión'}</Button>
            <Button variant="outline" disabled={busy || unit.status !== 'AVAILABLE'} onClick={() => ejecutar(() => onRemove(unit))}>Dar de baja</Button>
          </div>
        </section>

        {/* Retiro/ajuste con autorización para roles que no gestionan inventario */}
        {!canManage && !['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status) && (
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Autorización de stock</h3>
            <p className="mt-1 text-xs text-mute">Tu rol no retira ni ajusta unidades directamente: pedí autorización a gerencia y ejecutala desde acá.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {unit.status === 'AVAILABLE' && <Button variant="outline" disabled={stockBusy} onClick={() => abrirStock('remove')}>Dar de baja</Button>}
              <Button variant="outline" disabled={stockBusy} onClick={() => abrirStock('adjust')}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Enviar a revisión'}</Button>
            </div>
            <div className="mt-3">
              <AutorizacionBloque
                key={authStockVersion}
                kind="STOCK_ADJUST"
                entity="INVENTORY_UNIT"
                entityId={unit.id}
                sinMonto
                soloEstado
                titulo="Retiro o ajuste de la unidad"
                descripcion="Pedí autorización con el motivo; con una aprobada podés ejecutar el retiro o ajuste."
                onSelect={setAuthStock}
                bloqueado={stockBusy}
              />
            </div>
          </section>
        )}

        {/* Cronología */}
        <section className="rounded-2xl border border-ink-600 p-4" data-testid="unidad-cronologia">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-mute"><Icon name="clock" className="h-3.5 w-3.5" /> Cronología</h3>
          {!canManage && <p className="mt-2 text-sm text-mute">La cronología con comentarios y fotos está disponible para administración y gerencia.</p>}
          {canManage && (
            <>
              <form onSubmit={enviarComentario} className="mt-3 space-y-2">
                <Textarea aria-label="Comentario de la unidad" rows={2} maxLength={2000} value={comentario} onChange={event => setComentario(event.target.value)} placeholder="Escribí un comentario o evidencia para esta unidad…" />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-mute transition hover:border-fono hover:text-fore">
                    <Icon name="image" className="h-3.5 w-3.5" />{adjunto ? adjunto.name : 'Adjuntar foto o PDF'}
                    <AttachmentInput inputRef={fileRef} className="hidden" onSelect={file => { setAdjunto(file); setError('') }} onError={setError} />
                  </label>
                  <Button type="submit" disabled={subiendo || (!comentario.trim() && !adjunto)}>{subiendo ? 'Enviando…' : 'Comentar'}</Button>
                </div>
              </form>
              {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
              {loading && <div className="mt-4 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
              {!loading && <div className="mt-4 space-y-4">
                {events.map((event, index) => <article key={event.id || index} className="flex gap-3">
                  <span title={event.user?.name || 'Sistema'}><Avatar user={event.user || { name: 'Sistema' }} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-mute"><span className="font-semibold text-fore">{relativeDate(event.createdAt)}</span><span className="ml-2 rounded border border-ink-500 px-1.5 py-0.5 text-[10px]">{event.label || EVENT_LABEL[event.type] || event.type}</span></p>
                    {event.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-fore/90">{event.detail}</p> : null}
                    {(event.photos || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{event.photos.map(photo => <FotoMini key={photo.id} unitId={unit.id} commentId={event.id} photo={photo} />)}</div>}
                  </div>
                </article>)}
                {!events.length && <p className="text-sm text-mute">Todavía no hay movimientos para esta unidad.</p>}
              </div>}
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(stockAction)}
        onClose={() => { if (!stockBusy) setStockAction(null) }}
        title={stockAction === 'remove' ? 'Dar de baja la unidad' : unit.status === 'DEFECTIVE' ? 'Habilitar unidad' : 'Marcar en revisión'}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-mute">
            IMEI {unit.serial} · {authStock ? 'Hay una autorización aprobada: al confirmar se ejecuta la acción.' : 'Se envía la solicitud a gerencia con este motivo.'}
          </p>
          <Textarea rows={3} maxLength={500} value={stockMotivo} onChange={event => setStockMotivo(event.target.value)} placeholder="Indicá el motivo (mínimo 3 caracteres)" />
          {stockError && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-2 text-xs text-bad">{stockError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStockAction(null)} disabled={stockBusy}>Cancelar</Button>
            <Button type="button" onClick={confirmarStock} disabled={stockBusy || stockMotivo.trim().length < 3}>
              {stockBusy ? 'Guardando…' : authStock ? 'Ejecutar' : 'Solicitar autorización'}
            </Button>
          </div>
        </div>
      </Modal>
    </Drawer>
  )
}
