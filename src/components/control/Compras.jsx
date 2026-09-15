import { useEffect, useMemo, useState } from 'react'
import { getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { purchasesApi } from '@/lib/api/purchases'
import { suppliersApi } from '@/lib/api/suppliers'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { loadDemoPurchases, createDemoPurchase, receiveDemoPurchase, updateDemoPurchaseCosts } from '@/lib/demoPurchases'
import { gs } from '@/utils/calculos'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, MoneyInput, Select, Skeleton, useToast } from '@/components/ui'

const emptyLine = () => ({ productId: '', quantity: '1', unitCostPyg: '0', lotReference: '' })
const totalOf = (lines, costs) => lines.reduce((total, line) => total + Number(line.quantity || 0) * Number(line.unitCostPyg || 0), 0) + Object.values(costs).reduce((total, value) => total + Number(value || 0), 0)
const SUPPLIER_FIELDS = [
  ['name', 'Nombre'],
  ['document', 'Documento / RUC'],
  ['phone', 'Teléfono'],
  ['email', 'Email'],
  ['address', 'Dirección'],
  ['city', 'Ciudad'],
  ['contactName', 'Contacto'],
  ['paymentTerms', 'Condiciones de pago'],
  ['notes', 'Notas'],
]

function ProductLine({ products, line, onChange, canRemove, onRemove }) {
  return <div className="grid gap-2 rounded-xl border border-ink-600/70 p-2 sm:grid-cols-[1fr_86px_130px_1fr_auto]">
    <select className="rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm" value={line.productId} onChange={(e) => onChange({ ...line, productId: e.target.value })}>
      <option value="">Buscar producto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.nombre || item.name}</option>)}
    </select>
    <Input inputMode="numeric" value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value.replace(/\D/g, '') })} placeholder="Cant." />
    <MoneyInput value={line.unitCostPyg} onValueChange={(value) => onChange({ ...line, unitCostPyg: value })} placeholder="Costo ₲" />
    <Input value={line.lotReference} onChange={(e) => onChange({ ...line, lotReference: e.target.value })} placeholder="Lote / referencia" />
    {canRemove && <Button type="button" variant="ghost" aria-label="Quitar línea" onClick={onRemove}>×</Button>}
  </div>
}

export default function Compras() {
  const demo = isDemoRuntime; const products = getProductos(); const toast = useToast()
  const [purchases, setPurchases] = useState(demo ? loadDemoPurchases() : [])
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', city: '', address: '' })
  const [suppliersOpen, setSuppliersOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState(null)
  const [branchId, setBranchId] = useState(''); const [lines, setLines] = useState([emptyLine()])
  const [costs, setCosts] = useState({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' })
  const [currency, setCurrency] = useState('PYG'); const [exchangeRatePyg, setExchangeRatePyg] = useState('1')
  const [creditEnabled, setCreditEnabled] = useState(false); const [dueAt, setDueAt] = useState(''); const [supplierReference, setSupplierReference] = useState('')
  const [costAllocationMethod, setCostAllocationMethod] = useState('PROPORTIONAL_VALUE')
  const [accounts, setAccounts] = useState([]); const [paymentPurchase, setPaymentPurchase] = useState(null)
  const [payment, setPayment] = useState({ accountId: '', currency: 'PYG', originalAmount: '', exchangeRatePyg: '1', reference: '', action: 'pay' })
  const [supplierBalance, setSupplierBalance] = useState(null)
  const [lineCostEdits, setLineCostEdits] = useState({})
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
    const linesValid = lines.length && lines.every(line => line.productId && Number.isSafeInteger(Number(line.quantity)) && Number(line.quantity) > 0 && Number.isSafeInteger(Number(line.unitCostPyg)) && Number(line.unitCostPyg) >= 0)
    const supplierValid = supplierId === 'new' ? Boolean(newSupplier.name.trim()) : suppliers.some(item => item.id === supplierId)
    if (!linesValid || !supplierValid) return setError('Indicá proveedor y completá cada línea con producto, cantidad y costo.')
    setBusy(true)
    try {
      let finalSupplierId = supplierId
      let finalSupplierName = supplierId === 'new' ? newSupplier.name.trim() : suppliers.find(item => item.id === supplierId)?.name || ''
      if (supplierId === 'new' && !demo) {
        const created = await suppliersApi.create({ name: finalSupplierName, phone: newSupplier.phone.trim() || undefined, city: newSupplier.city.trim() || undefined, address: newSupplier.address.trim() || undefined })
        finalSupplierId = created.id; finalSupplierName = created.name
        setSuppliers(items => [...items, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      const payload = { supplierName: finalSupplierName, ...(finalSupplierId && finalSupplierId !== 'new' ? { supplierId: finalSupplierId } : {}), branchId: branchId || undefined, ...Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, Number(value)])), currency, exchangeRatePyg: Number(exchangeRatePyg), creditEnabled, dueAt: dueAt || undefined, supplierReference: supplierReference || undefined, costAllocationMethod, lines: lines.map(line => ({ ...line, quantity: Number(line.quantity), unitCostPyg: Number(line.unitCostPyg) })) }
      if (demo) { const created = { ...payload, id: `demo-purchase-${Date.now()}`, status: 'DRAFT', createdAt: new Date().toISOString(), receivedAt: null, payments: [], lines: payload.lines.map((line, index) => ({ ...line, id: `demo-line-${Date.now()}-${index}`, productName: products.find((p) => p.id === line.productId)?.nombre, baseTotalPyg: line.quantity * line.unitCostPyg, finalTotalCostPyg: line.quantity * line.unitCostPyg })) }; createDemoPurchase(created); setPurchases(loadDemoPurchases()) }
      else { const created = await purchasesApi.create(payload); setPurchases(items => [created, ...items]); if (!suppliers.some(item => item.name === created.supplierName)) setSuppliers(items => [...items, { id: created.supplierId, name: created.supplierName }].sort((a, b) => a.name.localeCompare(b.name))) }
      setSupplierId(''); setNewSupplier({ name: '', phone: '', city: '', address: '' }); setLines([emptyLine()]); setCosts({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' }); setCreditEnabled(false); setDueAt(''); setSupplierReference(''); setMessage('Compra creada con costo final distribuido por línea.')
    } catch (err) { setError(err?.message || 'No se pudo crear la compra.') } finally { setBusy(false) }
  }
  async function receive(purchase) { setBusy(true); setError(''); try { if (demo) { receiveDemoPurchase(purchase.id); setPurchases(loadDemoPurchases()) } else { await purchasesApi.receive(purchase.id); await load() }; setMessage('Compra recibida y stock actualizado.') } catch (err) { setError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) } }

  async function openPayment(purchase) {
    setError(''); setPaymentPurchase(purchase)
    const first = accounts.find(account => account.currency === 'PYG') || accounts[0]
    setPayment({ accountId: first?.id || '', currency: first?.currency || 'PYG', originalAmount: '', exchangeRatePyg: first?.currency === 'PYG' ? '1' : '', reference: '', action: purchase.creditEnabled ? 'pay' : 'advance' })
    setSupplierBalance(null)
    if (demo || !purchase.supplierId) return
    try { setSupplierBalance(await suppliersApi.balance(purchase.supplierId)) } catch { setSupplierBalance(null) }
  }
  async function paySupplier(event) {
    event.preventDefault(); if (!paymentPurchase) return; setBusy(true); setError(''); setMessage('')
    try {
      const payload = { accountId: payment.accountId, currency: payment.currency, originalAmount: Number(payment.originalAmount), exchangeRatePyg: payment.currency === 'PYG' ? 1 : Number(payment.exchangeRatePyg), reference: payment.reference }
      if (payment.action === 'advance') await purchasesApi.advance(paymentPurchase.id, payload)
      else await purchasesApi.pay(paymentPurchase.id, payload)
      await load(); setPaymentPurchase(null); setMessage('Pago a proveedor registrado y saldo actualizado.')
    } catch (err) { setError(err?.message || 'No se pudo registrar el pago al proveedor.') } finally { setBusy(false) }
  }

  function openSupplierEdit(supplier) {
    setEditingSupplier(supplier)
    setSupplierForm(Object.fromEntries(SUPPLIER_FIELDS.map(([key]) => [key, supplier[key] || ''])))
  }
  async function saveSupplier(event) {
    event.preventDefault(); if (!editingSupplier || !supplierForm?.name.trim()) return
    setBusy(true); setError('')
    try {
      await suppliersApi.update({ id: editingSupplier.id, ...supplierForm })
      toast.success('Proveedor actualizado.')
      setEditingSupplier(null); setSupplierForm(null)
      setSuppliers(await suppliersApi.list())
    } catch (err) { setError(err?.message || 'No se pudo guardar el proveedor.') } finally { setBusy(false) }
  }

  const lineCostValue = (purchase, item) => {
    const edits = lineCostEdits[purchase.id]
    return edits && edits[item.id] !== undefined ? edits[item.id] : item.unitCostPyg
  }
  const setLineCost = (purchaseId, lineId, value) => setLineCostEdits(prev => ({ ...prev, [purchaseId]: { ...(prev[purchaseId] || {}), [lineId]: value } }))
  const costChanges = (purchase) => (purchase.lines || []).filter(item => {
    const edit = lineCostEdits[purchase.id]?.[item.id]
    return edit !== undefined && Number(edit) !== Number(item.unitCostPyg)
  })
  async function saveCosts(purchase) {
    const changes = costChanges(purchase)
    if (!changes.length) return
    setBusy(true); setError('')
    try {
      if (demo) { updateDemoPurchaseCosts(purchase.id, changes.map(line => ({ id: line.id, unitCostPyg: Number(lineCostEdits[purchase.id][line.id]) }))); setPurchases(loadDemoPurchases()) }
      else { await purchasesApi.updateCosts(purchase.id, changes.map(line => ({ id: line.id, unitCostPyg: Number(lineCostEdits[purchase.id][line.id]), allocatedFeesPyg: Number(line.allocatedFeesPyg || 0) }))); await load() }
      setLineCostEdits(prev => { const next = { ...prev }; delete next[purchase.id]; return next })
      toast.success('Costos actualizados.')
    } catch (err) { setError(err?.message || 'No se pudieron guardar los costos.') } finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="mb-1 font-bold">Compras e importaciones</h2><p className="mb-4 text-sm text-mute">Anticipos, crédito y costos finales auditables por equipo o lote.</p></div><Button type="button" variant="outline" onClick={() => setSuppliersOpen(true)}>Proveedores</Button></div>
      <form onSubmit={create} className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Select aria-label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Elegí un proveedor</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">＋ Nuevo proveedor</option></Select><Input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Sucursal (opcional)" /></div>
        {supplierId === 'new' && <div className="grid gap-2 sm:grid-cols-2"><Input required value={newSupplier.name} onChange={(e) => setNewSupplier(s => ({ ...s, name: e.target.value }))} placeholder="Nombre del proveedor" /><Input value={newSupplier.phone} onChange={(e) => setNewSupplier(s => ({ ...s, phone: e.target.value }))} placeholder="Teléfono (opcional)" /><Input value={newSupplier.city} onChange={(e) => setNewSupplier(s => ({ ...s, city: e.target.value }))} placeholder="Ciudad (opcional)" /><Input value={newSupplier.address} onChange={(e) => setNewSupplier(s => ({ ...s, address: e.target.value }))} placeholder="Dirección (opcional)" /></div>}
        <div className="space-y-2">{lines.map((line, index) => <ProductLine key={index} products={products} line={line} onChange={(value) => updateLine(index, value)} canRemove={lines.length > 1} onRemove={() => setLines(items => items.filter((_, itemIndex) => itemIndex !== index))} />)}<Button type="button" variant="outline" onClick={() => setLines(items => [...items, emptyLine()])}>+ Agregar línea / lote</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[['shippingPyg', 'Flete ₲'], ['customsPyg', 'Aduana ₲'], ['insurancePyg', 'Seguro ₲'], ['taxesPyg', 'Impuestos ₲'], ['otherCostsPyg', 'Otros costos ₲']].map(([key, label]) => <MoneyInput key={key} value={costs[key]} onValueChange={(value) => setCosts(current => ({ ...current, [key]: value }))} placeholder={label} />)}<Select value={costAllocationMethod} onChange={(e) => setCostAllocationMethod(e.target.value)}><option value="PROPORTIONAL_VALUE">Distribuir por valor</option><option value="PROPORTIONAL_QUANTITY">Distribuir por cantidad</option></Select><Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{['PYG', 'USD', 'BRL', 'EUR', 'USDT'].map(item => <option key={item}>{item}</option>)}</Select><MoneyInput disabled={currency === 'PYG'} currency="USD" symbol="Gs." value={exchangeRatePyg} onValueChange={setExchangeRatePyg} placeholder="Cotización PYG" /></div>
        <div className="grid gap-2 rounded-xl border border-ink-600/70 p-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.target.checked)} /> Compra a crédito</label><Input type="date" disabled={!creditEnabled} value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Vencimiento de crédito" /><Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Referencia proveedor" /></div>
        <div className="flex items-center justify-between text-sm text-mute"><span>Total final estimado: <strong className="text-ink-800">{gs(estimatedTotal)}</strong></span><Button type="submit" disabled={busy}>Crear pedido</Button></div>
      </form>{error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}{message && <p className="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}
    </Card>
    <div className="space-y-3">{busy && purchases.length === 0 && <div className="space-y-2" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}{!busy && purchases.length === 0 && <EmptyState icon="box" title="Sin compras registradas." description="Creá la primera orden de compra o importación." />}{purchases.map(purchase => <Card key={purchase.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{purchase.supplierName}</h3><p className="text-xs text-mute">{purchase.lines?.length || 0} línea(s) · {new Date(purchase.createdAt).toLocaleDateString()} {purchase.creditEnabled ? '· Crédito' : ''}</p></div><Badge color={purchase.status === 'RECEIVED' ? 'green' : 'orange'}>{purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}</Badge></div>{purchase.status === 'DRAFT' && <div className="mt-3 space-y-1">{(purchase.lines || []).map(item => <div key={item.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 text-sm">{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><MoneyInput aria-label={`Costo unitario de ${item.productName || item.productId}`} value={lineCostValue(purchase, item)} onValueChange={(value) => setLineCost(purchase.id, item.id, value)} className="w-32" placeholder="Costo ₲" /></div>)}{costChanges(purchase).length > 0 && <div className="mt-2"><Button type="button" variant="outline" disabled={busy} onClick={() => saveCosts(purchase)}>Guardar costos</Button></div>}</div>}{purchase.status === 'RECEIVED' && <div className="mt-3 space-y-1 text-sm">{(purchase.lines || []).map(item => <div key={item.id} className="flex justify-between gap-3"><span>{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><span>{gs(item.finalTotalCostPyg ?? Number(item.quantity) * Number(item.unitCostPyg))}</span></div>)}</div>}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700 pt-2 text-xs text-mute"><span>Costo final {gs(purchase.finalCostPyg ?? 0)}</span><span>Pagado {gs(purchase.paidPyg ?? 0)}</span><span className={(purchase.outstandingPyg ?? 0) > 0 ? 'text-warn' : 'text-ok'}>Saldo {gs(purchase.outstandingPyg ?? 0)}</span></div><div className="mt-3 flex flex-wrap gap-2">{purchase.status === 'DRAFT' && <Button variant="outline" disabled={busy} onClick={() => receive(purchase)}>Recibir y sumar stock</Button>}{!demo && Number(purchase.outstandingPyg || 0) > 0 && <Button disabled={busy || !accounts.length} onClick={() => openPayment(purchase)}>Registrar pago</Button>}</div></Card>)}</div>
    <Modal open={suppliersOpen} onClose={() => { setSuppliersOpen(false); setEditingSupplier(null); setSupplierForm(null) }} title="Proveedores">
      {editingSupplier && supplierForm && <form onSubmit={saveSupplier} className="mb-4 space-y-3 rounded-xl border border-ink-600 p-3"><p className="text-sm font-semibold">Editar proveedor</p><div className="grid gap-2 sm:grid-cols-2">{SUPPLIER_FIELDS.map(([key, label]) => <div key={key}><Label>{label}</Label><Input required={key === 'name'} value={supplierForm[key]} onChange={(e) => setSupplierForm(current => ({ ...current, [key]: e.target.value }))} /></div>)}</div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Guardar proveedor</Button><Button type="button" variant="ghost" onClick={() => { setEditingSupplier(null); setSupplierForm(null) }}>Cancelar</Button></div></form>}
      {suppliers.length === 0 ? <EmptyState compact icon="users" title="Sin proveedores registrados." /> : <div className="space-y-2">{suppliers.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="truncate text-xs text-mute">{[item.city, item.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p></div><Button type="button" variant="outline" onClick={() => openSupplierEdit(item)}>Editar</Button></div>)}</div>}
    </Modal>
    <Modal open={paymentPurchase !== null} onClose={() => setPaymentPurchase(null)} title="Registrar pago a proveedor"><form onSubmit={paySupplier} className="space-y-3"><p className="text-sm text-mute">{paymentPurchase?.supplierName} · saldo actual {gs(paymentPurchase?.outstandingPyg || 0)}. La cotización queda congelada en este pago.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant={payment.action === 'advance' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'advance' }))}>Registrar anticipo</Button><Button type="button" variant={payment.action === 'pay' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'pay' }))}>Registrar pago</Button></div>{supplierBalance && <div className="rounded-xl border border-ink-600 p-3 text-sm"><p className="font-semibold">{supplierBalance.supplier?.name || paymentPurchase?.supplierName}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs text-mute"><span>Comprado<strong className="mt-0.5 block text-fore">{gs(supplierBalance.totalPurchasedPyg)}</strong></span><span>Pagado<strong className="mt-0.5 block text-ok">{gs(supplierBalance.paidPyg)}</strong></span><span>Pendiente<strong className="mt-0.5 block text-warn">{gs(supplierBalance.outstandingPyg)}</strong></span></div></div>}<div><Label>Cuenta de salida</Label><Select required value={payment.accountId} onChange={(event) => { const account = accounts.find(item => item.id === event.target.value); setPayment(data => ({ ...data, accountId: event.target.value, currency: account?.currency || 'PYG', exchangeRatePyg: account?.currency === 'PYG' ? '1' : '' })) }}><option value="">Elegí una cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Monto en {payment.currency}</Label><MoneyInput required currency={payment.currency} value={payment.originalAmount} onValueChange={(value) => setPayment(data => ({ ...data, originalAmount: value }))} placeholder="0" /></div><div><Label>Cotización en Gs.</Label><MoneyInput required disabled={payment.currency === 'PYG'} currency="USD" symbol="Gs." value={payment.exchangeRatePyg} onValueChange={(value) => setPayment(data => ({ ...data, exchangeRatePyg: value }))} placeholder={payment.currency === 'PYG' ? '1' : 'Ej. 7500'} /></div></div><div><Label>Referencia <span className="text-mute">(opcional)</span></Label><Input maxLength={200} value={payment.reference} onChange={(event) => setPayment(data => ({ ...data, reference: event.target.value }))} placeholder="Transferencia, recibo o comprobante" /></div><Button className="w-full" type="submit" disabled={busy || !payment.accountId || !Number(payment.originalAmount) || !Number(payment.exchangeRatePyg)}>{payment.action === 'advance' ? 'Guardar anticipo' : 'Guardar pago'}</Button></form></Modal>
  </div>
}
