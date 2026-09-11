import { useEffect, useState } from 'react'
import { Modal, Input, Button } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import { api, API_URL, getAccessToken } from '@/lib/api'
import { listVentas, updateVenta, refrescar } from '@/lib/storage'
import { listDemoProofs, saveDemoProof } from '@/lib/demoProofs'
import { gs, num } from '@/utils/calculos'
import { formatGsInput, parseGsInput } from '@/utils/moneda'

const METHODS = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta / POS', CREDIT: 'Parte de pago' }

export default function PagosPedido({ venta, onClose }) {
  const { esDemo, usuario, sesion } = useSesion()
  const [order, setOrder] = useState(venta)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('TRANSFER')
  const [reference, setReference] = useState('')
  const [proofs, setProofs] = useState({})
  const [reconciliations, setReconciliations] = useState({})
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
    if (busy) return
    const value = parseGsInput(amount)
    if (!Number.isSafeInteger(value) || value <= 0 || value > pending) { setError('El monto debe ser positivo y no superar el saldo pendiente.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      if (esDemo) {
        const updatedPayments = [...payments, { id: crypto.randomUUID(), medioPago: METHODS[method], monto: value, cuenta: reference, fecha: new Date().toISOString(), reconciliationState: 'PENDING' }]
        const paid = num(order.totalPagado) + value
        updateVenta(order.id, { pagos: updatedPayments, totalPagado: paid, totalPendiente: pending - value, estadoPago: pending === value ? 'Pagado' : 'Parcial' })
      } else {
        await api.post('/api/payments', { orderId: order.id, method, amountPyg: value, reference })
        await refrescar()
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
        const response = await fetch(`${API_URL}/api/payments/${encodeURIComponent(paymentId)}/proofs/${encodeURIComponent(proof.id)}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
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
      <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-mute">Pagado</p><strong className="mt-1 block text-xl text-fono-light">{gs(order.totalPagado)}</strong></div>
      <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-mute">Pendiente</p><strong className="mt-1 block text-xl">{gs(pending)}</strong></div>
    </div>
    {pending > 0 && <form onSubmit={register} className="mb-6 space-y-3 rounded-xl border border-fono/20 bg-fono/5 p-4">
      <h3 className="font-semibold">Registrar pago parcial o total</h3>
      <label className="block text-xs text-mute">Monto en guaraníes<Input aria-label="Monto del pago" value={amount} inputMode="numeric" onChange={e => setAmount(formatGsInput(e.target.value))} placeholder="Gs 0" /></label>
      <label className="block text-xs text-mute">Método<select className="mt-1 w-full rounded-lg border border-ink-500 bg-ink p-2" value={method} onChange={e => setMethod(e.target.value)}>{Object.entries(METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-xs text-mute">Cuenta / referencia<Input value={reference} onChange={e => setReference(e.target.value)} maxLength={200} placeholder="Banco, cuenta o referencia de operación" /></label>
      <Button disabled={busy} type="submit">{busy ? 'Guardando…' : 'Registrar pago'}</Button>
    </form>}
    <div className="space-y-3"><h3 className="font-semibold">Cronología de pagos y comprobantes</h3>
      {!payments.length && <p className="text-sm text-mute">Todavía no hay pagos registrados.</p>}
      {payments.map(p => <article key={p.id} className="rounded-xl border border-white/10 p-4">
        <div className="flex justify-between gap-3"><strong>{gs(p.monto)}</strong><span className="text-xs text-mute">{METHODS[p.medioPago] || p.medioPago}</span></div>
        <p className="mt-1 text-xs text-mute">{new Date(p.fecha || p.paidAt || p.createdAt).toLocaleString('es-PY')} · {p.cuenta || p.reference || 'Sin referencia'}</p>
        <p className="my-2 text-xs text-amber-300">Conciliación: {(reconciliations[p.id]?.state || p.reconciliationState) === 'VERIFIED' ? 'Verificada' : (reconciliations[p.id]?.state || p.reconciliationState) === 'REJECTED' ? 'Rechazada' : 'Pendiente de revisión'}</p>
        {(proofs[p.id] || []).map(file => <button key={file.id} className="mb-2 block text-sm text-fono-light underline" onClick={() => download(p.id, file)}>{file.name || file.fileName || 'Descargar comprobante'}</button>)}
        <label className="block text-xs text-mute">Adjuntar comprobante · JPG, PNG, WebP o PDF · hasta 5 MB<input disabled={busy} type="file" className="mt-2 block w-full text-xs" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { upload(p.id, e.target.files?.[0]); e.target.value = '' }} /></label>
        {canReconcile && <div className="mt-3 border-t border-white/10 pt-3"><Input aria-label={`Comentario de conciliación ${p.id}`} placeholder="Comentario interno de conciliación" maxLength={2000} value={notes[p.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))} /><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => reconcile(p.id, 'VERIFIED')}>Verificar</Button><button disabled={busy} className="rounded-lg border border-red-400/30 px-3 text-sm text-red-300" onClick={() => reconcile(p.id, 'REJECTED')}>Rechazar</button></div></div>}
        {(p.reconciliationHistory || []).map((entry, index) => <p key={index} className="mt-2 text-xs text-mute">{entry.user} · {new Date(entry.at).toLocaleString('es-PY')} · {entry.state}: {entry.note}</p>)}
        {reconciliations[p.id]?.note && <p className="mt-2 text-xs text-mute">{reconciliations[p.id].note}</p>}
      </article>)}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-fono-light">{notice}</p>}
    {esDemo && <p className="mt-4 text-xs text-mute">Demo: pagos y archivos se guardan sólo en este navegador.</p>}
  </Modal>
}
