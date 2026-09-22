import { useCallback, useEffect, useRef, useState } from 'react'
import { qrDataUrl } from '@/lib/qr'
import { Aviso, Badge, Button, Drawer, Input, Label, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import AttachmentInput from '@/components/shared/AttachmentInput'
import Avatar from '@/components/shared/Avatar'
import MedidorBateria from '@/components/shared/MedidorBateria'
import CurrencySelect from '@/components/shared/CurrencySelect'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import JsBarcode from 'jsbarcode'
import { qrUnidad } from '@/lib/printing/qr'
import { api, apiFetch } from '@/lib/api/client'
import { conciliarDemoImei, consultasDemoImei, postDemoImei } from '@/lib/demoImei'
import { COSMETICOS, INSPECCION_ESTADOS, INSPECCION_ITEMS, locksDeVerificacion, resumenInspection } from '@/lib/phonecheck'
import { resources } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { cotizacionReferencia } from '@/lib/fx'
import { gs } from '@/utils/calculos'
import { montoTexto } from '@/utils/moneda'
import { colorCondicionUnidad, estadoInventario, etiquetaCondicionUnidad, sinCostoUnitario } from '@/utils/inventario'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { temaV2Activo } from '@/lib/temaV2'
import { cn } from '@/lib/utils'

const EVENT_LABEL = { audit: 'Auditoría', transfer: 'Traslado', comment: 'Comentario', sale: 'Venta' }

const money = (value, currency) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return montoTexto(amount, currency)
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
    apiFetch(`/api/inventory-units/${encodeURIComponent(unitId)}/comments/${encodeURIComponent(commentId)}/photos/${encodeURIComponent(photo.id)}`)
      .then(response => { if (!response.ok) throw new Error('sin foto'); return response.blob() })
      .then(blob => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) })
      .catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [unitId, commentId, photo.id])
  if (photo.mimeType === 'application/pdf') return <button type="button" className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2 py-1.5 text-xs text-fono-light" onClick={() => url && window.open(url, '_blank')}><Icon name="report" className="h-3.5 w-3.5" /> {photo.fileName}</button>
  if (!url) return <Skeleton className="h-16 w-16 rounded-lg bg-ink-700" />
  return <button type="button" onClick={() => window.open(url, '_blank')} className="overflow-hidden rounded-lg border border-ink-600 transition hover:border-fono"><img src={url} alt={photo.fileName} className="h-16 w-16 object-cover" /></button>
}

// Detalle premium de una unidad de inventario: ficha completa, acciones y
// cronología con comentarios y fotos (misma experiencia que los pedidos).
export default function UnidadDetalle({ unit, busy, canManage, locations = [], onClose, onChanged, onSell, onReserve, onVerify, onArrive, onLabel, onInforme, onCertificado, onRelease, onAdjust, onRemove, onMove }) {
  const toast = useToast()
  const { esDemo } = useSesion()
  // #193/#200: modo del adaptador visible ANTES de confirmar (real: simulado o vivo).
  const [imeiModo, setImeiModo] = useState('simulado')
  useEffect(() => {
    if (esDemo) return undefined
    let activo = true
    api.get('/api/imei').then(datos => { if (activo && datos?.modo) setImeiModo(datos.modo) }).catch(() => {})
    return () => { activo = false }
  }, [esDemo])
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
  // Costo del equipo: se puede cargar al recibir o completar después. En
  // moneda extranjera se guarda el monto original y su cotización; el total en
  // guaraníes lo calcula el backend.
  const costoInicial = () => ({ currency: unit.costCurrency || 'PYG', monto: unit.originalCost !== null && unit.originalCost !== undefined ? String(unit.originalCost) : unit.costPyg !== null && unit.costPyg !== undefined ? String(unit.costPyg) : '', rate: unit.exchangeRatePyg !== null && unit.exchangeRatePyg !== undefined ? String(unit.exchangeRatePyg) : '' })
  const [costo, setCosto] = useState(costoInicial)
  const [guardandoCosto, setGuardandoCosto] = useState(false)
  // #240 PhoneCheck
  const [inspeccion, setInspeccion] = useState(() => ({ items: unit.inspection?.items || {}, cosmetico: unit.inspection?.cosmetico || '', nota: unit.inspection?.nota || '', bateriaPct: unit.inspection?.bateriaPct ?? (unit.batteryHealth ?? ''), bateriaCiclos: unit.inspection?.bateriaCiclos ?? '', repuestosNoOem: unit.inspection?.repuestosNoOem || '' }))
  const [guardandoInspeccion, setGuardandoInspeccion] = useState(false)
  // Consulta de IMEI (#193/#200): precheck con costo visible, confirmación
  // explícita y resultado auditado. En demo solo SIMULA (sin llamadas).
  const [imeiFase, setImeiFase] = useState(null)
  const [imeiDatos, setImeiDatos] = useState(null)
  const [imeiError, setImeiError] = useState('')
  const [imeiBusy, setImeiBusy] = useState(false)
  const imeiRequestId = useRef(null)
  // #233: pantalla mínima de consultas IMEI con conciliación auditada (admin).
  const [consultasOpen, setConsultasOpen] = useState(false)
  const [consultasImei, setConsultasImei] = useState('')
  const [consultasFilas, setConsultasFilas] = useState([])
  const [consultaBusy, setConsultaBusy] = useState(false)
  const [consultaError, setConsultaError] = useState('')
  const [conciliando, setConciliando] = useState(null)
  useEffect(() => { setCosto(costoInicial()) }, [unit.costPyg, unit.originalCost, unit.costCurrency, unit.exchangeRatePyg]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      // #227: en demo la cronología sale de la propia unidad (sin API).
      const payload = esDemo ? { events: unit.events || [] } : await api.get(`/api/inventory-units/${encodeURIComponent(unit.id)}/history`)
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
        const qr = enlace ? await qrDataUrl(enlace, { margen: 0 }) : ''
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

  async function cambiarMonedaCosto(moneda) {
    setCosto(current => ({ ...current, currency: moneda }))
    if (moneda !== 'PYG' && !String(costo.rate || '').trim()) {
      const sugerida = await cotizacionReferencia()
      if (sugerida) setCosto(current => (String(current.rate || '').trim() ? current : { ...current, rate: String(sugerida) }))
    }
  }

  async function guardarCosto() {
    if (guardandoCosto) return
    setGuardandoCosto(true)
    try {
      const monto = String(costo.monto || '').trim()
      const payload = costo.currency === 'PYG'
        ? { costPyg: monto ? Number(monto) : null }
        : { originalCost: monto ? Number(monto) : null, ...(String(costo.rate || '').trim() ? { exchangeRatePyg: Number(costo.rate) } : {}) }
      await api.patch('/api/inventory-units', { id: unit.id, action: 'details', costCurrency: monto ? costo.currency : 'PYG', ...payload })
      toast.success(monto ? 'Costo guardado.' : 'Costo quitado: queda pendiente.')
      await load(); onChanged?.()
    } catch (cause) { toast.error(cause?.message || 'No se pudo guardar el costo.') } finally { setGuardandoCosto(false) }
  }

  async function buscarConsultasImei(event) {
    event.preventDefault()
    const imei = consultasImei.replace(/\D/g, '')
    if (imei.length !== 15) { setConsultaError('Ingresá el IMEI completo de 15 dígitos.'); return }
    setConsultaBusy(true); setConsultaError('')
    try {
      const filas = esDemo ? consultasDemoImei(imei) : await api.get(`/api/imei?imei=${encodeURIComponent(imei)}`).then(datos => datos?.consultas || [])
      setConsultasFilas(filas)
      if (!filas.length) setConsultaError('No hay consultas registradas para ese IMEI.')
    } catch (cause) { setConsultaError(cause?.message || 'No se pudieron cargar las consultas.') } finally { setConsultaBusy(false) }
  }
  async function guardarConciliacion(event) {
    event.preventDefault()
    if (!conciliando) return
    setConsultaBusy(true); setConsultaError('')
    try {
      const cuerpo = { action: 'conciliar', ...(conciliando.requestId ? { requestId: conciliando.requestId } : { id: conciliando.id }), status: conciliando.status, costUsd: Number(conciliando.costUsd) || 0.06, ...(conciliando.resolvedAt ? { resolvedAt: conciliando.resolvedAt } : {}), ...(conciliando.externalId ? { externalId: conciliando.externalId } : {}), note: conciliando.note }
      const actualizada = esDemo ? conciliarDemoImei(cuerpo) : await api.post('/api/imei', cuerpo)
      setConsultasFilas(filas => filas.map(fila => (fila.id === actualizada.id ? actualizada : fila)))
      setConciliando(null)
      toast.success('Consulta conciliada.')
    } catch (cause) { setConsultaError(cause?.message || 'No se pudo conciliar la consulta.') } finally { setConsultaBusy(false) }
  }

  // Precheck: valida el IMEI y muestra servicio, campos y COSTO antes de ejecutar.
  async function imeiPrecheck() {
    if (imeiBusy) return
    setImeiBusy(true); setImeiError(''); setImeiDatos(null); setImeiFase(null)
    imeiRequestId.current = null
    try {
      // #219: en demo el flujo es funcional contra el mock del backend.
      const datos = esDemo
        ? await postDemoImei({ action: 'precheck', imei: unit.serial, servicio: 'APPLE_BASIC' })
        : await api.post('/api/imei', { action: 'precheck', imei: unit.serial, servicio: 'APPLE_BASIC' })
      if (datos?.modo) setImeiModo(datos.modo)
      setImeiDatos(datos)
      setImeiFase('precheck')
    } catch (cause) {
      setImeiError(cause?.status === 403 ? 'Función paga: pedile a administración que habilite la consulta de IMEI.' : (cause?.message || 'No se pudo preparar la consulta.'))
    } finally { setImeiBusy(false) }
  }

  // Confirmación explícita: un requestId por intento evita dobles cobros.
  async function imeiConfirmar() {
    if (imeiBusy) return
    if (!imeiRequestId.current) imeiRequestId.current = globalThis.crypto?.randomUUID?.() || `imei-${unit.id}-${Date.now()}`
    setImeiBusy(true); setImeiError('')
    try {
      setImeiDatos(esDemo
        ? await postDemoImei({ action: 'checks', imei: unit.serial, servicio: 'APPLE_BASIC', confirm: true, requestId: imeiRequestId.current })
        : await api.post('/api/imei', { action: 'checks', imei: unit.serial, servicio: 'APPLE_BASIC', confirm: true, requestId: imeiRequestId.current }))
      setImeiFase('resultado')
    } catch (cause) {
      setImeiError(cause?.message || 'No se pudo consultar el IMEI.')
    } finally { setImeiBusy(false) }
  }

  // Equipo de un tercero: la tienda lo vende y le paga el monto acordado.
  async function guardarConsignacion() {    if (guardandoConsignacion) return
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
    <Drawer open onClose={onClose} title={unit.product?.name || 'Unidad'} className={cn('w-full sm:max-w-xl', temaV2Activo() && 'tema-v2')}>
      <div className="space-y-5">
        {/* Encabezado */}
        <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge data-testid="unidad-estado" color={estadoInventario(unit).tone}>{estadoInventario(unit).label}</Badge>
            <Badge color={colorCondicionUnidad(unit)}>{etiquetaCondicionUnidad(unit)}</Badge>
            {unit.reservationCustomer && <Badge color="orange">Atajado por {unit.reservationCustomer}</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wide">{unit.serial}</span>
            <button type="button" className="rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore" title="Copiar IMEI/serial" aria-label="Copiar IMEI/serial" onClick={() => { copiarAlPortapapeles(unit.serial); toast.success('IMEI copiado.') }}><Icon name="copy" className="h-3.5 w-3.5" /></button>
          </div>
          <p className="mt-1 text-xs text-mute">{unit.branch?.name || 'Sucursal'}{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.product?.sku ? ` · ${unit.product.sku}` : ''}</p>
          {verificador && unit.lastVerifiedAt && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-mute" title={`Verificó ${verificador.name}`}><Avatar user={verificador} size="sm" /><span>Verificado por {verificador.name} · {relativeDate(unit.lastVerifiedAt)}{unit.verificationCount > 1 ? ` · ${unit.verificationCount} veces` : ''}</span></p>
          )}
          {!unit.lastVerifiedAt && <p className="mt-2 text-[11px] text-mute">Sin verificación física registrada.</p>}
        </section>

        {/* Datos */}
        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className={ROTULO_SECCION}>Ficha del equipo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-ink-800/60 p-3" title="Depósito o sucursal donde está la unidad"><p className="text-xs text-mute">Ubicación</p>
              {canManage
                ? <Select aria-label="Ubicación de la unidad" className="mt-1" value={unit.locationId || ''} disabled={busy} onChange={event => ejecutar(() => onMove?.(unit, event.target.value || null))}>
                    <option value="">Sin ubicación</option>
                    {locations.filter(location => location.branchId === unit.branchId && location.isActive).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </Select>
                : <p className="mt-1 font-semibold">{unit.location?.name || '—'}</p>}
            </div>
            <div className="rounded-xl bg-ink-800/60 p-3" title="Salud de la batería informada al recibir la unidad"><MedidorBateria porcentaje={unit.batteryHealth} /></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Proveedor</p><p className="mt-1 font-semibold">{unit.supplier?.name || unit.supplierName || '—'}{unit.supplier?.name && unit.supplier?.code ? ' (' + unit.supplier.code + ')' : ''}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Costo</p><p className="mt-1 font-semibold">{sinCostoUnitario(unit) ? <span className="text-warn">Pendiente</span> : money(unit.originalCost, unit.costCurrency)}{!sinCostoUnitario(unit) && unit.costPyg ? ` · ${money(unit.costPyg, 'PYG')}` : ''}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Ingresó a stock</p><p className="mt-1 font-semibold">{ingreso ? ingreso.toLocaleDateString('es-PY') : '—'}{diasEnStock != null ? <span className="ml-2 text-xs font-normal text-mute">{diasEnStock} {diasEnStock === 1 ? 'día' : 'días'} en stock</span> : null}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Compra</p><p className="mt-1 font-semibold">{unit.purchasedAt ? new Date(unit.purchasedAt).toLocaleDateString('es-PY') : '—'}</p></div>
            {unit.reservedUntil && <div className="col-span-2 rounded-xl border border-reserved/30 bg-reserved/10 p-3 text-sm"><p className="text-xs text-mute">Reserva</p><p className="mt-1 font-semibold">{unit.reservationCustomer || 'Cliente'} · vence {new Date(unit.reservedUntil).toLocaleString('es-PY')}</p></div>}
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

        {/* Costo del equipo: se puede completar después de recibirlo */}
        <section className="rounded-2xl border border-ink-600 p-4" data-testid="unidad-costo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Costo del equipo</h3>
            {sinCostoUnitario(unit) ? <Badge color="orange">Pendiente</Badge> : <Badge color="green">Cargado</Badge>}
          </div>
          <p className="mt-1 text-xs text-mute">En guaraníes (sin decimales) o en otra moneda con la cotización del día. Si todavía no lo sabés, dejalo vacío: queda pendiente y lo completás después. El dato alimenta el costo de la venta y la ganancia.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <CurrencySelect aria-label="Moneda del costo" value={costo.currency} onChange={event => cambiarMonedaCosto(event.target.value)} />
            <MoneyInput aria-label="Monto del costo" currency={costo.currency} value={costo.monto} onValueChange={value => setCosto(current => ({ ...current, monto: value === '' ? '' : String(value) }))} placeholder="Monto (vacío = pendiente)" />
          </div>
          {costo.currency !== 'PYG' && (
            <div className="mt-2">
              <Label htmlFor="unidad-costo-cotizacion">Cotización del {costo.currency} en Gs.</Label>
              <MoneyInput id="unidad-costo-cotizacion" aria-label="Cotización" currency="USD" symbol="Gs." value={costo.rate} onValueChange={value => setCosto(current => ({ ...current, rate: value === '' ? '' : String(value) }))} placeholder="Ej. 7500" />
            </div>
          )}
          {costo.currency !== 'PYG' && costo.monto !== '' && Number(costo.rate) > 0 && <p className="mt-2 text-xs text-mute">Costo en Gs: <b className="text-fore">{gs(Number(costo.monto) * Number(costo.rate))}</b></p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-mute">{sinCostoUnitario(unit) ? 'Todavía sin costo.' : `Actual: ${money(unit.originalCost, unit.costCurrency)}${unit.costPyg !== null && unit.costPyg !== undefined ? ` · ${money(unit.costPyg, 'PYG')}` : ''}`}</span>
            <Button type="button" variant="outline" disabled={guardandoCosto} onClick={guardarCosto} data-testid="unidad-costo-guardar">{guardandoCosto ? 'Guardando…' : 'Guardar costo'}</Button>
          </div>
        </section>

        {/* Consulta de IMEI (#193/#200): costo antes, confirmación explícita y fuente/hora */}
        <section className="rounded-2xl border border-ink-600 p-4" data-testid="unidad-imei">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Consulta de IMEI</h3>
            <span className="flex items-center gap-2">{esDemo ? <Badge color="blue">Demo: simulado</Badge> : imeiModo === 'vivo' ? <Badge color="slate">Función paga</Badge> : <Badge color="blue">SIMULADO · Sin cobro</Badge>}{canManage && <Button type="button" variant="outline" className="h-7 px-2 text-xs" data-testid="imei-consultas-abrir" onClick={() => { setConsultasOpen(true); setConsultaError(''); setConsultasFilas([]) }}>Consultas IMEI</Button>}</span>
          </div>
          <p className="mt-1 text-xs text-mute">Estado del equipo en IMEIcheck (blacklist, Find My/iCloud, SIM lock, MDM, garantía). Se muestra el costo antes de confirmar y cada consulta queda auditada. Si no se puede verificar, se muestra como «No verificado», nunca «Limpio».</p>
          {!imeiFase && !imeiBusy && <Button type="button" variant="outline" className="mt-2" onClick={imeiPrecheck} data-testid="imei-precheck">Consultar IMEI (ver costo)</Button>}
          {imeiBusy && <p className="mt-2 text-xs text-mute" role="status">Consultando…</p>}
          {imeiError && <Aviso tono="error" className="mt-2">{imeiError}</Aviso>}
          {imeiFase === 'precheck' && imeiDatos && (
            <div className="mt-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3 text-sm">
              <p className="font-semibold text-fore">{imeiDatos.simulado || imeiModo !== 'vivo' ? `${imeiDatos.servicio?.nombre || 'Apple Basic'} · SIMULADO · Sin cobro (referencia US$ ${Number(imeiDatos.costoReferenciaUsd ?? imeiDatos.servicio?.precioUsd ?? 0).toFixed(2)})` : `${imeiDatos.servicio?.nombre || 'Apple Basic'} · US$ ${Number(imeiDatos.costoEstimadoUsd || 0).toFixed(2)}`}</p>
              <p className="mt-1 text-xs text-mute">Campos: {(imeiDatos.servicio?.campos || []).join(' · ')}</p>
              {imeiDatos.advertencia && <p className="mt-1 text-xs text-warn">{imeiDatos.advertencia}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" disabled={imeiBusy} onClick={imeiConfirmar} data-testid="imei-confirmar">{imeiDatos.simulado || imeiModo !== 'vivo' ? 'Confirmar consulta simulada (sin cobro)' : `Confirmar consulta (US$ ${Number(imeiDatos.costoEstimadoUsd || 0).toFixed(2)})`}</Button>
                <Button type="button" variant="ghost" disabled={imeiBusy} onClick={() => { setImeiFase(null); setImeiDatos(null) }}>Cancelar</Button>
              </div>
            </div>
          )}
          {imeiFase === 'resultado' && imeiDatos && (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={imeiDatos.status === 'verificado' ? 'green' : imeiDatos.status === 'parcial' || imeiDatos.status === 'conciliar' ? 'orange' : 'slate'}>{imeiDatos.etiqueta || (imeiDatos.status === 'verificado' ? 'Verificado' : 'No verificado')}</Badge>
                {(imeiDatos.simulado || imeiDatos.esMock) ? <Badge color="blue">SIMULADO</Badge> : <span className="text-xs text-mute">Costo {imeiDatos.status === 'conciliar' ? 'estimado ' : ''}US$ {Number(imeiDatos.costUsd || 0).toFixed(2)} · {imeiDatos.serviceName || 'Apple Basic'}</span>}
                {(imeiDatos.simulado || imeiDatos.esMock) && <span className="text-xs text-mute">Sin cobro: respuesta simulada de la fase 1</span>}
              </div>
              {(imeiDatos.campos || imeiDatos.normalized || []).map(campo => (
                <p key={campo.clave} className="text-xs"><span className="font-semibold text-fore">{campo.etiqueta}:</span> <span className={campo.valor ? 'text-fore/90' : 'text-mute'}>{campo.valor || 'No verificado'}</span> <span className="text-mute">· {campo.fuente}{campo.hora ? ` · ${new Date(campo.hora).toLocaleString('es-PY')}` : ''}</span></p>
              ))}
              <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setImeiFase(null); setImeiDatos(null) }}>Cerrar</Button>
            </div>
          )}
        </section>

                {/* #240 PhoneCheck: checklist de inspección con semáforo, puntaje y grado */}
        <section className="rounded-2xl border border-ink-600 p-4" data-testid="unidad-phonecheck">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>PhoneCheck · Inspección</h3>
            {(() => { const { puntaje, grado } = resumenInspection(inspeccion); return puntaje === null
              ? <Badge color="slate">Sin inspeccionar</Badge>
              : <span className="flex items-center gap-2"><Badge color={grado === 'A' ? 'green' : grado === 'B' ? 'orange' : 'red'}>Grado {grado}</Badge><span className="text-xs text-mute">{puntaje}/100</span></span> })()}
          </div>
          <p className="mt-1 text-xs text-mute">Semáforo por ítem; si algo falla o queda con observación, agregá una nota. El grado A/B/C se calcula del checklist (A ≥ 90, B ≥ 75).</p>
          <div className="mt-3 space-y-2">
            {INSPECCION_ITEMS.map(item => {
              const actual = inspeccion.items[item.clave] || {}
              return <div key={item.clave} className="grid gap-2 rounded-xl border border-ink-600 p-2 sm:grid-cols-[minmax(11rem,1fr)_minmax(0,1.4fr)]" title={item.ayuda}>
                <span className="flex items-center gap-2 text-sm"><span className={`h-2 w-2 shrink-0 rounded-full ${INSPECCION_ESTADOS[actual.estado]?.tone === 'green' ? 'bg-ok' : INSPECCION_ESTADOS[actual.estado]?.tone === 'orange' ? 'bg-warn' : INSPECCION_ESTADOS[actual.estado]?.tone === 'red' ? 'bg-bad' : 'bg-mute'}`} /><b className="font-semibold text-fore">{item.label}</b></span>
                <span className="flex flex-wrap items-center gap-1">
                  {Object.entries(INSPECCION_ESTADOS).map(([clave, estado]) => <button key={clave} type="button" onClick={() => setInspeccion(actual2 => ({ ...actual2, items: { ...actual2.items, [item.clave]: { ...actual2.items[item.clave], estado: clave } } }))} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${actual.estado === clave ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:border-fono/40'}`}>{estado.label}</button>)}
                  <input placeholder="Nota / evidencia" aria-label={`Nota de ${item.label}`} value={actual.nota || ''} onChange={event => setInspeccion(actual2 => ({ ...actual2, items: { ...actual2.items, [item.clave]: { ...actual2.items[item.clave], nota: event.target.value } } }))} className="min-w-[8rem] flex-1 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-fore outline-none focus:border-fono" />
                </span>
              </div>
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Input aria-label="Batería %" inputMode="numeric" maxLength={3} placeholder="Batería %" value={inspeccion.bateriaPct} onChange={event => setInspeccion(actual => ({ ...actual, bateriaPct: event.target.value.replace(/\D/g, '') }))} />
            <Input aria-label="Ciclos de batería" inputMode="numeric" maxLength={5} placeholder="Ciclos" value={inspeccion.bateriaCiclos} onChange={event => setInspeccion(actual => ({ ...actual, bateriaCiclos: event.target.value.replace(/\D/g, '') }))} />
            <Input aria-label="Repuestos no OEM" placeholder="Repuestos no OEM / reparaciones" value={inspeccion.repuestosNoOem} onChange={event => setInspeccion(actual => ({ ...actual, repuestosNoOem: event.target.value }))} />
            <Button type="button" variant="outline" disabled={imeiBusy} title="Corre la verificación de IMEI y trae los bloqueos al checklist" onClick={async () => { await imeiPrecheck(); await imeiConfirmar(); setInspeccion(actual => ({ ...actual, fuente: 'IMEIcheck' })) }}>{imeiBusy ? 'Verificando…' : 'Verificar y completar'}</Button>
          </div>
          {(() => { const chips = locksDeVerificacion(imeiDatos || {}); if (!chips.length) return null; return <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips.map(chip => <span key={chip.clave} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${chip.ok ? 'border-ok/40 text-ok' : 'border-bad/40 text-bad'}`} title={`${chip.label}: ${chip.valor}`}>{chip.label}: {chip.valor}</span>)}</div> })()}
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Select aria-label="Cosmético" value={inspeccion.cosmetico} onChange={event => setInspeccion(actual => ({ ...actual, cosmetico: event.target.value }))}><option value="">Cosmético…</option>{COSMETICOS.map(valor => <option key={valor} value={valor}>{valor}</option>)}</Select>
            <Input aria-label="Nota general de inspección" placeholder="Nota general" value={inspeccion.nota} onChange={event => setInspeccion(actual => ({ ...actual, nota: event.target.value }))} />
            <Button type="button" disabled={guardandoInspeccion || busy} data-testid="unidad-phonecheck-guardar" onClick={async () => { setGuardandoInspeccion(true); try { await resources.inventoryUnits.update({ id: unit.id, action: 'inspection', inspection: inspeccion }); toast.success('Inspección guardada.'); await load(); onChanged?.() } catch (cause) { toast.error(cause?.message || 'No se pudo guardar la inspección.') } finally { setGuardandoInspeccion(false) } }}>{guardandoInspeccion ? 'Guardando…' : 'Guardar inspección'}</Button>
          </div>
        </section>

                <Modal open={consultasOpen} onClose={() => setConsultasOpen(false)} title="Consultas IMEI · Conciliar" size="corto">
          <form onSubmit={buscarConsultasImei} className="flex flex-wrap items-end gap-2">
            <Input aria-label="IMEI a consultar" inputMode="numeric" maxLength={15} value={consultasImei} onChange={event => setConsultasImei(event.target.value.replace(/\D/g, ''))} placeholder="IMEI de 15 dígitos" className="min-w-[10rem] flex-1" />
            <Button type="submit" disabled={consultaBusy} data-testid="imei-consultas-buscar">{consultaBusy ? 'Buscando…' : 'Buscar'}</Button>
          </form>
          {consultaError && <Aviso tono="error" className="mt-2">{consultaError}</Aviso>}
          <div className="mt-3 space-y-2" data-testid="imei-consultas-lista">
            {consultasFilas.map(fila => <article key={fila.id} className="rounded-xl border border-ink-600 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Badge color={fila.status === 'verificado' ? 'green' : fila.status === 'conciliar' ? 'orange' : 'slate'}>{fila.etiqueta || fila.status}</Badge><span className="text-mute">{fila.imei || ''} · US$ {Number(fila.costUsd || 0).toFixed(2)} · {fila.requestedAt ? new Date(fila.requestedAt).toLocaleString('es-PY') : ''}</span></span>
                {fila.status === 'conciliar' && <Button type="button" className="h-7 px-2 text-xs" data-testid={`imei-conciliar-${fila.id}`} onClick={() => setConciliando({ ...fila, status: 'verificado', costUsd: fila.costUsd || 0.06, resolvedAt: '', externalId: '', note: '' })}>Conciliar</Button>}
              </div>
              {conciliando?.id === fila.id && <form onSubmit={guardarConciliacion} className="mt-2 grid gap-2 sm:grid-cols-2">
                <Select aria-label="Estado conciliado" value={conciliando.status} onChange={event => setConciliando(actual => ({ ...actual, status: event.target.value }))}><option value="verificado">Verificado</option><option value="parcial">Parcial</option><option value="fallido">Fallido</option></Select>
                <Input aria-label="Costo real USD" inputMode="decimal" value={conciliando.costUsd} onChange={event => setConciliando(actual => ({ ...actual, costUsd: event.target.value.replace(/[^0-9.]/g, '') }))} placeholder="Costo real US$" />
                <Input aria-label="Fecha del panel" type="datetime-local" value={conciliando.resolvedAt} onChange={event => setConciliando(actual => ({ ...actual, resolvedAt: event.target.value }))} />
                <Input aria-label="Orden del proveedor" value={conciliando.externalId} onChange={event => setConciliando(actual => ({ ...actual, externalId: event.target.value }))} placeholder="Orden del proveedor (opcional)" />
                <Input aria-label="Nota de conciliación" value={conciliando.note} onChange={event => setConciliando(actual => ({ ...actual, note: event.target.value }))} placeholder="Nota (ej. iCloud/US Block clean ≠ blacklist mundial)" className="sm:col-span-2" />
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={consultaBusy} data-testid="imei-conciliar-guardar">{consultaBusy ? 'Guardando…' : 'Guardar conciliación'}</Button><Button type="button" variant="ghost" onClick={() => setConciliando(null)}>Cancelar</Button></div>
              </form>}
            </article>)}
          </div>
        </Modal>

        {/* Códigos de esta unidad */}
        {codigos && (
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className={ROTULO_SECCION}>Códigos de esta unidad</h3>
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
          <h3 className={ROTULO_SECCION}>Acciones</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {unit.status === 'AVAILABLE' && <Button disabled={busy} title="Cargar la venta de esta unidad" onClick={() => ejecutar(() => onSell(unit))}>Vender</Button>}
            {unit.status === 'AVAILABLE' && <Button variant="outline" disabled={busy} title="Apartar la unidad para un cliente" onClick={() => ejecutar(() => onReserve(unit))}>Reservar</Button>}
            {unit.status === 'IN_TRANSIT' && <Button disabled={busy} title="Confirmar la llegada de la unidad a esta sucursal" onClick={() => ejecutar(() => onArrive(unit))}>Recibir en sucursal</Button>}
            {unit.status === 'RESERVED' && <Button disabled={busy} title="Cerrar la venta de la unidad reservada" onClick={() => ejecutar(() => onSell(unit))}>Finalizar venta</Button>}
            {unit.status === 'RESERVED' && <Button variant="outline" disabled={busy} title="Soltar la reserva y dejar la unidad disponible" onClick={() => ejecutar(() => onRelease(unit.serial))}>Liberar reserva</Button>}
            {unit.status !== 'SOLD' && <Button variant="outline" disabled={busy} title="Registrar la verificación física ahora" onClick={() => ejecutar(() => onVerify(unit))}>✓ Verificado</Button>}
            <Button variant="outline" title="Imprimir la etiqueta de esta unidad" onClick={() => onLabel(unit)}>Etiqueta</Button>
            <Button variant="outline" title="Imprimir el informe del dispositivo (80 mm o A4) con el QR al informe público" onClick={() => onInforme?.(unit)}>Informe</Button>
            <Button variant="outline" title="Imprimir el certificado de la inspección (grado, puntaje y checklist) con el QR al informe público" onClick={() => onCertificado?.(unit)}>Certificado</Button>
            <Button variant="outline" disabled={busy || ['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status)} title={unit.status === 'DEFECTIVE' ? 'Devolver la unidad al stock disponible' : 'Marcar la unidad en revisión con un motivo'} onClick={() => ejecutar(() => onAdjust(unit))}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Enviar a revisión'}</Button>
            <Button variant="outline" disabled={busy || unit.status !== 'AVAILABLE'} title="Sacar la unidad del stock (queda en Eliminados)" onClick={() => ejecutar(() => onRemove(unit))}>Dar de baja</Button>
          </div>
        </section>

        {/* Retiro/ajuste con autorización para roles que no gestionan inventario */}
        {!canManage && !['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status) && (
          <section className="rounded-2xl border border-ink-600 p-4">
            <h3 className={ROTULO_SECCION}>Autorización de stock</h3>
            <p className="mt-1 text-xs text-mute">Tu rol no retira ni ajusta unidades directamente: pedí autorización a gerencia y ejecutala desde acá.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {unit.status === 'AVAILABLE' && <Button variant="outline" disabled={stockBusy} title="Sacar la unidad del stock (queda en Eliminados)" onClick={() => abrirStock('remove')}>Dar de baja</Button>}
              <Button variant="outline" disabled={stockBusy} title={unit.status === 'DEFECTIVE' ? 'Devolver la unidad al stock disponible' : 'Marcar la unidad en revisión con un motivo'} onClick={() => abrirStock('adjust')}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Enviar a revisión'}</Button>
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
          <h3 className={cn('flex items-center gap-2', ROTULO_SECCION)}><Icon name="clock" className="h-3.5 w-3.5" /> Cronología</h3>
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
              {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
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
        title={stockAction === 'remove' ? 'Dar de baja la unidad' : unit.status === 'DEFECTIVE' ? 'Habilitar unidad' : 'Marcar en revisión'} size="formulario">
        <div className="space-y-3">
          <p className="text-sm text-mute">
            IMEI {unit.serial} · {authStock ? 'Hay una autorización aprobada: al confirmar se ejecuta la acción.' : 'Se envía la solicitud a gerencia con este motivo.'}
          </p>
          <Textarea rows={3} maxLength={500} value={stockMotivo} onChange={event => setStockMotivo(event.target.value)} placeholder="Indicá el motivo (mínimo 3 caracteres)" />
          {stockError && <Aviso tono="error" compact>{stockError}</Aviso>}
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
