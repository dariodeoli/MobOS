import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Input, Select, Button, MoneyInput, Badge } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import { api, API_URL } from '@/lib/api'
import { listVentas, updateVenta, refrescar } from '@/lib/storage'
import { listDemoProofs, saveDemoProof } from '@/lib/demoProofs'
import { gs, num } from '@/utils/calculos'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import NumericKeypad from '@/components/shared/NumericKeypad'
import SerialField from '@/components/shared/SerialField'
import AttachmentInput from '@/components/shared/AttachmentInput'
import { trackingUrlFor } from '@/components/shared/OrderReceipt'
import { internationalPhone } from '@/utils/telefono'
import { renderMessage } from '@/components/customers/customerMessaging'
import { printInternalReceipt, printOrderReceipt } from '@/components/shared/OrderReceipt'
import { configImpresora } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketReciboInterno } from '@/lib/printing/tickets'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'

// Enlace de WhatsApp para compartir el seguimiento público del pedido. Usa la
// plantilla predeterminada de Pedidos cuando existe (con {seguimiento}) y si no
// el mensaje de siempre, para que la tienda escriba con su propio texto.
export function whatsappTrackingLink(order, extra = '', template = null) {
  const tracking = trackingUrlFor(order)
  if (!tracking) return ''
  const number = internationalPhone(order?.customer?.phone || order?.clienteTelefono, order?.customer?.countryCode)
  if (!number) return ''
  const name = order?.customer?.name || order?.cliente || ''
  const mensajePlantilla = template?.body
    ? renderMessage(template, {
        name, firstName: name.split(' ')[0], orderNumber: order?.orderNumber || order?.codigo || '',
        branchName: order?.branch?.name || order?.sucursal || '', empresa: order?.tenant?.name || '',
        total: '', seguimiento: tracking,
      })
    : ''
  const message = mensajePlantilla || `Hola${name ? ` ${name}` : ''}, podés seguir tu pedido ${order?.codigo || order?.orderNumber || ''} acá: ${tracking}${extra ? `\n${extra}` : ''}`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

const METODOS_PAGO = ['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'PIX', 'STORE_CREDIT']
const FOREIGN = (currency) => currency === 'USD' || currency === 'BRL'

export default function PagosPedido({ venta, onClose }) {
  const { esDemo, usuario, sesion } = useSesion()
  const [order, setOrder] = useState(venta)
  useEffect(() => {
    if (esDemo) return
    let vigente = true
    api.get('/api/message-templates?context=pedidos')
      .then(data => {
        if (!vigente || !Array.isArray(data)) return
        setPlantillaSeguimiento(data.find(item => item.isDefault) || data[0] || null)
      })
      .catch(() => {})
    return () => { vigente = false }
  }, [esDemo])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('TRANSFER')
  const [reference, setReference] = useState('')
  const [plantillaSeguimiento, setPlantillaSeguimiento] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [rate, setRate] = useState('')
  const [fx, setFx] = useState(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [asPending, setAsPending] = useState(false)
  const [device, setDevice] = useState({ serial: '', model: '', conditionNotes: '' })
  const account = accounts.find(a => a.id === accountId)
  useEffect(() => { let active = true; getPaymentAccounts().then(rows => { if (active) setAccounts(rows.filter(a => a.isActive)) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [])
  useEffect(() => {
    let active = true
    if (esDemo || !order.customer?.id) { setSaldoFavor(null); return undefined }
    api.get(`/api/store-credits?customerId=${encodeURIComponent(order.customer.id)}`)
      .then(data => { if (active) setSaldoFavor(data) })
      .catch(() => { if (active) setSaldoFavor(null) })
    return () => { active = false }
  }, [order.customer?.id, esDemo])
  const [proofs, setProofs] = useState({})
  const [reconciliations, setReconciliations] = useState({})
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const attempt = useRef(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const payments = useMemo(() => order.pagos || [], [order])
  const pending = num(order.totalPendiente)
  const canReconcile = esDemo || ['ADMIN', 'GERENTE', 'CAJERA'].includes(usuario?.role)
  const canReturn = esDemo || ['ADMIN', 'GERENTE'].includes(usuario?.role)
  const [postventaOpen, setPostventaOpen] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [cuotasOpen, setCuotasOpen] = useState(false)
  const [cuotasForm, setCuotasForm] = useState({ count: '3', firstDueAt: '' })
  const [cuotasBusy, setCuotasBusy] = useState(false)
  // Cuota concreta que se está cobrando: el cobro se concilia sobre esa cuota
  // en vez de crear otro movimiento.
  const [cuotaPago, setCuotaPago] = useState(null)
  // Saldo a favor del cliente (nota de crédito interna) para poder cobrar con él.
  const [saldoFavor, setSaldoFavor] = useState(null)
  const tienePlanCuotas = payments.some(p => p.status === 'PENDING' && p.dueAt)

  // Elegir una cuota prepara el cobro: monto fijo de la cuota y aviso visible.
  function cobrarCuota(pago) {
    setCuotaPago(pago)
    setAmount(String(num(pago.monto)))
    setError(''); setNotice('')
  }

  async function crearPlanCuotas(event) {
    event.preventDefault()
    const count = Number(cuotasForm.count)
    if (cuotasBusy || !Number.isInteger(count) || count < 2 || count > 24) return
    setCuotasBusy(true); setError(''); setNotice('')
    try {
      await api.post(`/api/orders/${encodeURIComponent(order.id)}/installments`, { count, ...(cuotasForm.firstDueAt ? { firstDueAt: new Date(`${cuotasForm.firstDueAt}T12:00:00`).toISOString() } : {}) })
      setCuotasOpen(false)
      setNotice(`Plan de ${count} cuotas creado. Cada cuota queda pendiente con su vencimiento.`)
      try { await refrescar() } catch { setNeedsRefresh(true) }
    } catch (cause) { setError(cause?.message || 'No se pudo crear el plan de cuotas.') } finally { setCuotasBusy(false) }
  }

  async function enviarComprobante() {
    if (emailBusy) return
    setEmailBusy(true); setError(''); setNotice('')
    try {
      const result = await api.post(`/api/orders/${encodeURIComponent(order.id)}/receipt-email`, {})
      setNotice(result?.already ? 'El comprobante ya estaba encolado para este pedido.' : 'Comprobante encolado. Llega al correo del cliente en unos minutos.')
    } catch (cause) { setError(cause?.message || 'No se pudo encolar el comprobante.') } finally { setEmailBusy(false) }
  }
  const [postventa, setPostventa] = useState({ operation: 'RETURN', reason: '', replacementNumber: '', refundPyg: '', refundMode: 'CASH', restock: 'NONE' })
  const [postventaBusy, setPostventaBusy] = useState(false)
  const cobrado = payments.filter(p => p.status === undefined || p.status === 'CONFIRMED').reduce((sum, p) => sum + num(p.monto), 0)

  // Elegir una cuota prepara el cobro: monto fijo, cuota seleccionada y aviso.
  function cobrarCuota(pago) {
    setCuotaPago(pago)
    setAmount(String(num(pago.monto)))
    setError(''); setNotice('')
  }
  async function refrescarSaldoFavor() {
    if (esDemo || !order.customer?.id) return
    try { setSaldoFavor(await api.get(`/api/store-credits?customerId=${encodeURIComponent(order.customer.id)}`)) } catch { /* se reintenta al reabrir */ }
  }

  async function registrarPostventa(event) {
    event.preventDefault()
    if (postventaBusy || postventa.reason.trim().length < 3) return
    setPostventaBusy(true); setError(''); setNotice('')
    try {
      const reembolso = postventa.operation === 'EXCHANGE' ? 0 : Number(String(postventa.refundPyg).replace(/\D/g, '')) || 0
      if (postventa.operation !== 'EXCHANGE' && reembolso > cobrado) { setError('El reembolso no puede superar el total cobrado.'); return }
      if (postventa.refundMode === 'CREDIT' && !order.customer?.id) { setError('Para dejar saldo a favor el pedido necesita un cliente identificado.'); return }
      const payload = { operation: postventa.operation, reason: postventa.reason.trim(), restock: postventa.restock, ...(postventa.operation === 'EXCHANGE' ? { replacementOrderNumber: postventa.replacementNumber.trim() } : { refundPyg: reembolso, refundMode: postventa.refundMode }) }
      await api.post(`/api/orders/${encodeURIComponent(order.id)}/return`, payload)
      setPostventaOpen(false)
      setPostventa({ operation: 'RETURN', reason: '', replacementNumber: '', refundPyg: '', refundMode: 'CASH', restock: 'NONE' })
      const reposicion = postventa.restock === 'AVAILABLE' ? ' El stock volvió a estar disponible.' : postventa.restock === 'REVIEW' ? ' El stock quedó marcado para revisión.' : ''
      setNotice(postventa.operation === 'CANCEL' ? `Pedido cancelado.${reposicion}` : postventa.operation === 'RETURN' ? (postventa.refundMode === 'CREDIT' ? `Devolución registrada como saldo a favor del cliente.${reposicion}` : `Devolución registrada con su reembolso.${reposicion}`) : `Cambio registrado.${reposicion}`)
      try { await refrescar() } catch { setNeedsRefresh(true) }
      await refrescarSaldoFavor()
    } catch (cause) { setError(cause?.message || 'No se pudo registrar la postventa.') } finally { setPostventaBusy(false) }
  }

  useEffect(() => {
    let active = true
    Promise.all(payments.map(async p => [p.id, esDemo ? await listDemoProofs(p.id) : await api.get(`/api/payments/${encodeURIComponent(p.id)}/proofs`)]))
      .then(entries => { if (active) setProofs(Object.fromEntries(entries)) })
      .catch(e => { if (active) setError(e.message) })
    if (!esDemo) Promise.all(payments.map(async p => [p.id, await api.get(`/api/payments/${encodeURIComponent(p.id)}/reconciliation`)]))
      .then(entries => { if (active) setReconciliations(Object.fromEntries(entries)) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [order, esDemo, payments])

  async function reconcile(paymentId, state) {
    if (busy) return
    const note = (notes[paymentId] || '').trim()
    if (!note) { setError('Agregá un comentario de conciliación.'); return }
    setBusy(true); setError('')
    try {
      if (esDemo) {
        updateVenta(order.id, { pagos: payments.map(p => p.id !== paymentId ? p : { ...p, reconciliationState: state, reconciliationHistory: [...(p.reconciliationHistory || []), { state, note, user: sesion?.nombre, at: new Date().toISOString() }] }) })
        setOrder(listVentas().find(v => v.id === order.id) || order)
      } else {
        const result = await api.patch(`/api/payments/${encodeURIComponent(paymentId)}/reconciliation`, { state, note })
        setReconciliations(prev => ({ ...prev, [paymentId]: result }))
        // Conciliar un cobro pendiente lo confirma o rechaza: el saldo y la
        // cronología cambian, así que hay que volver a traer el pedido.
        try { await refrescar() } catch { setNeedsRefresh(true) }
        setOrder(listVentas().find(v => v.id === order.id) || order)
      }
      setNotice(esDemo ? 'Conciliación registrada.' : state === 'VERIFIED' ? 'Cobro conciliado: quedó confirmado y la deuda bajó.' : 'Cobro rechazado: no cuenta para la deuda.')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function fetchFx() {
    if (busy || fxLoading) return
    setFxLoading(true); setError('')
    try {
      const result = await api.get('/api/fx')
      setFx(result)
      if (result.referencialDiario) setRate(String(result.referencialDiario))
    } catch (cause) { setError(cause?.message || 'No se pudo obtener la cotización. Cargala manualmente.') } finally { setFxLoading(false) }
  }

  async function register(e) {
    e.preventDefault()
    if (busy || needsRefresh) return
    if (FOREIGN(account?.currency) && (!/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim()) || !/^\d+(?:[.,]\d{1,6})?$/.test(rate.trim()))) { setError('Usá hasta 2 decimales para el monto y 6 para la cotización.'); return }
    const originalAmount = FOREIGN(account?.currency) ? Number(amount.replace(',', '.')) : parseGsInput(amount)
    const exchangeRatePyg = FOREIGN(account?.currency) ? Number(rate.replace(',', '.')) : 1
    if (!Number.isFinite(originalAmount) || !Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0) { setError('Completá el monto y la cotización.'); return }
    const value = Math.round(originalAmount * exchangeRatePyg)
    if (!Number.isSafeInteger(value) || value <= 0 || value > pending) { setError('El monto debe ser positivo y no superar el saldo pendiente.'); return }
    if (cuotaPago && value !== num(cuotaPago.monto)) { setError(`El monto debe ser exactamente el de la cuota (${gs(cuotaPago.monto)}).`); return }
    if (!account && method === 'STORE_CREDIT') {
      const disponible = num(saldoFavor?.availablePyg)
      if (disponible <= 0) { setError('El cliente no tiene saldo a favor disponible.'); return }
      if (value > disponible) { setError(`El saldo a favor disponible es ${gs(disponible)}.`); return }
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const tradeIn = account?.kind === 'TRADE_IN' ? device : undefined
      if (tradeIn && (!device.serial.trim() || !device.model.trim() || !device.conditionNotes.trim())) throw new Error('Completá IMEI/serial, modelo y estado del teléfono recibido.')
      const details = account ? { accountId, originalAmount, exchangeRatePyg, currency: account.currency, accountSnapshot: { ...account }, tradeIn } : {}
      if (esDemo) {
        if (cuotaPago) {
          const updatedPayments = payments.map(p => p.id !== cuotaPago.id ? p : { ...p, status: 'CONFIRMED', fecha: new Date().toISOString() })
          const paid = num(order.totalPagado) + value
          updateVenta(order.id, { pagos: updatedPayments, totalPagado: paid, totalPendiente: pending - value, estadoPago: pending === value ? 'Pagado' : 'Parcial' })
        } else {
          const newPayment = { id: crypto.randomUUID(), ...details, method: account?.kind || method, medioPago: account?.name || ETIQUETAS_MEDIO_PAGO[method], monto: value, amountPyg: value, cuenta: reference, fecha: new Date().toISOString(), reconciliationState: 'PENDING' }
          await validateDemoTradeIns([newPayment])
          const updatedPayments = [...payments, newPayment]
          const paid = num(order.totalPagado) + value
          updateVenta(order.id, { pagos: updatedPayments, totalPagado: paid, totalPendiente: pending - value, estadoPago: pending === value ? 'Pagado' : 'Parcial' })
          try { await recordDemoTradeIns(order, [newPayment]) } catch (error) {
            setNeedsRefresh(true)
            throw new Error(`El pago demo se guardó, pero el equipo requiere revisión. No repitas el cobro. ${error.message}`)
          }
        }
      } else {
        // Cobro de una cuota: viaja el installmentId y el backend salda esa
        // cuota (o responde error). Nunca nace un pago paralelo que deje la
        // cuota viva y la deuda reclamada dos veces.
        const payload = { orderId: order.id, method: account?.kind || method, amountPyg: value, reference, ...(asPending && !cuotaPago ? { status: 'PENDING' } : {}), ...(cuotaPago ? { installmentId: cuotaPago.id } : {}), ...details }
        const signature = JSON.stringify(payload)
        if (!attempt.current || attempt.current.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
        await api.post('/api/payments', payload, { headers: { 'Idempotency-Key': attempt.current.key } })
        setAmount(''); setReference('')
        try { await refrescar() } catch {
          setNeedsRefresh(true)
          throw new Error('El pago se guardó, pero no se pudo actualizar el saldo. Cerrá y recargá antes de registrar otro pago; no lo repitas.')
        }
        attempt.current = null
      }
      setOrder(listVentas().find(v => v.id === order.id) || order)
      setAmount(''); setReference(''); setCuotaPago(null); setNotice(cuotaPago ? 'Cuota cobrada y conciliada: la deuda bajó y ya no se reclama.' : 'Pago registrado. Podés adjuntar su comprobante abajo.')
      await refrescarSaldoFavor()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function upload(paymentId, file) {
    if (!file || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Usá JPG, PNG, WebP o PDF de hasta 5 MB.')
      if (esDemo) await saveDemoProof(paymentId, file)
      else { const body = new FormData(); body.append('file', file); await api.post(`/api/payments/${encodeURIComponent(paymentId)}/proofs`, body) }
      const items = esDemo ? await listDemoProofs(paymentId) : await api.get(`/api/payments/${encodeURIComponent(paymentId)}/proofs`)
      setProofs(previous => ({ ...previous, [paymentId]: items }))
      setNotice('Comprobante adjuntado. Sigue pendiente de conciliación; no modifica el saldo.')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function download(paymentId, proof) {
    try {
      let blob = proof.file
      if (!esDemo) {
        const response = await fetch(`${API_URL}/api/payments/${encodeURIComponent(paymentId)}/proofs/${encodeURIComponent(proof.id)}`, { credentials: 'include' })
        if (!response.ok) throw new Error('No se pudo descargar el comprobante.')
        blob = await response.blob()
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = proof.name || proof.fileName || 'comprobante'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e.message) }
  }

  // Recibo interno de un cobro puntual: primero la térmica (agente o puente) y
  // solo si el fallo fue claro cae al diálogo con el A4. Tras encolar o un
  // resultado incierto no se abre nada: el reintento podría duplicar el papel.
  async function imprimirReciboInterno(pago) {
    setError(''); setNotice('')
    const { ancho } = configImpresora()
    const resultado = await imprimirDocumentoNoFiscal(ticketReciboInterno(pago, order, { ancho }), {
      tipo: 'recibo-interno',
      respaldo: () => printInternalReceipt(pago, order, { format: 'a4' }),
    })
    if (resultado.ok) {
      setNotice(resultado.encolado ? (resultado.remoto ? 'Recibo interno encolado: lo imprime el puente cuando lo reclame.' : 'Recibo interno encolado: la impresora no respondió y se reintenta sola.') : 'Recibo interno enviado a la impresora.')
      return
    }
    if (!resultado.dialogo) setError(resultado.error || 'No se pudo imprimir el recibo interno.')
  }

  return <Modal open onClose={() => !busy && onClose()} title={`Pagos · ${order.codigo || order.cliente || 'Pedido'}`} className="max-w-2xl">
    <p className="mb-5 text-sm text-mute">Cada cobro conserva su fecha y referencia. Un archivo adjunto no confirma una transferencia.</p>
    {trackingUrlFor(order) && !esDemo && (
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-fono/25 bg-fono/5 p-3">
        {whatsappTrackingLink(order, '', plantillaSeguimiento) ? (
          <a className="rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110" href={whatsappTrackingLink(order, '', plantillaSeguimiento)} target="_blank" rel="noopener noreferrer">Enviar seguimiento por WhatsApp</a>
        ) : (
          <span className="text-xs text-mute">El cliente no tiene teléfono: compartí el enlace a mano.</span>
        )}
        <button type="button" className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light" onClick={() => { navigator.clipboard?.writeText(trackingUrlFor(order)).catch(() => {}) }}>Copiar enlace</button>
        {!esDemo && order.customer?.email && <button type="button" disabled={emailBusy} className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light disabled:opacity-40" onClick={enviarComprobante}>{emailBusy ? 'Encolando…' : 'Enviar comprobante por email'}</button>}
        <button type="button" className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light" onClick={() => printOrderReceipt(order, { format: 'a4' })}>Imprimir comprobante</button>
        <span className="w-full text-xs text-mute sm:w-auto">El enlace muestra solo estado y comprobante; sin teléfonos, direcciones ni pagos.</span>
      </div>
    )}
    <div className="mb-5 grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-ok/25 bg-gradient-to-br from-ok/10 to-transparent p-4"><p className="text-xs text-mute">Pagado</p><strong className="mt-1 block text-xl tabular-nums text-ok">{gs(order.totalPagado)}</strong></div>
      <div className={`rounded-2xl border p-4 ${pending > 0 ? 'border-warn/25 bg-gradient-to-br from-warn/10 to-transparent' : 'border-ink-600'}`}><p className="text-xs text-mute">Pendiente</p><strong className={`mt-1 block text-xl tabular-nums ${pending > 0 ? 'text-warn' : ''}`}>{gs(pending)}</strong></div>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-ok transition-all" style={{ width: `${Number(order.precio || order.totalPyg || 0) > 0 ? Math.min(100, Math.round((Number(order.totalPagado || 0) / Number(order.precio || order.totalPyg || 1)) * 100)) : 0}%` }} /></div>
      {saldoFavor?.availablePyg > 0 && <p className="col-span-2 text-xs text-ok">Saldo a favor disponible: {gs(saldoFavor.availablePyg)}</p>}
    </div>
    {canReturn && !postventaOpen && (
      <div className="mb-5">
        <button type="button" className="text-sm font-semibold text-bad hover:underline" onClick={() => { setPostventaOpen(true); setError(''); setNotice('') }}>Registrar cambio o devolución…</button>
      </div>
    )}
    {canReturn && postventaOpen && (
      <form onSubmit={registrarPostventa} className="mb-6 space-y-3 rounded-xl border border-bad/30 bg-bad/5 p-4">
        <h3 className="font-semibold">Cambio o devolución</h3>
        <p className="text-xs text-mute">La devolución completa reembolsa los pagos confirmados ({gs(cobrado)}) y cancela el pedido. Podés dejar el dinero como saldo a favor y decidir qué pasa con el stock devuelto.</p>
        <div className="flex gap-2">
          {[['RETURN', 'Devolución'], ['EXCHANGE', 'Cambio por otro pedido'], ['CANCEL', 'Cancelar pedido']].map(([value, label]) => (
            <button key={value} type="button" className={`rounded-lg border px-3 py-2 text-sm ${postventa.operation === value ? 'border-bad bg-bad/15 font-semibold text-bad' : 'border-ink-600 text-mute'}`} onClick={() => setPostventa(current => ({ ...current, operation: value }))}>{label}</button>
          ))}
        </div>
        {postventa.operation === 'EXCHANGE' && <Input aria-label="Número del pedido que reemplaza" required maxLength={100} value={postventa.replacementNumber} onChange={event => setPostventa(current => ({ ...current, replacementNumber: event.target.value }))} placeholder="N.º de pedido del cambio (ej: MOB-123)" />}
        {postventa.operation !== 'EXCHANGE' && <>
          <div className="flex flex-wrap gap-2">
            {[['CASH', 'Reembolsar el dinero'], ['CREDIT', 'Dejar saldo a favor']].map(([value, label]) => (
              <button key={value} type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${postventa.refundMode === value ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute'}`} onClick={() => setPostventa(current => ({ ...current, refundMode: value }))}>{label}</button>
            ))}
          </div>
          {postventa.refundMode === 'CREDIT' && !order.customer?.id && <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">Este pedido no tiene cliente identificado: para dejar saldo a favor primero asignale un cliente.</p>}
          <label className="block text-xs text-mute">Monto — total cobrado {gs(cobrado)}<MoneyInput aria-label="Monto de reembolso" currency="PYG" value={postventa.refundPyg} onValueChange={next => setPostventa(current => ({ ...current, refundPyg: next === '' ? '' : String(next) }))} placeholder={String(cobrado)} /></label>
        </>}
        <label className="block text-xs text-mute">Stock devuelto
          <Select aria-label="Stock devuelto" className="mt-1" value={postventa.restock} onChange={event => setPostventa(current => ({ ...current, restock: event.target.value }))}>
            <option value="NONE">No reponer (se revisa aparte)</option>
            <option value="AVAILABLE">Volver a disponible para la venta</option>
            <option value="REVIEW">Dejar en revisión (defectuoso)</option>
          </Select>
        </label>
        <Input aria-label="Motivo de la postventa" required minLength={3} maxLength={1000} value={postventa.reason} onChange={event => setPostventa(current => ({ ...current, reason: event.target.value }))} placeholder="Motivo (mínimo 3 caracteres)" />
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={postventaBusy || postventa.reason.trim().length < 3 || (postventa.operation === 'EXCHANGE' && !postventa.replacementNumber.trim())}>{postventaBusy ? 'Registrando…' : 'Confirmar postventa'}</Button><Button type="button" variant="ghost" disabled={postventaBusy} onClick={() => setPostventaOpen(false)}>Cancelar</Button></div>
      </form>
    )}
    {pending > 0 && canReconcile && !tienePlanCuotas && !cuotasOpen && (
      <div className="mb-5">
        <button type="button" className="text-sm font-semibold text-fono-light hover:underline" onClick={() => { setCuotasOpen(true); setError(''); setNotice('') }}>Crear plan de cuotas a crédito…</button>
      </div>
    )}
    {cuotasOpen && (
      <form onSubmit={crearPlanCuotas} className="mb-6 space-y-3 rounded-xl border border-fono/20 bg-fono/5 p-4">
        <h3 className="font-semibold">Plan de cuotas</h3>
        <p className="text-xs text-mute">Se reparte el saldo pendiente ({gs(pending)}) en cuotas mensuales a crédito, cada una con su vencimiento. Cada cuota se cobra con su botón «Cobrar cuota»: queda saldada, la deuda baja y el recordatorio se detiene.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-mute">Cantidad de cuotas (2 a 24)<Input inputMode="numeric" maxLength={2} value={cuotasForm.count} onChange={event => setCuotasForm(current => ({ ...current, count: event.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="3" /></label>
          <label className="block text-xs text-mute">Vence la primera (opcional)<Input type="date" value={cuotasForm.firstDueAt} onChange={event => setCuotasForm(current => ({ ...current, firstDueAt: event.target.value }))} /></label>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={cuotasBusy || Number(cuotasForm.count) < 2 || Number(cuotasForm.count) > 24}>{cuotasBusy ? 'Creando…' : 'Crear plan'}</Button><Button type="button" variant="ghost" disabled={cuotasBusy} onClick={() => setCuotasOpen(false)}>Cancelar</Button></div>
      </form>
    )}
    {pending > 0 && <form onSubmit={register} className="mb-6 space-y-3 rounded-xl border border-fono/20 bg-fono/5 p-4">
      <h3 className="font-semibold">{cuotaPago ? 'Cobrar cuota del plan' : 'Registrar pago parcial o total'}</h3>
      {cuotaPago && (
        <div data-testid="cuota-en-cobro" className="rounded-lg border border-fono/30 bg-ink-800 p-3 text-xs">
          <p className="font-semibold text-fono-light">Cobrando {cuotaPago.reference || 'la cuota'} · vence {new Date(cuotaPago.dueAt).toLocaleDateString('es-PY')} · {gs(cuotaPago.monto)}</p>
          <p className="mt-1 text-mute">El monto ya está fijado: al registrar, esa cuota queda cobrada, la deuda baja y el recordatorio se detiene.</p>
          <button type="button" className="mt-2 text-mute underline" onClick={() => { setCuotaPago(null); setAmount('') }}>Cancelar y cobrar libre</button>
        </div>
      )}
      <label className="block text-xs text-mute">Cuenta de destino<Select aria-label="Cuenta de destino" className="mt-1" value={accountId} onChange={e => { setAccountId(e.target.value); setAmount(''); setRate(''); setAsPending(false) }}><option value="">Método manual sin cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.accountNumber || a.kind}</option>)}</Select></label>
      <label className="block text-xs text-mute">Monto en {FOREIGN(account?.currency) ? account.currency : 'guaraníes'}<MoneyInput aria-label="Monto del pago" currency={FOREIGN(account?.currency) ? account.currency : 'PYG'} value={amount} onValueChange={v => setAmount(v === '' ? '' : String(v))} placeholder={FOREIGN(account?.currency) ? '10,50' : 'Gs 0'} />{!FOREIGN(account?.currency) && <NumericKeypad value={String(amount || '').replace(/\D/g, '')} onChange={v => setAmount(formatGsInput(v))} />}</label>
      {FOREIGN(account?.currency) && <div><label className="block text-xs text-mute">Cotización: Gs por {account.currency}<MoneyInput currency="USD" symbol="Gs." value={rate} onValueChange={setRate} placeholder="7500" /></label><button type="button" disabled={fxLoading || busy} onClick={fetchFx} className="mt-1 rounded-lg border border-fono/40 px-2 py-1 text-[11px] font-semibold text-fono-light disabled:opacity-40">{fxLoading ? 'Consultando BCP…' : 'Usar cotización BCP'}</button>{fx?.referencialDiario && <span className="ml-2 text-[11px] text-mute">BCP {fx.referencialDiario} · {fx.updated}</span>}</div>}
      {account && !cuotaPago && <label className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={asPending} onChange={e => setAsPending(e.target.checked)} /> Queda pendiente (ej. Pix recibido en cuenta personal, se confirma al pasar a la empresa)</label>}
      {account?.kind === 'TRADE_IN' && <div className="space-y-2"><SerialField aria-label="IMEI o serial" placeholder="IMEI / serial" value={device.serial} onChange={value => setDevice(d => ({ ...d, serial: value }))} /><Input aria-label="Modelo recibido" placeholder="Modelo recibido" value={device.model} onChange={e => setDevice(d => ({ ...d, model: e.target.value }))} /><Input placeholder="Estado y observaciones" value={device.conditionNotes} onChange={e => setDevice(d => ({ ...d, conditionNotes: e.target.value }))} /></div>}
      {!account && <label className="block text-xs text-mute">Método<Select className="mt-1" value={method} onChange={e => setMethod(e.target.value)}>{METODOS_PAGO.map(key => <option key={key} value={key}>{key === 'STORE_CREDIT' ? `Saldo a favor${saldoFavor?.availablePyg ? ` (${gs(saldoFavor.availablePyg)})` : ''}` : ETIQUETAS_MEDIO_PAGO[key]}</option>)}</Select></label>}
      <label className="block text-xs text-mute">Cuenta / referencia<Input value={reference} onChange={e => setReference(e.target.value)} maxLength={200} placeholder="Banco, cuenta o referencia de operación" /></label>
      <Button disabled={busy || needsRefresh} type="submit">{busy ? 'Guardando…' : cuotaPago ? 'Cobrar cuota' : 'Registrar pago'}</Button>
    </form>}
    <div className="space-y-3"><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Cronología de pagos y comprobantes</h3>
      {!payments.length && <p className="text-sm text-mute">Todavía no hay pagos registrados.</p>}
      {payments.map(p => {
        const conciliacion = reconciliations[p.id]?.state || p.reconciliationState
        const concTone = conciliacion === 'VERIFIED' ? 'green' : conciliacion === 'REJECTED' ? 'red' : 'orange'
        const concLabel = conciliacion === 'VERIFIED' ? 'Conciliada' : conciliacion === 'REJECTED' ? 'Rechazada' : 'Por conciliar'
        return <article key={p.id} className="rounded-2xl border border-ink-600 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-base tabular-nums">{gs(p.monto)}</strong>
            <Badge color="slate">{ETIQUETAS_MEDIO_PAGO[p.medioPago] || p.medioPago}</Badge>
            <Badge color={concTone}>{concLabel}</Badge>
            {p.dueAt && <Badge color="orange">Vence {new Date(p.dueAt).toLocaleDateString('es-PY')}</Badge>}
            {p.status === 'PENDING' && p.dueAt && canReconcile && <button type="button" className="rounded-lg border border-fono/40 px-2.5 py-1 text-xs font-semibold text-fono-light" onClick={() => cobrarCuota(p)}>Cobrar cuota</button>}
          </div>
          {p.status === undefined || p.status === 'CONFIRMED' ? <button type="button" className="rounded-lg border border-fono/40 px-2.5 py-1 text-xs font-semibold text-fono-light" onClick={() => imprimirReciboInterno(p)}>Recibo interno</button> : null}
        </div>
        <p className="mt-1 text-xs text-mute">{new Date(p.fecha || p.paidAt || p.createdAt).toLocaleString('es-PY')} · {p.cuenta || p.reference || 'Sin referencia'}{p.settlesAt ? ` · se acredita el ${new Date(p.settlesAt).toLocaleDateString('es-PY')}` : ''}</p>
        {p.accountSnapshot && <p className="mt-1 text-xs text-fono-light">{p.accountSnapshot.name} · {p.accountSnapshot.bank} · {p.accountSnapshot.accountNumber} · {p.currency} {p.originalAmount} · cotización {p.exchangeRatePyg}</p>}
        {(proofs[p.id] || []).map(file => <button key={file.id} className="mt-2 block text-sm text-fono-light underline" onClick={() => download(p.id, file)}>{file.name || file.fileName || 'Descargar comprobante'}</button>)}
        <label className="mt-2 block text-xs text-mute">Adjuntar comprobante · JPG, PNG, WebP o PDF · hasta 5 MB<AttachmentInput disabled={busy} className="mt-2 block w-full text-xs" onSelect={file => upload(p.id, file)} onError={setError} /></label>
        {canReconcile && <div className="mt-3 border-t border-fore/10 pt-3"><Input aria-label={`Comentario de conciliación ${p.id}`} placeholder="Comentario interno de conciliación" maxLength={2000} value={notes[p.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))} /><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => reconcile(p.id, 'VERIFIED')}>Verificar</Button><button disabled={busy} className="rounded-lg border border-red-400/30 px-3 text-sm text-bad" onClick={() => reconcile(p.id, 'REJECTED')}>Rechazar</button></div></div>}
        {(p.reconciliationHistory || []).map((entry, index) => <p key={index} className="mt-2 text-xs text-mute">{entry.user} · {new Date(entry.at).toLocaleString('es-PY')} · {entry.state}: {entry.note}</p>)}
        {reconciliations[p.id]?.note && <p className="mt-2 text-xs text-mute">{reconciliations[p.id].note}</p>}
      </article>})}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-fono-light">{notice}</p>}
    {esDemo && <p className="mt-4 text-xs text-mute">Demo: pagos y archivos se guardan sólo en este navegador.</p>}
  </Modal>
}
