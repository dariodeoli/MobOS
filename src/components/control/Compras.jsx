import { useEffect, useMemo, useState } from 'react'
import { getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { purchasesApi } from '@/lib/api/purchases'
import { loadDemoPurchases, createDemoPurchase, receiveDemoPurchase } from '@/lib/demoPurchases'
import { gs, formatGsInput, parseGsInput } from '@/utils/calculos'
import { Badge, Button, Card, Input } from '@/components/ui'

const emptyLine = { productId: '', quantity: '1', unitCostPyg: '0' }

function ProductPicker({ products, line, onChange }) {
  const product = products.find((item) => item.id === line.productId)
  return <div className="grid gap-2 sm:grid-cols-[1fr_100px_140px]">
    <select className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm" value={line.productId} onChange={(e) => onChange({ ...line, productId: e.target.value })}>
      <option value="">Elegir producto</option>
      {products.map((item) => <option key={item.id} value={item.id}>{item.nombre || item.name}</option>)}
    </select>
    <Input inputMode="numeric" value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })} placeholder="Cantidad" />
    <Input inputMode="numeric" value={formatGsInput(line.unitCostPyg)} onChange={(e) => onChange({ ...line, unitCostPyg: parseGsInput(e.target.value) })} placeholder="Costo unitario ₲" aria-label={`Costo de ${product?.nombre || 'producto'}`} />
  </div>
}

export default function Compras() {
  const demo = isDemoRuntime
  const products = getProductos()
  const [purchases, setPurchases] = useState(demo ? loadDemoPurchases() : [])
  const [supplierName, setSupplierName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [shippingPyg, setShippingPyg] = useState('0')
  const [customsPyg, setCustomsPyg] = useState('0')
  const [line, setLine] = useState(emptyLine)
  const [busy, setBusy] = useState(!demo)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    if (demo) return
    setBusy(true); setError('')
    try { setPurchases(await purchasesApi.list()) } catch (err) { setError(err?.message || 'No se pudieron cargar las compras.') } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [demo])

  const lineTotal = useMemo(() => Number(line.quantity) * Number(line.unitCostPyg), [line])
  async function create(e) {
    e.preventDefault(); setError(''); setMessage('')
    if (!supplierName.trim() || !line.productId || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isSafeInteger(Number(line.unitCostPyg)) || Number(line.unitCostPyg) < 0) return setError('Proveedor, producto, cantidad y costo son obligatorios.')
    const payload = { supplierName: supplierName.trim(), branchId: branchId || undefined, shippingPyg: Number(shippingPyg), customsPyg: Number(customsPyg), lines: [{ productId: line.productId, quantity: Number(line.quantity), unitCostPyg: Number(line.unitCostPyg) }] }
    setBusy(true)
    try {
      if (demo) { const created = { ...payload, id: `demo-purchase-${Date.now()}`, status: 'DRAFT', createdAt: new Date().toISOString(), receivedAt: null, lines: [{ ...payload.lines[0], id: `demo-line-${Date.now()}`, productName: products.find((p) => p.id === line.productId)?.nombre } ] }; createDemoPurchase(created); setPurchases(loadDemoPurchases()) }
      else { const created = await purchasesApi.create(payload); setPurchases((items) => [created, ...items]) }
      setSupplierName(''); setLine(emptyLine); setMessage('Compra creada.')
    } catch (err) { setError(err?.message || 'No se pudo crear la compra.') } finally { setBusy(false) }
  }
  async function receive(purchase) {
    setBusy(true); setError(''); setMessage('')
    try {
      if (demo) { receiveDemoPurchase(purchase.id); setPurchases(loadDemoPurchases()) }
      else { const updated = await purchasesApi.receive(purchase.id); setPurchases((items) => items.map((item) => item.id === purchase.id ? { ...item, ...updated } : item)) }
      setMessage('Compra recibida y stock actualizado.')
    } catch (err) { setError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <Card><h2 className="mb-1 font-bold">Compras</h2><p className="mb-4 text-sm text-mute">Registrá pedidos, costos logísticos y recepción de stock.</p>
      <form onSubmit={create} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2"><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Proveedor" /><Input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Sucursal (opcional)" /></div>
        <ProductPicker products={products} line={line} onChange={setLine} />
        <div className="grid gap-2 sm:grid-cols-2"><Input inputMode="numeric" value={formatGsInput(shippingPyg)} onChange={(e) => setShippingPyg(parseGsInput(e.target.value))} placeholder="Flete ₲" /><Input inputMode="numeric" value={formatGsInput(customsPyg)} onChange={(e) => setCustomsPyg(parseGsInput(e.target.value))} placeholder="Aduana ₲" /></div>
        <div className="flex items-center justify-between text-sm text-mute"><span>Total línea: {gs(lineTotal || 0)}</span><Button type="submit" disabled={busy}>Crear pedido</Button></div>
      </form>
      {error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {message && <p className="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}
    </Card>
    <div className="space-y-3">{purchases.map((purchase) => <Card key={purchase.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{purchase.supplierName}</h3><p className="text-xs text-mute">{purchase.lines?.length || 0} línea(s) · {new Date(purchase.createdAt).toLocaleDateString()}</p></div><Badge color={purchase.status === 'RECEIVED' ? 'green' : 'orange'}>{purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}</Badge></div><div className="mt-3 space-y-1 text-sm">{(purchase.lines || []).map((item) => <div key={item.id} className="flex justify-between"><span>{item.productName || item.productId} × {item.quantity}</span><span>{gs(Number(item.quantity) * Number(item.unitCostPyg))}</span></div>)}</div>{purchase.status === 'DRAFT' && <Button className="mt-3" variant="outline" disabled={busy} onClick={() => receive(purchase)}>Recibir y sumar stock</Button>}</Card>)}</div>
  </div>
}
