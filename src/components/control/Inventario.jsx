import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { getProductos, modoDatosActual } from '@/lib/storage'
import { Card, Button, Input, Badge, Modal, Select, Textarea, EmptyState, Skeleton, MoneyInput } from '@/components/ui'
import { resources } from '@/lib/api'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { printReservationReceipt } from '@/components/shared/OrderReceipt'

const statusLabel = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const conditionLabel = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const EVENT_TYPE_LABEL = { audit: 'Auditoría', transfer: 'Traslado' }
const VERIFIER_NAMES = { VPE: 'Edgar', VPM: 'Matheo' }
// Tonos de fila como la planilla: nuevos verde, semis amarillo, atajando/reservado
// lila, vendido rojo y asistencia/tránsito celeste.
const rowTone = unit => unit.status === 'SOLD' ? 'border-l-4 border-l-bad/70 bg-bad/10' : unit.status === 'RESERVED' ? 'border-l-4 border-l-[#8b5cf6]/80 bg-[#8b5cf6]/10' : unit.status === 'IN_TRANSIT' || unit.status === 'DEFECTIVE' ? 'border-l-4 border-l-sky-400/70 bg-sky-400/10' : unit.condition === 'NEW' ? 'border-l-4 border-l-ok/70 bg-ok/10' : 'border-l-4 border-l-warn/70 bg-warn/10'
const badgeTone = unit => unit.status === 'AVAILABLE' ? (unit.condition === 'NEW' ? 'green' : 'orange') : unit.status === 'RESERVED' ? 'orange' : unit.status === 'IN_TRANSIT' ? 'blue' : unit.status === 'DEFECTIVE' ? 'slate' : 'red'
const formatCost = unit => {
  const amount = Number(unit.originalCost)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return unit.costCurrency === 'USD' ? `US$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `Gs. ${Math.round(amount).toLocaleString('es-PY')}`
}
const verifiedLabel = unit => {
  const date = unit.lastVerifiedAt ? new Date(unit.lastVerifiedAt).toLocaleDateString('es-PY') : ''
  const name = VERIFIER_NAMES[unit.verifiedByCode] ? ` (${VERIFIER_NAMES[unit.verifiedByCode]})` : ''
  return unit.verifiedByCode || date ? `OK ${unit.verifiedByCode || '—'}${name}${date ? ` · ${date}` : ''}` : ''
}
const normalizeScan = (value = '') => value.trim().replace(/^MOBOS:/i, '').replace(/[\s-]+/g, '').toUpperCase()
const safe = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

async function printLabel(unit) {
  const product = unit.product || {}
  const serial = safe(unit.serial)
  const lastFour = safe(unit.serial?.slice(-4) || '----')
  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) return
  const code = `MOBOS:${unit.serial}`
  const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(barcodeSvg, code, { format: 'CODE128', displayValue: false, width: 1.2, height: 38, margin: 0 })
  let qr = ''
  try { qr = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 0, width: 150 }) } catch { /* La etiqueta conserva el código de barras si el QR no puede renderizarse. */ }
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${lastFour}</title><style>@page{size:58mm auto;margin:2mm}body{width:54mm;margin:0;font-family:Arial,sans-serif;color:#111}.brand{color:#0c8876;font-size:9px;font-weight:900;letter-spacing:1px}.name{font-size:12px;font-weight:800;margin:2mm 0}.meta{font-size:8px;line-height:1.5}.last{font-size:30px;font-weight:900;letter-spacing:3px;text-align:center;margin:2mm 0}.serial{border-top:1px dashed #777;padding-top:2mm;font-size:7px;word-break:break-all}.codes{display:flex;align-items:center;gap:2mm;margin-top:2mm}.barcode{width:34mm}.qr{width:16mm;height:16mm}</style></head><body><div class="brand">MOBOS · ETIQUETA DE STOCK</div><div class="name">${safe(product.name)}</div><div class="meta">${safe(conditionLabel[unit.condition] || unit.condition)}${unit.batteryHealth ? ` · Batería ${safe(unit.batteryHealth)}%` : ''}${unit.location?.name ? ` · ${safe(unit.location.name)}` : ''}</div><div class="last">${lastFour}</div><div class="serial">IMEI / Serial: ${serial}</div><div class="codes"><div class="barcode">${barcodeSvg.outerHTML}</div>${qr ? `<img class="qr" src="${qr}" alt="QR">` : ''}</div><script>window.onload=()=>window.print()<\/script></body></html>`)
  popup.document.close()
}

function CameraScan({ onDetected, onClose, continuous = false }) {
  const video = useRef(null)
  const [message, setMessage] = useState('Preparando cámara…')
  useEffect(() => {
    let stream; let timer; let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) { setMessage('Este navegador no admite escaneo por cámara. Usá un lector Bluetooth/USB o ingresá el código.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (stopped || !video.current) return
        video.current.srcObject = stream; await video.current.play(); setMessage(continuous ? 'Escaneá cada equipo, uno tras otro. Se registran solos.' : 'Enfocá el QR o código de barras.')
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'] })
        // En modo continuo se ignora el mismo código durante 1,5 s para no
        // duplicar lecturas del mismo cuadro de video.
        let lastRaw = ''; let lastAt = 0
        const read = async () => {
          if (stopped || !video.current) return
          try {
            const codes = await detector.detect(video.current)
            const raw = codes[0]?.rawValue
            if (raw) {
              const now = Date.now()
              if (continuous && raw === lastRaw && now - lastAt < 1500) { timer = window.setTimeout(read, 250); return }
              lastRaw = raw; lastAt = now
              onDetected(raw)
              if (!continuous) { onClose(); return }
            }
          } catch { /* la cámara sigue activa */ }
          timer = window.setTimeout(read, 250)
        }
        read()
      } catch { setMessage('No se pudo abrir la cámara. Revisá el permiso del navegador.') }
    }
    start()
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()) }
  }, [onDetected, onClose, continuous])
  return <div className="space-y-3"><video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline /><p className="text-sm text-mute">{message}</p></div>
}

export default function Inventario() {
  const [products, setProducts] = useState([]), [branches, setBranches] = useState([]), [units, setUnits] = useState([]), [removedUnits, setRemovedUnits] = useState([]), [reservations, setReservations] = useState([]), [transfers, setTransfers] = useState([]), [locations, setLocations] = useState([])
  const [tab, setTab] = useState('unidades'), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [stockAlerts, setStockAlerts] = useState({ alerts: [], outOfStock: [] })
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [thresholdValue, setThresholdValue] = useState('')
  const [historyUnit, setHistoryUnit] = useState(null)
  const [history, setHistory] = useState({ loading: false, error: '', unit: null, events: [] })
  const [scannerOpen, setScannerOpen] = useState(false), [receiveOpen, setReceiveOpen] = useState(false), [reserveOpen, setReserveOpen] = useState(false), [transferOpen, setTransferOpen] = useState(false)
  const [reasonAction, setReasonAction] = useState(null), [reason, setReason] = useState('')
  const [arrivalUnit, setArrivalUnit] = useState(null), [arrivalLocationId, setArrivalLocationId] = useState('')
  // Conteo físico rápido con cámara: escanea cada equipo y contrasta contra stock.
  const [countOpen, setCountOpen] = useState(false)
  const [countSession, setCountSession] = useState(null) // { scanning, found: Map, unknown: [], duplicates: [], flash }
  const [receive, setReceive] = useState({ productId: '', serial: '', branchId: '', locationId: '', condition: 'NEW', batteryHealth: '', supplierName: '', costPyg: '', notes: '' })
  const [reserve, setReserve] = useState({ serials: '', customerName: '', minutes: '120' })
  const [transfer, setTransfer] = useState({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '' })
  const [locationForm, setLocationForm] = useState(null) // { id?, name, code, branchId }
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipientResults, setRecipientResults] = useState([])
  const [searchingRecipient, setSearchingRecipient] = useState(false)
  const [recipientError, setRecipientError] = useState('')
  const [grants, setGrants] = useState([])
  const [receivedStock, setReceivedStock] = useState([])
  const [visibilityError, setVisibilityError] = useState('')
  const apiMode = modoDatosActual() === 'api'
  const { sesion, sucursal } = useSesion()
  const canViewAlerts = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageLocations = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageVisibility = Boolean(sesion?.esPropietario)
  const refresh = async (search = query) => {
    if (!apiMode) return
    setBusy(true); setError('')
    try {
      const [nextUnits, nextRemoved, nextReservations, nextTransfers, nextLocations, nextBranches] = await Promise.all([resources.inventoryUnits.list(search), resources.inventoryUnits.list(search, 'removed'), resources.inventoryReservations.list(), resources.transfers.list(), resources.stockLocations.list(), resources.inventoryBranches.list()])
      setUnits(nextUnits); setRemovedUnits(nextRemoved); setReservations(nextReservations); setTransfers(nextTransfers); setLocations(nextLocations); setBranches(nextBranches); setProducts(getProductos())
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el inventario.') } finally { setBusy(false) }
  }
  useEffect(() => { refresh('') }, [apiMode])
  useEffect(() => {
    if (!apiMode || tab !== 'compartido') return undefined
    let active = true
    setVisibilityError('')
    Promise.all([resources.sharedStock.list().catch(() => []), canManageVisibility ? resources.sharedStock.mine().catch(() => []) : Promise.resolve([])])
      .then(([received, mine]) => { if (active) { setReceivedStock(received); setGrants(mine) } })
      .catch(() => { if (active) setVisibilityError('No se pudo cargar la disponibilidad compartida.') })
    return () => { active = false }
  }, [tab, apiMode, canManageVisibility])
  const loadAlerts = useCallback(async () => {
    if (!apiMode || !canViewAlerts) return
    setAlertsLoading(true); setAlertsError('')
    const params = new URLSearchParams()
    if (sucursal?.id) params.set('branchId', sucursal.id)
    const query = params.toString() ? `?${params}` : ''
    try {
      const payload = await api.get(`/api/stock-alerts${query}`)
      setStockAlerts(payload || { alerts: [], outOfStock: [] })
    } catch (cause) { setAlertsError(cause?.message || 'No se pudieron cargar las alertas.') } finally { setAlertsLoading(false) }
  }, [apiMode, canViewAlerts, sucursal?.id])
  useEffect(() => { loadAlerts() }, [loadAlerts])
  async function saveThreshold(event) {
    event.preventDefault()
    const value = Number(thresholdValue)
    if (!threshold || !Number.isInteger(value) || value < 0 || value > 99999) return
    setBusy(true); setError('')
    try {
      await api.patch('/api/products', { id: threshold.id, reorderPoint: value })
      setNotice(`Umbral de ${threshold.name} actualizado a ${value}.`)
      setThreshold(null)
      await loadAlerts()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el umbral.') } finally { setBusy(false) }
  }
  async function openHistory(unit) {
    setHistoryUnit(unit)
    setHistory({ loading: true, error: '', unit: null, events: [] })
    try {
      const payload = await api.get(`/api/inventory-units/${unit.id}/history`)
      setHistory({ loading: false, error: '', unit: payload?.unit || null, events: payload?.events || [] })
    } catch (cause) {
      setHistory(current => ({ ...current, loading: false, error: cause?.message || 'No se pudo cargar el historial.' }))
    }
  }
  const availableProducts = useMemo(() => products.filter(product => product.branchId), [products])
  const locationsFor = branchId => locations.filter(location => location.branchId === branchId && location.isActive)
  const grantedIds = useMemo(() => new Set(grants.filter(grant => grant.isActive).map(grant => grant.recipientTenant?.id).filter(Boolean)), [grants])
  const receivedBySource = useMemo(() => receivedStock.reduce((acc, row) => { const key = row.sourceTenant || 'Otra empresa'; (acc[key] ||= []).push(row); return acc }, {}), [receivedStock])
  const setAndRefresh = async (operation, success) => { setBusy(true); setError(''); setNotice(''); try { await operation(); setNotice(success); await refresh(); } catch (cause) { setError(cause?.message || 'No se pudo guardar.') } finally { setBusy(false) } }
  async function search(event) { event.preventDefault(); await refresh(query) }
  async function verify(unit) { await setAndRefresh(() => resources.inventoryUnits.verify({ serial: unit.serial }), `IMEI ${unit.serial.slice(-4)} verificado.`) }
  async function receiveUnit(event) { event.preventDefault(); const serials = receive.serial.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); if (!serials.length) { setError('Indicá al menos un IMEI/serial.'); return } await setAndRefresh(async () => { await resources.inventoryUnits.create({ ...receive, ...(serials.length === 1 ? { serial: serials[0] } : { serials }), batteryHealth: receive.batteryHealth === '' ? undefined : Number(receive.batteryHealth), costPyg: receive.costPyg === '' ? undefined : Number(receive.costPyg) }); setReceive({ productId: '', serial: '', branchId: '', locationId: '', condition: 'NEW', batteryHealth: '', supplierName: '', costPyg: '', notes: '' }); setReceiveOpen(false) }, `${serials.length} ${serials.length === 1 ? 'unidad recibida' : 'unidades recibidas'} y stock actualizado.`) }
  async function createReservation(event) { event.preventDefault(); const serials = reserve.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); await setAndRefresh(async () => { await resources.inventoryReservations.create({ ...reserve, minutes: Number(reserve.minutes), serials }); setReserve({ serials: '', customerName: '', minutes: '120' }); setReserveOpen(false) }, 'Reserva creada. Se liberará automáticamente al vencer.') }
  async function releaseReservation(serial) { await setAndRefresh(() => resources.inventoryReservations.release([serial]), 'Reserva liberada y unidad disponible.') }
  function sellUnit(unit) {
    try { sessionStorage.setItem('mobos:venta-handoff', JSON.stringify({ productId: unit.productId, serial: unit.serial, ts: Date.now() })) } catch { /* la venta sigue disponible sin preselección */ }
    window.location.assign('/pos/cargar')
  }
  function startCount() { setCountSession({ scanning: true, found: new Map(), unknown: [], duplicates: [], flash: null }); setCountOpen(true) }
  function countScan(raw) {
    const serial = normalizeScan(raw)
    if (!serial) return
    setCountSession(current => {
      if (!current) return current
      if (current.found.has(serial)) return { ...current, duplicates: [...current.duplicates, serial], flash: { serial, kind: 'dup' } }
      const unit = units.find(item => item.serial === serial)
      if (unit) {
        const found = new Map(current.found)
        found.set(serial, unit)
        // La verificación física queda registrada con la auditoría de cada IMEI.
        resources.inventoryUnits.verify({ serial }).catch(() => { /* el conteo sigue aunque falle el registro */ })
        return { ...current, found, flash: { serial, kind: 'ok', unit } }
      }
      return { ...current, unknown: [...current.unknown, serial], flash: { serial, kind: 'miss' } }
    })
  }
  const countMissing = useMemo(() => countSession ? units.filter(unit => (unit.status === 'AVAILABLE' || unit.status === 'RESERVED') && !countSession.found.has(unit.serial)) : [], [countSession, units])
  useEffect(() => {
    if (!countSession?.flash) return undefined
    const timer = window.setTimeout(() => setCountSession(current => (current ? { ...current, flash: null } : current)), 2200)
    return () => window.clearTimeout(timer)
  }, [countSession?.flash])
  function copyMissing() {
    const text = countMissing.map(unit => `${unit.product?.name} · IMEI ${unit.serial}${unit.location?.name ? ` · ${unit.location.name}` : ''}`).join('\n')
    navigator.clipboard?.writeText(text || 'Sin faltantes.').catch(() => {})
    setNotice(text ? 'Lista de faltantes copiada.' : 'No hay faltantes para copiar.')
  }
  function openReserveFor(unit) { setReserve({ serials: unit.serial, customerName: '', minutes: '120' }); setReserveOpen(true) }
  async function receiveArrival(event) {
    event.preventDefault()
    const unit = arrivalUnit
    if (!unit) return
    const locationId = arrivalLocationId || null
    await setAndRefresh(async () => { await resources.inventoryUnits.verify({ serial: unit.serial, ...(locationId ? { locationId } : {}) }); setArrivalUnit(null); setArrivalLocationId('') }, `IMEI ${unit.serial.slice(-4)} recibido en sucursal y disponible en stock.`)
  }
  async function saveLocation(event) {
    event.preventDefault()
    const form = locationForm
    if (!form?.name?.trim() || !form?.branchId) { setError('Sucursal y nombre son obligatorios.'); return }
    await setAndRefresh(async () => {
      const payload = { name: form.name.trim(), code: form.code?.trim() ? form.code.trim() : null }
      if (form.id) await resources.stockLocations.update({ id: form.id, ...payload })
      else await resources.stockLocations.create({ branchId: form.branchId, ...payload })
      setLocationForm(null)
    }, form.id ? 'Ubicación actualizada.' : 'Ubicación creada. Ya podés asignarla al recibir o trasladar unidades.')
  }
  async function toggleLocation(location) { await setAndRefresh(() => resources.stockLocations.update({ id: location.id, isActive: !location.isActive }), location.isActive ? 'Ubicación desactivada. Deja de aparecer al recibir unidades.' : 'Ubicación reactivada.') }
  async function searchRecipients(event) {
    event.preventDefault()
    const query = recipientQuery.trim()
    if (query.length < 2) return
    setSearchingRecipient(true); setRecipientError(''); setRecipientResults([])
    try { setRecipientResults(await resources.tenants.search(query)) } catch (cause) { setRecipientError(cause?.message || 'No se pudo buscar.') } finally { setSearchingRecipient(false) }
  }
  async function setGrant(tenantId, isActive, name) {
    setBusy(true); setError(''); setNotice('')
    try {
      await resources.sharedStock.setGrant({ recipientTenantId: tenantId, isActive })
      setNotice(`${name}: ${isActive ? 'ahora ve tu disponibilidad.' : 'permiso revocado.'}`)
      const [received, mine] = await Promise.all([resources.sharedStock.list().catch(() => []), resources.sharedStock.mine().catch(() => [])])
      setReceivedStock(received); setGrants(mine)
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el permiso.') } finally { setBusy(false) }
  }
  function requestReason(kind, unit) { setReason(''); setReasonAction({ kind, unit }) }
  async function applyReason(event) { event.preventDefault(); if (!reason.trim() || !reasonAction) return; const { kind, unit } = reasonAction; const lastFour = unit.serial.slice(-4); if (kind === 'adjust') { const status = unit.status === 'DEFECTIVE' ? 'AVAILABLE' : 'DEFECTIVE'; await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'adjust', status, reason: reason.trim() }), `IMEI ${lastFour} marcado como ${status === 'DEFECTIVE' ? 'en revisión' : 'disponible'}.`) } else if (kind === 'remove') { await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'remove', reason: reason.trim() }), `IMEI ${lastFour} retirado. Podés restaurarlo desde Eliminados.`) } else { await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'restore', reason: reason.trim() }), `IMEI ${lastFour} restaurado a disponible.`) }; setReasonAction(null) }
  async function createTransfer(event) { event.preventDefault(); const serials = transfer.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); if (!serials.length) { setError('Indicá al menos un IMEI/serial para trasladar.'); return }; await setAndRefresh(async () => { await resources.transfers.create({ ...transfer, destinationLocationId: transfer.destinationLocationId || null, lines: [{ productId: transfer.productId, quantity: serials.length, serials }] }); setTransfer({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '' }); setTransferOpen(false) }, 'Transferencia registrada con trazabilidad por IMEI.') }
  if (!apiMode) return <Card><h2 className="font-bold">Inventario operativo</h2><p className="mt-2 text-sm text-mute">Ingresá con una cuenta real para controlar IMEI, reservas, ubicaciones y transferencias. La demo conserva sus datos aislados.</p></Card>
  return <div className="space-y-4"><Card className="p-4 md:p-5"><div className="flex flex-col gap-3 border-b border-ink-600 pb-4 md:flex-row md:items-start md:justify-between"><div><h2 className="font-bold">Inventario operativo</h2><p className="mt-1 text-sm text-mute">Cada IMEI es una unidad física con sucursal, ubicación, estado y auditoría.</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => setReceiveOpen(true)}>+ Recibir unidad</Button><Button variant="outline" onClick={() => setReserveOpen(true)}>Reservar</Button><Button variant="outline" onClick={() => setTransferOpen(true)}>Transferir</Button></div></div><form onSubmit={search} className="mt-4 flex gap-2"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Escanear IMEI, SKU o buscar modelo" autoCapitalize="characters" /><Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>Escanear</Button><Button type="button" variant="outline" onClick={startCount}>Conteo rápido</Button><Button type="submit" variant="outline" disabled={busy}>Buscar</Button></form><div className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-ink-600 bg-ink-800 p-1">{[['unidades', `Unidades (${units.length})`], ...(canViewAlerts ? [['alertas', `Alertas (${(stockAlerts.alerts?.length || 0) + (stockAlerts.outOfStock?.length || 0)})`]] : []), ['reservas', `Reservas (${reservations.length})`], ['traslados', `Traslados (${transfers.length})`], ['ubicaciones', `Ubicaciones (${locations.length})`], ['compartido', 'Compartido'], ['eliminados', `Eliminados (${removedUnits.length})`]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold ${tab === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}>{label}</button>)}</div>{notice && <p className="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p>}{error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
    {tab === 'unidades' && <div className="mt-4 space-y-2">{units.map(unit => <article key={unit.id} className={`flex flex-col gap-3 rounded-xl border border-ink-600 p-3 sm:flex-row sm:items-center sm:justify-between ${rowTone(unit)}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-sm">{unit.product?.name}</b><Badge color={badgeTone(unit)}>{statusLabel[unit.status] || unit.status}</Badge></div><p className="mt-1 text-xs text-mute">IMEI {unit.serial} · últimos 4: <b className="text-fore">{unit.serial?.slice(-4)}</b>{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.batteryHealth ? ` · batería ${unit.batteryHealth}%` : ''}{unit.supplierName ? ` · prov. ${unit.supplierName}` : ''}{unit.originalCost ? ` · costo ${formatCost(unit)}` : ''}</p>{unit.reservationCustomer && <p className="mt-1 text-xs font-semibold text-[#a78bfa]">Atajado por {unit.reservationCustomer} · vence {unit.reservedUntil ? new Date(unit.reservedUntil).toLocaleDateString('es-PY') : '—'}</p>}{unit.notes && <p className="mt-1 text-xs text-fore/80">Nota: {unit.notes}</p>}<p className="mt-1 text-[11px] text-mute">{verifiedLabel(unit) || (unit.lastVerifiedAt ? `Verificado ${new Date(unit.lastVerifiedAt).toLocaleString('es-PY')}` : 'Sin verificación física')}</p></div><div className="flex shrink-0 flex-wrap gap-2">{unit.status === 'AVAILABLE' && <Button disabled={busy} onClick={() => sellUnit(unit)}>Vender</Button>}{unit.status === 'AVAILABLE' && <Button variant="outline" disabled={busy} onClick={() => openReserveFor(unit)}>Reservar</Button>}{unit.status === 'IN_TRANSIT' && <Button disabled={busy} onClick={() => setArrivalUnit(unit)}>Recibir en sucursal</Button>}{unit.status === 'RESERVED' && <Button variant="outline" disabled={busy} onClick={() => releaseReservation(unit.serial)}>Liberar</Button>}{unit.status !== 'SOLD' && <Button disabled={busy} onClick={() => verify(unit)}>✓ Verificado</Button>}<Button variant="outline" onClick={() => printLabel(unit)}>Etiqueta</Button><Button variant="outline" disabled={busy} onClick={() => openHistory(unit)}>Historial</Button><Button variant="outline" disabled={busy || ['SOLD', 'RESERVED', 'IN_TRANSIT'].includes(unit.status)} onClick={() => requestReason('adjust', unit)}>{unit.status === 'DEFECTIVE' ? 'Habilitar' : 'Ajustar'}</Button><Button variant="outline" disabled={busy || unit.status !== 'AVAILABLE'} onClick={() => requestReason('remove', unit)}>Retirar</Button></div></article>)}{!units.length && <EmptyState compact icon="box" title="No hay unidades para este filtro." />}</div>}
    {tab === 'alertas' && <div className="mt-4 space-y-4">{alertsLoading && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}{alertsError && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{alertsError}</p>}{!alertsLoading && !alertsError && !(stockAlerts.alerts?.length || stockAlerts.outOfStock?.length) && <EmptyState compact icon="check" title="Sin alertas de reposición." description="Todo el stock está por encima de su umbral." />}{!alertsLoading && stockAlerts.alerts?.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Bajo el umbral de reposición</h3><div className="mt-2 space-y-2">{stockAlerts.alerts.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/25 bg-warn/5 p-3"><div className="min-w-0"><b className="text-sm">{item.name}</b><p className="mt-1 text-xs text-mute">{item.sku ? `SKU ${item.sku} · ` : ''}Stock {item.stock} de {item.reorderPoint}{item.branchName ? ` · ${item.branchName}` : ''}</p></div><div className="flex shrink-0 items-center gap-2"><Badge color="orange">Reponer</Badge><Button type="button" variant="outline" disabled={busy} onClick={() => { setThreshold({ id: item.id, name: item.name }); setThresholdValue(String(item.reorderPoint ?? '')) }}>Ajustar umbral</Button></div></article>)}</div></section>}{!alertsLoading && stockAlerts.outOfStock?.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Agotados</h3><div className="mt-2 space-y-2">{stockAlerts.outOfStock.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/25 bg-bad/5 p-3"><div className="min-w-0"><b className="text-sm">{item.name}</b><p className="mt-1 text-xs text-mute">{item.sku ? `SKU ${item.sku} · ` : ''}Sin stock{item.branchName ? ` · ${item.branchName}` : ''}</p></div><div className="flex shrink-0 items-center gap-2"><Badge color="red">Agotado</Badge><Button type="button" variant="outline" disabled={busy} onClick={() => { setThreshold({ id: item.id, name: item.name }); setThresholdValue(String(item.reorderPoint ?? '')) }}>Definir umbral</Button></div></article>)}</div></section>}</div>}
    {tab === 'reservas' && <div className="mt-4 space-y-2">{reservations.map(unit => <article key={unit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/25 bg-warn/5 p-3"><div><b className="text-sm">{unit.product?.name}</b><p className="text-xs text-mute">{unit.serial} · {unit.reservationCustomer} · vence {new Date(unit.reservedUntil).toLocaleString('es-PY')}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => printReservationReceipt(unit, { format: 'a4' })}>Comprobante</Button><Button variant="outline" disabled={busy} onClick={() => releaseReservation(unit.serial)}>Liberar</Button></div></article>)}{!reservations.length && <EmptyState compact icon="box" title="No hay reservas activas." />}</div>}
    {tab === 'traslados' && <div className="mt-4 space-y-2">{transfers.map(item => <article key={item.id} className="rounded-xl border border-ink-600 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{item.sourceBranch?.name} → {item.destinationBranch?.name}</b><span className="text-xs text-mute">{new Date(item.createdAt).toLocaleString('es-PY')}</span></div><p className="mt-1 text-xs text-mute">{item.lines?.map(line => `${line.quantity} × ${line.sourceProduct?.name}`).join(' · ')}{item.notes ? ` · ${item.notes}` : ''}</p></article>)}{!transfers.length && <EmptyState compact icon="box" title="Todavía no hay transferencias." />}</div>}
    {tab === 'ubicaciones' && <div className="mt-4 space-y-3">{canManageLocations && <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => setLocationForm({ id: null, name: '', code: '', branchId: '' })}>+ Crear ubicación</Button></div>}<div className="grid gap-2 sm:grid-cols-2">{locations.map(location => <article key={location.id} className="rounded-xl border border-ink-600 p-3"><div className="flex justify-between gap-2"><b className="text-sm">{location.name}</b><Badge color={location.isActive ? 'green' : 'slate'}>{location.isActive ? 'Activa' : 'Inactiva'}</Badge></div><p className="mt-1 text-xs text-mute">{location.branch?.name} · {location._count?.inventoryUnits || 0} unidades{location.code ? ` · ${location.code}` : ''}</p>{canManageLocations && <div className="mt-2 flex gap-3"><button type="button" className="text-xs font-semibold text-fono-light hover:underline" onClick={() => setLocationForm({ id: location.id, name: location.name, code: location.code || '', branchId: location.branchId })}>Editar</button><button type="button" className="text-xs font-semibold text-mute hover:underline" disabled={busy} onClick={() => toggleLocation(location)}>{location.isActive ? 'Desactivar' : 'Reactivar'}</button></div>}</article>)}{!locations.length && <EmptyState compact icon="box" title={canManageLocations ? 'Creá tu primera ubicación para organizar el stock.' : 'Todavía no hay ubicaciones cargadas.'} />}</div></div>}
    {tab === 'compartido' && <div className="mt-4 space-y-5">{visibilityError && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{visibilityError}</p>}{canManageVisibility && <section className="rounded-xl border border-ink-600 bg-ink-800/40 p-3"><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Compartir mi disponibilidad</h3><p className="mt-1 text-sm text-mute">Otra empresa ve nombre, SKU, categoría, condición y cantidad disponible. Nunca precios, costos, IMEI, reservas ni clientes.</p><form onSubmit={searchRecipients} className="mt-3 flex gap-2"><Input value={recipientQuery} onChange={event => setRecipientQuery(event.target.value)} placeholder="Buscar empresa por nombre (mínimo 2 letras)" /><Button type="submit" variant="outline" disabled={searchingRecipient || recipientQuery.trim().length < 2}>{searchingRecipient ? 'Buscando…' : 'Buscar'}</Button></form>{recipientError && <p role="alert" className="mt-2 text-sm text-bad">{recipientError}</p>}{recipientResults.length > 0 && <div className="mt-3 space-y-2">{recipientResults.map(tenant => <article key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><b className="min-w-0 truncate text-sm">{tenant.name}</b>{grantedIds.has(tenant.id) ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setGrant(tenant.id, false, tenant.name)}>Dejar de compartir</Button> : <Button type="button" disabled={busy} onClick={() => setGrant(tenant.id, true, tenant.name)}>Compartir</Button>}</article>)}</div>}<h4 className="mt-4 text-xs font-bold uppercase tracking-wider text-mute">Permisos otorgados</h4>{grants.length === 0 ? <p className="mt-2 text-sm text-mute">Todavía no compartís tu disponibilidad con nadie.</p> : <div className="mt-2 space-y-2">{grants.map(grant => <article key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><div className="min-w-0"><b className="text-sm">{grant.recipientTenant?.name || 'Empresa'}</b><p className="text-xs text-mute">{grant.isActive ? 'Ve tu disponibilidad' : 'Permiso revocado'} · {new Date(grant.createdAt).toLocaleDateString('es-PY')}</p></div>{grant.isActive && <Button type="button" variant="outline" disabled={busy} onClick={() => setGrant(grant.recipientTenant.id, false, grant.recipientTenant.name)}>Revocar</Button>}</article>)}</div>}</section>}<section className="rounded-xl border border-ink-600 bg-ink-800/40 p-3"><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Disponibilidad que veo de otras empresas</h3>{receivedStock.length === 0 ? <p className="mt-2 text-sm text-mute">Ninguna empresa comparte su disponibilidad con vos.</p> : <div className="mt-2 space-y-3">{Object.entries(receivedBySource).map(([source, rows]) => <div key={source}><p className="text-sm font-semibold text-fore">{source} · {rows.reduce((sum, row) => sum + Number(row.available || 0), 0)} disponibles</p><div className="mt-1.5 space-y-1">{rows.slice(0, 40).map((row, index) => <p key={`${row.product?.id}-${index}`} className="text-xs text-mute">{row.product?.name}{row.product?.sku ? ` · SKU ${row.product.sku}` : ''}{row.product?.condition ? ` · ${conditionLabel[row.product.condition] || row.product.condition}` : ''} · {row.branch?.name || 'Sin sucursal'} · <b className="text-fore">{row.available}</b></p>)}{rows.length > 40 && <p className="text-xs text-mute">+ {rows.length - 40} productos más</p>}</div></div>)}</div>}</section></div>}
    {tab === 'eliminados' && <div className="mt-4 space-y-2">{removedUnits.map(unit => <article key={unit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/25 bg-bad/5 p-3"><div><b className="text-sm">{unit.product?.name}</b><p className="text-xs text-mute">IMEI {unit.serial} · últimos 4: <b className="text-fore">{unit.serial?.slice(-4)}</b></p><p className="mt-1 text-[11px] text-mute">La unidad no se borró: conserva su identificador y su historial de auditoría.</p></div><Button disabled={busy} onClick={() => requestReason('restore', unit)}>Restaurar</Button></article>)}{!removedUnits.length && <EmptyState compact icon="box" title="No hay unidades eliminadas recuperables." />}</div>}
  </Card><Modal open={locationForm !== null} onClose={() => setLocationForm(null)} title={locationForm?.id ? 'Editar ubicación' : 'Crear ubicación'}><form onSubmit={saveLocation} className="space-y-3"><p className="text-sm text-mute">La ubicación organiza el stock dentro de una sucursal: piso de venta, depósito, recepción. Podés asignarla al recibir una unidad o declararla al trasladar.</p><Select required value={locationForm?.branchId || ''} disabled={Boolean(locationForm?.id)} onChange={event => setLocationForm(current => ({ ...current, branchId: event.target.value }))}><option value="">Elegí la sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.city ? ` · ${branch.city}` : ''}</option>)}</Select><Input required maxLength={120} autoFocus value={locationForm?.name || ''} onChange={event => setLocationForm(current => ({ ...current, name: event.target.value }))} placeholder="Nombre: Piso de venta, Depósito 1, Recepción…" /><Input maxLength={32} value={locationForm?.code || ''} onChange={event => setLocationForm(current => ({ ...current, code: event.target.value }))} placeholder="Código corto (opcional)" /><Button type="submit" disabled={busy || !locationForm?.name?.trim() || !locationForm?.branchId}>{busy ? 'Guardando…' : locationForm?.id ? 'Guardar cambios' : 'Crear ubicación'}</Button></form></Modal><Modal open={scannerOpen} onClose={() => setScannerOpen(false)} title="Escanear código"><CameraScan onDetected={value => { setQuery(normalizeScan(value)); refresh(normalizeScan(value)) }} onClose={() => setScannerOpen(false)} /></Modal><Modal open={countOpen} onClose={() => { setCountOpen(false); setCountSession(null) }} title="Conteo físico rápido" className="max-w-2xl">
  {!countSession && <div className="space-y-3"><p className="text-sm text-mute">Escaneá con la cámara el código de cada equipo (IMEI/serial). Cada lectura se compara contra el stock de tu sucursal, queda verificada en la auditoría y al final ves qué falta y qué no aparece en el sistema.</p><Button onClick={startCount}>Empezar conteo</Button></div>}
  {countSession?.scanning && <div className="space-y-3"><CameraScan continuous onDetected={countScan} onClose={() => {}} /><div className="grid grid-cols-3 gap-2 text-center">{[
    ['Encontrados', countSession.found.size, 'text-ok'],
    ['Restan por ver', countMissing.length, 'text-warn'],
    ['No en stock', countSession.unknown.length, 'text-bad'],
  ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}</div>{countSession.flash && <p className={`rounded-lg border px-3 py-2 text-sm ${countSession.flash.kind === 'ok' ? 'border-ok/40 bg-ok/10 text-ok' : countSession.flash.kind === 'dup' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-bad/40 bg-bad/10 text-bad'}`}>{countSession.flash.kind === 'ok' ? `✓ ${countSession.flash.unit?.product?.name || 'Equipo'} · IMEI ${countSession.flash.serial}` : countSession.flash.kind === 'dup' ? `⚠ IMEI ${countSession.flash.serial} ya fue escaneado.` : `✗ IMEI ${countSession.flash.serial} no está en el stock de esta sucursal.`}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCountSession(current => ({ ...current, scanning: false }))}>Terminar conteo</Button></div></div>}
  {countSession && !countSession.scanning && <div className="space-y-3"><div className="grid grid-cols-3 gap-2 text-center">{[
    ['Encontrados', countSession.found.size, 'text-ok'],
    ['Faltantes', countMissing.length, 'text-warn'],
    ['No en stock', countSession.unknown.length, 'text-bad'],
  ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-ink-600 p-3"><p className={`text-xl font-bold ${tone}`}>{value}</p><p className="text-[11px] text-mute">{label}</p></div>)}</div>{countSession.duplicates.length > 0 && <p className="text-xs text-mute">Repetidos: {countSession.duplicates.map(serial => `••••${serial.slice(-4)}`).join(', ')}</p>}{countSession.unknown.length > 0 && <div><h4 className="text-xs font-bold uppercase tracking-wider text-mute">No están en stock de esta sucursal</h4><div className="mt-2 max-h-32 space-y-1 overflow-y-auto">{countSession.unknown.map(serial => <p key={serial} className="rounded-lg border border-bad/25 bg-bad/5 px-2 py-1 text-xs text-bad">IMEI {serial}</p>)}</div></div>}{countMissing.length > 0 && <div><h4 className="text-xs font-bold uppercase tracking-wider text-mute">Faltantes (en stock pero sin escanear)</h4><div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{countMissing.map(unit => <p key={unit.id} className="rounded-lg border border-warn/25 bg-warn/5 px-2 py-1 text-xs text-fore/90">{unit.product?.name} · <b>••••{unit.serial.slice(-4)}</b>{unit.location?.name ? ` · ${unit.location.name}` : ''}{unit.batteryHealth ? ` · ${unit.batteryHealth}%` : ''}</p>)}</div></div>}{countMissing.length === 0 && countSession.unknown.length === 0 && <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">Todo el stock fue verificado. No hay faltantes.</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyMissing}>Copiar lista de faltantes</Button><Button variant="outline" onClick={() => { setCountSession(current => ({ ...current, scanning: true })) }}>Seguir escaneando</Button></div></div>}
</Modal><Modal open={arrivalUnit !== null} onClose={() => { setArrivalUnit(null); setArrivalLocationId('') }} title="Recibir equipo en tránsito"><form onSubmit={receiveArrival} className="space-y-3"><p className="text-sm text-mute">Verificá físicamente <b className="text-fore">{arrivalUnit?.product?.name}</b> (IMEI {arrivalUnit?.serial}) y elegí dónde queda en stock. Recién al confirmar la unidad suma al stock de la sucursal.</p><Select required value={arrivalLocationId} onChange={event => setArrivalLocationId(event.target.value)}><option value="">Elegí ubicación (Depósito 1, Depósito 2…)</option>{locationsFor(arrivalUnit?.branchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Button type="submit" disabled={busy || !arrivalLocationId}>{busy ? 'Recibiendo…' : 'Confirmar recepción'}</Button></form></Modal><Modal open={threshold !== null} onClose={() => setThreshold(null)} title="Umbral de reposición"><form onSubmit={saveThreshold} className="space-y-3"><p className="text-sm text-mute">Vas a recibir una alerta cuando el stock de <b className="text-fore">{threshold?.name}</b> baje a este valor. Usá 0 para desactivar la alerta.</p><Input type="number" inputMode="numeric" min="0" max="99999" required autoFocus value={thresholdValue} onChange={event => setThresholdValue(event.target.value)} placeholder="Ej: 3" /><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar umbral'}</Button></form></Modal><Modal open={historyUnit !== null} onClose={() => setHistoryUnit(null)} title={`Historial · IMEI ${historyUnit?.serial?.slice(-4) || ''}`}>{history.loading && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}{!history.loading && history.error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{history.error}</p>}{!history.loading && !history.error && !history.events.length && <EmptyState compact icon="clock" title="Sin eventos para esta unidad." />}{!history.loading && !history.error && <div className="space-y-2">{history.events.map((event, index) => <article key={event.id || index} className="rounded-lg border border-ink-600 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Badge color={event.type === 'transfer' ? 'blue' : 'slate'}>{EVENT_TYPE_LABEL[event.type] || event.type}</Badge><span className="text-xs text-mute">{new Date(event.createdAt).toLocaleString('es-PY')}</span></div><p className="mt-1.5 text-sm text-fore">{event.detail}</p><p className="mt-1 text-xs text-mute">{event.user?.name ? `Registrado por ${event.user.name}` : 'Sin usuario registrado'}</p></article>)}</div>}</Modal><Modal open={reasonAction !== null} onClose={() => setReasonAction(null)} title={reasonAction?.kind === 'remove' ? 'Retirar unidad' : reasonAction?.kind === 'restore' ? 'Restaurar unidad' : 'Ajustar unidad'}><form onSubmit={applyReason} className="space-y-3"><p className="text-sm text-mute">IMEI {reasonAction?.unit?.serial?.slice(-4)} · Este cambio queda registrado en la auditoría.</p><Textarea required autoFocus minLength={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Indicá el motivo" rows={3} /><Button className="w-full" type="submit" disabled={busy || reason.trim().length < 3}>{reasonAction?.kind === 'remove' ? 'Retirar y conservar historial' : reasonAction?.kind === 'restore' ? 'Restaurar unidad' : 'Confirmar ajuste'}</Button></form></Modal><Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Recibir unidad con IMEI"><form onSubmit={receiveUnit} className="space-y-3"><Select value={receive.productId} onChange={event => { const product = products.find(item => item.id === event.target.value); setReceive(data => ({ ...data, productId: event.target.value, branchId: product?.branchId || '' })) }} required><option value="">Elegí el modelo</option>{availableProducts.map(product => <option key={product.id} value={product.id}>{product.nombre} · {product.branch?.name || product.branchId}</option>)}</Select><Input value={receive.serial} onChange={event => setReceive(data => ({ ...data, serial: event.target.value }))} placeholder="IMEI o serial" required /><div className="grid gap-3 sm:grid-cols-2"><Select value={receive.branchId} onChange={event => setReceive(data => ({ ...data, branchId: event.target.value, locationId: '' }))} required><option value="">Sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select><Select value={receive.locationId} onChange={event => setReceive(data => ({ ...data, locationId: event.target.value }))}><option value="">Sin ubicación</option>{locationsFor(receive.branchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select value={receive.condition} onChange={event => setReceive(data => ({ ...data, condition: event.target.value }))}>{Object.entries(conditionLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Input value={receive.batteryHealth} inputMode="numeric" onChange={event => setReceive(data => ({ ...data, batteryHealth: event.target.value }))} placeholder="Batería % (opcional)" /><Input value={receive.supplierName} onChange={event => setReceive(data => ({ ...data, supplierName: event.target.value }))} placeholder="Proveedor (opcional)" /><MoneyInput value={receive.costPyg} onValueChange={next => setReceive(data => ({ ...data, costPyg: next === '' ? '' : String(next) }))} placeholder="Costo Gs. (opcional)" /></div><Input value={receive.notes} onChange={event => setReceive(data => ({ ...data, notes: event.target.value }))} placeholder="Observación de recepción" /><Button type="submit" className="w-full" disabled={busy}>Guardar unidad</Button></form></Modal><Modal open={reserveOpen} onClose={() => setReserveOpen(false)} title="Reservar unidades"><form onSubmit={createReservation} className="space-y-3"><Input value={reserve.customerName} onChange={event => setReserve(data => ({ ...data, customerName: event.target.value }))} placeholder="Cliente" required /><Input value={reserve.serials} onChange={event => setReserve(data => ({ ...data, serials: event.target.value }))} placeholder="IMEI(s), separados por coma o salto de línea" required /><Input value={reserve.minutes} inputMode="numeric" onChange={event => setReserve(data => ({ ...data, minutes: event.target.value }))} placeholder="Minutos (1 a 1440)" required /><p className="text-xs text-mute">Las reservas vencidas se liberan en cada consulta. Para liberarlas sin tráfico se debe configurar el scheduler de producción.</p><Button type="submit" className="w-full" disabled={busy}>Reservar</Button></form></Modal><Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir IMEI entre sucursales"><form onSubmit={createTransfer} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Select value={transfer.sourceBranchId} onChange={event => setTransfer(data => ({ ...data, sourceBranchId: event.target.value, productId: '' }))} required><option value="">Origen</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select><Select value={transfer.destinationBranchId} onChange={event => setTransfer(data => ({ ...data, destinationBranchId: event.target.value, destinationLocationId: '' }))} required><option value="">Destino</option>{branches.filter(branch => branch.id !== transfer.sourceBranchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></div><Select value={transfer.productId} onChange={event => setTransfer(data => ({ ...data, productId: event.target.value }))} required><option value="">Modelo a trasladar</option>{products.filter(product => product.branchId === transfer.sourceBranchId).map(product => <option key={product.id} value={product.id}>{product.nombre}</option>)}</Select><Select value={transfer.destinationLocationId} onChange={event => setTransfer(data => ({ ...data, destinationLocationId: event.target.value }))}><option value="">Ubicación de destino (opcional)</option>{locationsFor(transfer.destinationBranchId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Input value={transfer.serials} onChange={event => setTransfer(data => ({ ...data, serials: event.target.value }))} placeholder="IMEI(s), separados por coma o salto de línea" required /><Input value={transfer.notes} onChange={event => setTransfer(data => ({ ...data, notes: event.target.value }))} placeholder="Observación" /><Button type="submit" className="w-full" disabled={busy}>Confirmar traslado</Button></form></Modal></div>}
