import { useEffect, useMemo, useState } from 'react'
import { getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { purchasesApi } from '@/lib/api/purchases'
import { suppliersApi } from '@/lib/api/suppliers'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { loadDemoPurchases, createDemoPurchase, receiveDemoPurchase } from '@/lib/demoPurchases'
import { gs, formatGsInput, parseGsInput } from '@/utils/calculos'
import { Badge, Button, Card, Input, Label, Modal, Select } from '@/components/ui'

const emptyLine = () => ({ productId: '', quantity: '1', unitCostPyg: '0', lotReference: '' })
const money = (value) => parseGsInput(value)
const totalOf = (lines, costs) => lines.reduce((total, line) => total + Number(line.quantity || 0) * Number(line.unitCostPyg || 0), 0) + Object.values(costs).reduce((total, value) => total + Number(value || 0), 0)

function ProductLine({ products, line, onChange, canRemove, onRemove }) {
  return <div className="grid gap-2 rounded-xl border border-ink-600/70 p-2 sm:grid-cols-[1fr_86px_130px_1fr_auto]">
    <select className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm" value={line.productId} onChange={(e) => onChange({ ...line, productId: e.target.value })}>
      <option value="">Buscar producto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.nombre || item.name}</option>)}
    </select>
    <Input inputMode="numeric" value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })} placeholder="Cant." />
    <Input inputMode="numeric" value={formatGsInput(line.unitCostPyg)} onChange={(e) => onChange({ ...line, unitCostPyg: money(e.target.value) })} placeholder="Costo ₲" />
    <Input value={line.lotReference} onChange={(e) => onChange({ ...line, lotReference: e.target.value })} placeholder="Lote / referencia" />
    {canRemove && <Button type="button" variant="ghost" aria-label="Quitar línea" onClick={onRemove}>×</Button>}
  </div>
}

export default function Compras() {
  const demo = isDemoRuntime; const products = getProductos()
  const [purchases, setPurchases] = useState(demo ? loadDemoPurchases() : [])
  const [suppliers, setSuppliers] = useState([]); const [supplierName, setSupplierName] = useState('')
  const [branchId, setBranchId] = useState(''); const [lines, setLines] = useState([emptyLine()])
  const [costs, setCosts] = useState({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' })
  const [currency, setCurrency] = useState('PYG'); const [exchangeRatePyg, setExchangeRatePyg] = useState('1')
  const [creditEnabled, setCreditEnabled] = useState(false); const [dueAt, setDueAt] = useState(''); const [supplierReference, setSupplierReference] = useState('')
  const [costAllocationMethod, setCostAllocationMethod] = useState('PROPORTIONAL_VALUE')
  const [accounts, setAccounts] = useState([]); const [paymentPurchase, setPaymentPurchase] = useState(null)
  const [payment, setPayment] = useState({ accountId: '', currency: 'PYG', originalAmount: '', exchangeRatePyg: '1', reference: '', kind: 'SETTLEMENT' })
  const [busy, setBusy] = useState(!demo); const [error, setError] = useState(''); const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setError('')
    try { const [purchaseRows, supplierRows, accountRows] = await Promise.all([demo ? Promise.resolve(loadDemoPurchases()) : purchasesApi.list(), demo ? Promise.resolve([]) : suppliersApi.list(), getPaymentAccounts()]); setPurchases(purchaseRows); setSuppliers(supplierRows); setAccounts(accountRows.filter(account => account.isActive)) }
    catch (err) { setError(err?.message || 'No se pudieron cargar las compras.') } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [demo])
  const estimatedTotal = useMemo(() => totalOf(lines, costs), [lines, costs])
  const updateLine = (index, value) => setLines(items => items.map((item, itemIndex) => itemIndex === index ? value : item))

  async function create(e) {
    e.preventDefault(); setError(''); setMessage('')
    const valid = lines.length && lines.every(line => line.productId && Number.isSafeInteger(Number(line.quantity)) && Number(line.quantity) > 0 && Number.isSafeInteger(Number(line.unitCostPyg)) && Number(line.unitCostPyg) >= 0)
    if (!supplierName.trim() || !valid) return setError('Indicá proveedor y completá cada línea con producto, cantidad y costo.')
    const payload = { supplierName: supplierName.trim(), branchId: branchId || undefined, ...Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, Number(value)])), currency, exchangeRatePyg: Number(exchangeRatePyg), creditEnabled, dueAt: dueAt || undefined, supplierReference: supplierReference || undefined, costAllocationMethod, lines: lines.map(line => ({ ...line, quantity: Number(line.quantity), unitCostPyg: Number(line.unitCostPyg) })) }
    setBusy(true)
    try {
      if (demo) { const created = { ...payload, id: `demo-purchase-${Date.now()}`, status: 'DRAFT', createdAt: new Date().toISOString(), receivedAt: null, payments: [], lines: payload.lines.map((line, index) => ({ ...line, id: `demo-line-${Date.now()}-${index}`, productName: products.find((p) => p.id === line.productId)?.nombre, baseTotalPyg: line.quantity * line.unitCostPyg, finalTotalCostPyg: line.quantity * line.unitCostPyg })) }; createDemoPurchase(created); setPurchases(loadDemoPurchases()) }
      else { const created = await purchasesApi.create(payload); setPurchases(items => [created, ...items]); if (!suppliers.some(item => item.name === created.supplierName)) setSuppliers(items => [...items, { id: created.supplierId, name: created.supplierName }].sort((a, b) => a.name.localeCompare(b.name))) }
      setSupplierName(''); setLines([emptyLine()]); setCosts({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' }); setCreditEnabled(false); setDueAt(''); setSupplierReference(''); setMessage('Compra creada con costo final distribuido por línea.')
    } catch (err) { setError(err?.message || 'No se pudo crear la compra.') } finally { setBusy(false) }
  }
  async function receive(purchase) { setBusy(true); setError(''); try { if (demo) { receiveDemoPurchase(purchase.id); setPurchases(loadDemoPurchases()) } else { await purchasesApi.receive(purchase.id); await load() }; setMessage('Compra recibida y stock actualizado.') } catch (err) { setError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) } }
  function openPayment(purchase) { setError(''); setPaymentPurchase(purchase); const first = accounts.find(account => account.currency === 'PYG') || accounts[0]; setPayment({ accountId: first?.id || '', currency: first?.currency || 'PYG', originalAmount: '', exchangeRatePyg: first?.currency === 'PYG' ? '1' : '', reference: '', kind: purchase.creditEnabled ? 'SETTLEMENT' : 'ADVANCE' }) }
  async function paySupplier(event) { event.preventDefault(); if (!paymentPurchase) return; setBusy(true); setError(''); setMessage(''); try { await purchasesApi.pay(paymentPurchase.id, { ...payment, originalAmount: Number(payment.originalAmount), exchangeRatePyg: Number(payment.exchangeRatePyg) }); await load(); setPaymentPurchase(null); setMessage('Pago a proveedor registrado y saldo actualizado.') } catch (err) { setError(err?.message || 'No se pudo registrar el pago al proveedor.') } finally { setBusy(false) } }

  return <div className="space-y-4">
    <Card><h2 className="mb-1 font-bold">Compras e importaciones</h2><p className="mb-4 text-sm text-mute">Anticipos, crédito y costos finales auditables por equipo o lote.</p>
      <form onSubmit={create} className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Input list="suppliers" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Proveedor" /><datalist id="suppliers">{suppliers.map(item => <option key={item.id} value={item.name} />)}</datalist><Input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Sucursal (opcional)" /></div>
        <div className="space-y-2">{lines.map((line, index) => <ProductLine key={index} products={products} line={line} onChange={(value) => updateLine(index, value)} canRemove={lines.length > 1} onRemove={() => setLines(items => items.filter((_, itemIndex) => itemIndex !== index))} />)}<Button type="button" variant="outline" onClick={() => setLines(items => [...items, emptyLine()])}>+ Agregar línea / lote</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[['shippingPyg', 'Flete ₲'], ['customsPyg', 'Aduana ₲'], ['insurancePyg', 'Seguro ₲'], ['taxesPyg', 'Impuestos ₲'], ['otherCostsPyg', 'Otros costos ₲']].map(([key, label]) => <Input key={key} inputMode="numeric" value={formatGsInput(costs[key])} onChange={(e) => setCosts(value => ({ ...value, [key]: money(e.target.value) }))} placeholder={label} />)}<Select value={costAllocationMethod} onChange={(e) => setCostAllocationMethod(e.target.value)}><option value="PROPORTIONAL_VALUE">Distribuir por valor</option><option value="PROPORTIONAL_QUANTITY">Distribuir por cantidad</option></Select><Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{['PYG', 'USD', 'BRL', 'EUR', 'USDT'].map(item => <option key={item}>{item}</option>)}</Select><Input inputMode="decimal" disabled={currency === 'PYG'} value={exchangeRatePyg} onChange={(e) => setExchangeRatePyg(e.target.value)} placeholder="Cotización PYG" /></div>
        <div className="grid gap-2 rounded-xl border border-ink-600/70 p-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.target.checked)} /> Compra a crédito</label><Input type="date" disabled={!creditEnabled} value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Vencimiento de crédito" /><Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Referencia proveedor" /></div>
        <div className="flex items-center justify-between text-sm text-mute"><span>Total final estimado: <strong className="text-ink-100">{gs(estimatedTotal)}</strong></span><Button type="submit" disabled={busy}>Crear pedido</Button></div>
      </form>{error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}{message && <p className="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}
    </Card>
    <div className="space-y-3">{purchases.map(purchase => <Card key={purchase.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{purchase.supplierName}</h3><p className="text-xs text-mute">{purchase.lines?.length || 0} línea(s) · {new Date(purchase.createdAt).toLocaleDateString()} {purchase.creditEnabled ? '· Crédito' : ''}</p></div><Badge color={purchase.status === 'RECEIVED' ? 'green' : 'orange'}>{purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}</Badge></div><div className="mt-3 space-y-1 text-sm">{(purchase.lines || []).map(item => <div key={item.id} className="flex justify-between gap-3"><span>{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><span>{gs(item.finalTotalCostPyg ?? Number(item.quantity) * Number(item.unitCostPyg))}</span></div>)}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700 pt-2 text-xs text-mute"><span>Costo final {gs(purchase.finalCostPyg ?? 0)}</span><span>Pagado {gs(purchase.paidPyg ?? 0)}</span><span className={(purchase.outstandingPyg ?? 0) > 0 ? 'text-warn' : 'text-ok'}>Saldo {gs(purchase.outstandingPyg ?? 0)}</span></div><div className="mt-3 flex flex-wrap gap-2">{purchase.status === 'DRAFT' && <Button variant="outline" disabled={busy} onClick={() => receive(purchase)}>Recibir y sumar stock</Button>}{!demo && Number(purchase.outstandingPyg || 0) > 0 && <Button disabled={busy || !accounts.length} onClick={() => openPayment(purchase)}>Registrar pago</Button>}</div></Card>)}</div>
    <Modal open={paymentPurchase !== null} onClose={() => setPaymentPurchase(null)} title="Registrar pago a proveedor"><form onSubmit={paySupplier} className="space-y-3"><p className="text-sm text-mute">{paymentPurchase?.supplierName} · saldo actual {gs(paymentPurchase?.outstandingPyg || 0)}. La cotización queda congelada en este pago.</p><div><Label>Cuenta de salida</Label><Select required value={payment.accountId} onChange={(event) => { const account = accounts.find(item => item.id === event.target.value); setPayment(data => ({ ...data, accountId: event.target.value, currency: account?.currency || 'PYG', exchangeRatePyg: account?.currency === 'PYG' ? '1' : '' })) }}><option value="">Elegí una cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Monto en {payment.currency}</Label><Input required inputMode="decimal" value={payment.originalAmount} onChange={(event) => setPayment(data => ({ ...data, originalAmount: event.target.value.replace(',', '.') }))} placeholder="0" /></div><div><Label>Cotización en Gs.</Label><Input required disabled={payment.currency === 'PYG'} inputMode="decimal" value={payment.exchangeRatePyg} onChange={(event) => setPayment(data => ({ ...data, exchangeRatePyg: event.target.value.replace(',', '.') }))} placeholder={payment.currency === 'PYG' ? '1' : 'Ej. 7500'} /></div></div><div><Label>Referencia <span className="text-mute">(opcional)</span></Label><Input maxLength={200} value={payment.reference} onChange={(event) => setPayment(data => ({ ...data, reference: event.target.value }))} placeholder="Transferencia, recibo o comprobante" /></div><Button className="w-full" type="submit" disabled={busy || !payment.accountId || !Number(payment.originalAmount) || !Number(payment.exchangeRatePyg)}>Guardar pago</Button></form></Modal>
  </div>
}
