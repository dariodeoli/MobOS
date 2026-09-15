import { useEffect, useRef, useState } from 'react'
import { Modal, Input, Select, Button } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import { api, API_URL } from '@/lib/api'
import { listVentas, updateVenta, refrescar } from '@/lib/storage'
import { listDemoProofs, saveDemoProof } from '@/lib/demoProofs'
import { gs, num } from '@/utils/calculos'
import { formatGsInput, parseGsInput } from '@/utils/moneda'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import NumericKeypad from '@/components/shared/NumericKeypad'

const METHODS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta / POS', CREDIT: 'Crédito' }

export default function PagosPedido({ venta, onClose }) {
  const { esDemo, usuario, sesion } = useSesion()
  const [order, setOrder] = useState(venta)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('TRANSFER')
  const [reference, setReference] = useState('')
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [rate, setRate] = useState('')
  const [device, setDevice] = useState({ serial: '', model: '', conditionNotes: '' })
  const account = accounts.find(a => a.id === accountId)
  useEffect(() => { let active = true; getPaymentAccounts().then(rows => { if (active) setAccounts(rows.filter(a => a.isActive)) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [])
  const [proofs, setProofs] = useState({})
  const [reconciliations, setReconciliations] = useState({})
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const attempt = useRef(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const payments = order.pagos || []
  const pending = num(order.totalPendiente)
  const canReconcile = esDemo || ['ADMIN', 'GERENTE', 'CAJERA'].includes(usuario?.role)

  useEffect(() => {
    let active = true
    Promise.all(payments.map(async p => [p.id, esDemo ? await listDemoProofs(p.id) : await api.get(`/api/payments/${encodeURIComponent(p.id)}/proofs`)]))
      .then(entries => { if (active) setProofs(Object.fromEntries(entries)) })
      .catch(e => { if (active) setError(e.message) })
    if (!esDemo) Promise.all(payments.map(async p => [p.id, await api.get(`/api/payments/${encodeURIComponent(p.id)}/reconciliation`)]))
      .then(entries => { if (active) setReconciliations(Object.fromEntries(entries)) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [order, esDemo])

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
      }
      setNotice('Conciliación registrada. El saldo de la venta no fue modificado.')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function register(e) {
    e.preventDefault()
    if (busy || needsRefresh) return
    if (account?.currency === 'USD' && (!/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim()) || !/^\d+(?:[.,]\d{1,6})?$/.test(rate.trim()))) { setError('Usá hasta 2 decimales para USD y 6 para la cotización.'); return }
    const originalAmount = account?.currency === 'USD' ? Number(amount.replace(',', '.')) : parseGsInput(amount)
    const exchangeRatePyg = account?.currency === 'USD' ? Number(rate.replace(',', '.')) : 1
    if (!Number.isFinite(originalAmount) || !Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0) { setError('Completá el monto y la cotización.'); return }
    const value = Math.round(originalAmount * exchangeRatePyg)
    if (!Number.isSafeInteger(value) || value <= 0 || value > pending) { setError('El monto debe ser positivo y no superar el saldo pendiente.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const tradeIn = account?.kind === 'TRADE_IN' ? device : undefined
      if (tradeIn && (!device.serial.trim() || !device.model.trim() || !device.conditionNotes.trim())) throw new Error('Completá IMEI/serial, modelo y estado del teléfono recibido.')
      const details = account ? { accountId, originalAmount, exchangeRatePyg, currency: account.currency, accountSnapshot: { ...account }, tradeIn } : {}
      if (esDemo) {
        const newPayment = { id: crypto.randomUUID(), ...details, method: account?.kind || method, medioPago: account?.name || METHODS[method], monto: value, amountPyg: value, cuenta: reference, fecha: new Date().toISOString(), reconciliationState: 'PENDING' }
        await validateDemoTradeIns([newPayment])
        const updatedPayments = [...payments, newPayment]
        const paid = num(order.totalPagado) + value
        updateVenta(order.id, { pagos: updatedPayments, totalPagado: paid, totalPendiente: pending - value, estadoPago: pending === value ? 'Pagado' : 'Parcial' })
        try { await recordDemoTradeIns(order, [newPayment]) } catch (error) {
          setNeedsRefresh(true)
          throw new Error(`El pago demo se guardó, pero el equipo requiere revisión. No repitas el cobro. ${error.message}`)
        }
      } else {
        const payload = { orderId: order.id, method: account?.kind || method, amountPyg: value, reference, ...details }
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
      setAmount(''); setReference(''); setNotice('Pago registrado. Podés adjuntar su comprobante abajo.')
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

  return <Modal open onClose={() => !busy && onClose()} title={`Pagos · ${order.codigo || order.cliente || 'Pedido'}`} className="max-w-2xl">
    <p className="mb-5 text-sm text-mute">Cada cobro conserva su fecha y referencia. Un archivo adjunto no confirma una transferencia.</p>
    <div className="mb-5 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-fore/10 p-4"><p className="text-xs text-mute">Pagado</p><strong className="mt-1 block text-xl text-fono-light">{gs(order.totalPagado)}</strong></div>
      <div className="rounded-xl border border-fore/10 p-4"><p className="text-xs text-mute">Pendiente</p><strong className="mt-1 block text-xl">{gs(pending)}</strong></div>
    </div>
    {pending > 0 && <form onSubmit={register} className="mb-6 space-y-3 rounded-xl border border-fono/20 bg-fono/5 p-4">
      <h3 className="font-semibold">Registrar pago parcial o total</h3>
      <label className="block text-xs text-mute">Cuenta de destino<Select aria-label="Cuenta de destino" className="mt-1" value={accountId} onChange={e => { setAccountId(e.target.value); setAmount(''); setRate('') }}><option value="">Método manual sin cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.accountNumber || a.kind}</option>)}</Select></label>
      <label className="block text-xs text-mute">Monto en {account?.currency === 'USD' ? 'dólares' : 'guaraníes'}<Input aria-label="Monto del pago" value={amount} inputMode="decimal" onChange={e => setAmount(account?.currency === 'USD' ? e.target.value : formatGsInput(e.target.value))} placeholder={account?.currency === 'USD' ? '10.50' : 'Gs 0'} />{account?.currency !== 'USD' && <NumericKeypad value={amount.replace(/\D/g, '')} onChange={v => setAmount(formatGsInput(v))} />}</label>
      {account?.currency === 'USD' && <label className="block text-xs text-mute">Cotización: Gs por USD<Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="7500" /></label>}
      {account?.kind === 'TRADE_IN' && <div className="space-y-2"><Input aria-label="IMEI o serial" placeholder="IMEI / serial" value={device.serial} onChange={e => setDevice(d => ({ ...d, serial: e.target.value }))} /><Input aria-label="Modelo recibido" placeholder="Modelo recibido" value={device.model} onChange={e => setDevice(d => ({ ...d, model: e.target.value }))} /><Input placeholder="Estado y observaciones" value={device.conditionNotes} onChange={e => setDevice(d => ({ ...d, conditionNotes: e.target.value }))} /></div>}
      {!account && <label className="block text-xs text-mute">Método<Select className="mt-1" value={method} onChange={e => setMethod(e.target.value)}>{Object.entries(METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>}
      <label className="block text-xs text-mute">Cuenta / referencia<Input value={reference} onChange={e => setReference(e.target.value)} maxLength={200} placeholder="Banco, cuenta o referencia de operación" /></label>
      <Button disabled={busy || needsRefresh} type="submit">{busy ? 'Guardando…' : 'Registrar pago'}</Button>
    </form>}
    <div className="space-y-3"><h3 className="font-semibold">Cronología de pagos y comprobantes</h3>
      {!payments.length && <p className="text-sm text-mute">Todavía no hay pagos registrados.</p>}
      {payments.map(p => <article key={p.id} className="rounded-xl border border-fore/10 p-4">
        <div className="flex justify-between gap-3"><strong>{gs(p.monto)}</strong><span className="text-xs text-mute">{METHODS[p.medioPago] || p.medioPago}</span></div>
        <p className="mt-1 text-xs text-mute">{new Date(p.fecha || p.paidAt || p.createdAt).toLocaleString('es-PY')} · {p.cuenta || p.reference || 'Sin referencia'}</p>
        {p.accountSnapshot && <p className="mt-1 text-xs text-fono-light">{p.accountSnapshot.name} · {p.accountSnapshot.bank} · {p.accountSnapshot.accountNumber} · {p.currency} {p.originalAmount} · cotización {p.exchangeRatePyg}</p>}
        <p className="my-2 text-xs text-amber-300">Conciliación: {(reconciliations[p.id]?.state || p.reconciliationState) === 'VERIFIED' ? 'Verificada' : (reconciliations[p.id]?.state || p.reconciliationState) === 'REJECTED' ? 'Rechazada' : 'Pendiente de revisión'}</p>
        {(proofs[p.id] || []).map(file => <button key={file.id} className="mb-2 block text-sm text-fono-light underline" onClick={() => download(p.id, file)}>{file.name || file.fileName || 'Descargar comprobante'}</button>)}
        <label className="block text-xs text-mute">Adjuntar comprobante · JPG, PNG, WebP o PDF · hasta 5 MB<input disabled={busy} type="file" className="mt-2 block w-full text-xs" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { upload(p.id, e.target.files?.[0]); e.target.value = '' }} /></label>
        {canReconcile && <div className="mt-3 border-t border-fore/10 pt-3"><Input aria-label={`Comentario de conciliación ${p.id}`} placeholder="Comentario interno de conciliación" maxLength={2000} value={notes[p.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))} /><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => reconcile(p.id, 'VERIFIED')}>Verificar</Button><button disabled={busy} className="rounded-lg border border-red-400/30 px-3 text-sm text-red-300" onClick={() => reconcile(p.id, 'REJECTED')}>Rechazar</button></div></div>}
        {(p.reconciliationHistory || []).map((entry, index) => <p key={index} className="mt-2 text-xs text-mute">{entry.user} · {new Date(entry.at).toLocaleString('es-PY')} · {entry.state}: {entry.note}</p>)}
        {reconciliations[p.id]?.note && <p className="mt-2 text-xs text-mute">{reconciliations[p.id].note}</p>}
      </article>)}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-fono-light">{notice}</p>}
    {esDemo && <p className="mt-4 text-xs text-mute">Demo: pagos y archivos se guardan sólo en este navegador.</p>}
  </Modal>
}
