import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addProducto, addProductoApi, getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { api } from '@/lib/api/client'
import { purchasesApi } from '@/lib/api/purchases'
import { suppliersApi } from '@/lib/api/suppliers'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { loadDemoPurchases, createDemoPurchase, receiveDemoPurchase, updateDemoPurchaseCosts } from '@/lib/demoPurchases'
import { gs } from '@/utils/calculos'
import { Badge, Button, Card, EmptyState, Input, Label, Modal, MoneyInput, Select, Skeleton, useToast } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import EmailField from '@/components/shared/EmailField'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import CurrencySelect from '@/components/shared/CurrencySelect'
import { cn } from '@/lib/utils'
import { normalizarBusqueda } from '@/utils/cliente'

// Tabla compacta: una fila por compra y el detalle de líneas se despliega en
// la misma fila, donde viven los costos editables del borrador.
const GRID_COMPRAS = 'grid min-w-[53.5rem] grid-cols-[minmax(8rem,1.4fr)_5rem_3rem_5rem_5rem_6.5rem_6.5rem_8.5rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fechaCompra = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}
// El vencimiento solo se pinta cuando apura: vencido o a 3 días. El resto es
// una fecha más.
const vencimientoCompra = (purchase) => {
  if (!purchase.dueAt) return { texto: '—', urgente: false, titulo: undefined }
  const vence = new Date(purchase.dueAt)
  if (Number.isNaN(vence.getTime())) return { texto: '—', urgente: false, titulo: undefined }
  const titulo = `Vence el ${vence.toLocaleDateString('es-PY')}`
  const saldo = Number(purchase.outstandingPyg || 0)
  if (purchase.status === 'RECEIVED' && saldo <= 0) return { texto: fechaCompra(purchase.dueAt), urgente: false, titulo }
  const dias = Math.ceil((vence.getTime() - Date.now()) / 86400000)
  if (dias < 0) return { texto: 'venció', urgente: true, titulo }
  return { texto: fechaCompra(purchase.dueAt), urgente: dias <= 3, titulo }
}

const emptyLine = () => ({ productId: '', quantity: '1', unitCostPyg: '0', lotReference: '' })
const totalOf = (lines, costs) => lines.reduce((total, line) => total + Number(line.quantity || 0) * Number(line.unitCostPyg || 0), 0) + Object.values(costs).reduce((total, value) => total + Number(value || 0), 0)
const COST_FIELDS = [['shippingPyg', 'Flete'], ['customsPyg', 'Aduana'], ['insurancePyg', 'Seguro'], ['taxesPyg', 'Impuestos'], ['otherCostsPyg', 'Otros costos']]
const SUPPLIER_FIELDS = [
  ['name', 'Nombre'],
  ['code', 'Abreviatura para stock (ej. MIAMI)'],
  ['document', 'Documento / RUC'],
  ['phone', 'Teléfono'],
  ['email', 'Email'],
  ['address', 'Dirección'],
  ['city', 'Ciudad'],
  ['department', 'Departamento'],
  ['contactName', 'Contacto'],
  ['paymentTerms', 'Condiciones de pago'],
  ['notes', 'Notas'],
]

function ProductLine({ products, line, currency, onChange, onSelectProduct, onCreateProduct, canRemove, onRemove }) {
  return <div className="grid gap-2 rounded-xl border border-ink-600/70 p-2 sm:grid-cols-[1fr_86px_130px_1fr_auto]">
    <ProductCombobox products={products} selectedId={line.productId} onSelect={onSelectProduct} onCreate={onCreateProduct} placeholder="Buscar producto…" />
    <Input inputMode="numeric" value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value.replace(/\D/g, '') })} placeholder="Cant." />
    <MoneyInput currency={currency} value={line.unitCostPyg} onValueChange={(value) => onChange({ ...line, unitCostPyg: value })} placeholder="Costo" />
    <Input value={line.lotReference} onChange={(e) => onChange({ ...line, lotReference: e.target.value })} placeholder="Lote / referencia" />
    {canRemove && <Button type="button" variant="ghost" aria-label="Quitar línea" onClick={onRemove}>×</Button>}
  </div>
}

export default function Compras() {
  const demo = isDemoRuntime; const products = getProductos(); const toast = useToast()
  const { sucursal, sucursales } = useSesion()
  const branchTouched = useRef(false)
  const branchOptions = sucursales.length > 0 ? sucursales : (sucursal ? [sucursal] : [])
  const [purchases, setPurchases] = useState(demo ? loadDemoPurchases() : [])
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState({ name: '', countryCode: '+595', phone: '', city: '', department: '', address: '' })
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
  const [expandida, setExpandida] = useState(null)
  const [orden, setOrden] = useState({ key: 'fecha', dir: 'desc' })
  const [busy, setBusy] = useState(!demo); const [error, setError] = useState(''); const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setBusy(true); setError('')
    try { const [purchaseRows, supplierRows, accountRows] = await Promise.all([demo ? Promise.resolve(loadDemoPurchases()) : purchasesApi.list(), demo ? Promise.resolve([]) : suppliersApi.list(), getPaymentAccounts()]); setPurchases(purchaseRows); setSuppliers(supplierRows); setAccounts(accountRows.filter(account => account.isActive)) }
    catch (err) { setError(err?.message || 'No se pudieron cargar las compras.') } finally { setBusy(false) }
  }, [demo])
  useEffect(() => { load() }, [load])
  const estimatedTotal = useMemo(() => {
    const total = totalOf(lines, costs)
    return currency === 'PYG' ? total : Math.round(total * (Number(exchangeRatePyg) || 1))
  }, [lines, costs, currency, exchangeRatePyg])
  const updateLine = (index, value) => setLines(items => items.map((item, itemIndex) => itemIndex === index ? value : item))
  useEffect(() => { if (!branchTouched.current) setBranchId(sucursal?.id || '') }, [sucursal])
  const rate = currency === 'PYG' ? 1 : Number(exchangeRatePyg)
  const toPyg = (value) => Math.round((Number(value) || 0) * rate)
  const costsTotalPyg = useMemo(() => {
    const total = Object.values(costs).reduce((sum, value) => sum + (Number(value) || 0), 0)
    return currency === 'PYG' ? total : Math.round(total * (Number(exchangeRatePyg) || 1))
  }, [costs, currency, exchangeRatePyg])
  const chooseProduct = (index, product) => setLines(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, productId: product.id, sku: product.sku || '', nombre: product.nombre || product.name || '' } : item))
  async function createProduct(text) {
    try {
      if (demo) return addProducto(text)
      return await addProductoApi({ sku: text, name: text, pricePyg: 0, stock: 0, branchId: branchId || undefined })
    } catch (err) { setError(err?.message || 'No se pudo crear el producto.'); return null }
  }

  async function create(e) {
    e.preventDefault(); setError(''); setMessage('')
    const rateValid = currency === 'PYG' || (Number.isFinite(Number(exchangeRatePyg)) && Number(exchangeRatePyg) > 0)
    const costValid = (value) => (currency === 'PYG' ? Number.isSafeInteger(Number(value)) && Number(value) >= 0 : Number.isFinite(Number(value)) && Number(value) >= 0)
    const linesValid = lines.length && rateValid && lines.every(line => line.productId && Number.isSafeInteger(Number(line.quantity)) && Number(line.quantity) > 0 && costValid(line.unitCostPyg))
    const supplierValid = supplierId === 'new' ? Boolean(newSupplier.name.trim()) : suppliers.some(item => item.id === supplierId)
    if (!linesValid || !supplierValid) return setError(!rateValid ? 'Indicá la cotización PYG de la compra.' : 'Indicá proveedor y completá cada línea con producto, cantidad y costo.')
    setBusy(true)
    try {
      let finalSupplierId = supplierId
      let finalSupplierName = supplierId === 'new' ? newSupplier.name.trim() : suppliers.find(item => item.id === supplierId)?.name || ''
      if (supplierId === 'new' && !demo) {
        const created = await suppliersApi.create({ name: finalSupplierName, phone: componerTelefono({ countryCode: newSupplier.countryCode, phone: newSupplier.phone }) || undefined, city: newSupplier.city.trim() || undefined, department: newSupplier.department?.trim() || undefined, address: newSupplier.address.trim() || undefined })
        finalSupplierId = created.id; finalSupplierName = created.name
        setSuppliers(items => [...items, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      const payload = { supplierName: finalSupplierName, ...(finalSupplierId && finalSupplierId !== 'new' ? { supplierId: finalSupplierId } : {}), branchId: branchId || undefined, ...Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, toPyg(value)])), currency, exchangeRatePyg: currency === 'PYG' ? 1 : rate, creditEnabled, dueAt: dueAt || undefined, supplierReference: supplierReference || undefined, costAllocationMethod, lines: lines.map(line => ({ ...line, quantity: Number(line.quantity), unitCostPyg: toPyg(line.unitCostPyg) })) }
      if (demo) { const created = { ...payload, id: `demo-purchase-${Date.now()}`, status: 'DRAFT', createdAt: new Date().toISOString(), receivedAt: null, payments: [], lines: payload.lines.map((line, index) => ({ ...line, id: `demo-line-${Date.now()}-${index}`, productName: products.find((p) => p.id === line.productId)?.nombre, baseTotalPyg: line.quantity * line.unitCostPyg, finalTotalCostPyg: line.quantity * line.unitCostPyg })) }; createDemoPurchase(created); setPurchases(loadDemoPurchases()) }
      else { const created = await purchasesApi.create(payload); setPurchases(items => [created, ...items]); if (!suppliers.some(item => item.name === created.supplierName)) setSuppliers(items => [...items, { id: created.supplierId, name: created.supplierName }].sort((a, b) => a.name.localeCompare(b.name))) }
      setSupplierId(''); setNewSupplier({ name: '', countryCode: '+595', phone: '', city: '', department: '', address: '' }); setLines([emptyLine()]); setCosts({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' }); setCreditEnabled(false); setDueAt(''); setSupplierReference(''); setMessage('Compra creada con costo final distribuido por línea.')
    } catch (err) { setError(err?.message || 'No se pudo crear la compra.') } finally { setBusy(false) }
  }
  async function receive(purchase) { setBusy(true); setError(''); try { if (demo) { receiveDemoPurchase(purchase.id); setPurchases(loadDemoPurchases()) } else { await purchasesApi.receive(purchase.id); await load() }; setMessage('Compra recibida y stock actualizado.') } catch (err) { setError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) } }

  async function sugerirReposicion() {
    setError(''); setMessage('')
    if (demo) { setError('La sugerencia de reposición usa las alertas de stock reales.'); return }
    setBusy(true)
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      const payload = await api.get(`/api/stock-alerts${params.toString() ? `?${params}` : ''}`)
      const bajos = (payload?.alerts || []).filter((item) => Number(item.stock) < Number(item.reorderPoint))
      if (!bajos.length) { setMessage('No hay productos bajo su umbral de reposición.'); return }
      setLines(bajos.map((item) => ({ productId: item.id, sku: item.sku || '', nombre: item.name || '', quantity: String(Math.max(1, Number(item.reorderPoint) - Number(item.stock))), unitCostPyg: item.costPyg != null ? String(item.costPyg) : '0', lotReference: '' })))
      setMessage(`Se sugirieron ${bajos.length} productos bajo umbral. Elegí proveedor y confirmá cantidades.`)
    } catch (cause) { setError(cause?.message || 'No se pudo consultar el stock.') } finally { setBusy(false) }
  }

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
    // El teléfono se guarda como string único: al abrir se separa en código de
    // país y número para editarlos con PhoneField.
    const telefono = parseTelefono(supplier.phone)
    setEditingSupplier(supplier)
    setSupplierForm({ ...Object.fromEntries(SUPPLIER_FIELDS.map(([key]) => [key, supplier[key] || ''])), countryCode: telefono.countryCode, phone: telefono.phone })
  }
  async function saveSupplier(event) {
    event.preventDefault(); if (!editingSupplier || !supplierForm?.name.trim()) return
    setBusy(true); setError('')
    try {
      const { countryCode, phone, ...resto } = supplierForm
      await suppliersApi.update({ id: editingSupplier.id, ...resto, phone: componerTelefono({ countryCode, phone }) })
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

  const ordenarPor = (key) => setOrden(current => current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: ['fecha', 'vence', 'costo', 'saldo'].includes(key) ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )
  const valorOrden = (purchase, key) => {
    if (key === 'proveedor') return normalizarBusqueda(purchase.supplierName)
    if (key === 'vence') return purchase.dueAt ? new Date(purchase.dueAt).getTime() : 0
    if (key === 'costo') return Number(purchase.finalCostPyg || 0)
    if (key === 'saldo') return Number(purchase.outstandingPyg || 0)
    return new Date(purchase.createdAt || 0).getTime()
  }
  const ordenadas = useMemo(() => {
    const factor = orden.dir === 'asc' ? 1 : -1
    return [...purchases].sort((a, b) => {
      const va = valorOrden(a, orden.key); const vb = valorOrden(b, orden.key)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [purchases, orden])

  return <div className="space-y-4">
    <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="mb-1 font-bold">Compras e importaciones</h2><p className="mb-4 text-sm text-mute">Anticipos, crédito y costos finales auditables por equipo o lote.</p></div><Button type="button" variant="outline" onClick={() => setSuppliersOpen(true)}>Proveedores</Button></div>
      <form onSubmit={create} className="space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Select aria-label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Elegí un proveedor</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">＋ Nuevo proveedor</option></Select><div><Select aria-label="Sucursal de recepción" value={branchId} onChange={(e) => { branchTouched.current = true; setBranchId(e.target.value) }}>{branchOptions.length === 0 ? <option value="">Sin sucursal definida</option> : <><option value="">Sin sucursal (general)</option>{branchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.nombre || branch.name}</option>)}</>}</Select><p className="mt-1 px-1 text-xs text-mute">Es tu sucursal donde entra el stock, no la del proveedor.</p></div></div>
        {supplierId === 'new' && <div className="grid gap-2 sm:grid-cols-2"><Input required value={newSupplier.name} onChange={(e) => setNewSupplier(s => ({ ...s, name: e.target.value }))} placeholder="Nombre del proveedor" /><PhoneField countryCode={newSupplier.countryCode || '+595'} phone={newSupplier.phone || ''} onCountryCodeChange={(countryCode) => setNewSupplier(s => ({ ...s, countryCode }))} onChange={(phone) => setNewSupplier(s => ({ ...s, phone }))} placeholder="Teléfono (opcional)" /><div className="space-y-1"><CityAutocomplete value={newSupplier.city} onSelect={(city, department) => setNewSupplier(s => ({ ...s, city, department }))} placeholder="Ciudad (opcional)" />{newSupplier.department && <p className="px-1 text-xs text-fono-light">Departamento: {newSupplier.department}</p>}</div><Input value={newSupplier.address} onChange={(e) => setNewSupplier(s => ({ ...s, address: e.target.value }))} placeholder="Dirección (opcional)" /></div>}
        <div className="space-y-2">{lines.map((line, index) => <ProductLine key={index} products={products} line={line} currency={currency} onChange={(value) => updateLine(index, value)} onSelectProduct={(product) => chooseProduct(index, product)} onCreateProduct={createProduct} canRemove={lines.length > 1} onRemove={() => setLines(items => items.filter((_, itemIndex) => itemIndex !== index))} />)}<Button type="button" variant="outline" onClick={() => setLines(items => [...items, emptyLine()])}>+ Agregar línea / lote</Button>{!demo && <Button type="button" variant="outline" disabled={busy} onClick={sugerirReposicion}>Sugerir reposición</Button>}</div>
        <details className="rounded-xl border border-ink-600/70 p-3"><summary className="cursor-pointer select-none text-sm font-semibold text-fore">Costos de importación (flete, aduana, seguro…) <span className="ml-1 text-xs font-normal text-mute">· {gs(costsTotalPyg)}</span></summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{COST_FIELDS.map(([key, label]) => <MoneyInput key={key} currency={currency} value={costs[key]} onValueChange={(value) => setCosts(current => ({ ...current, [key]: value }))} placeholder={label} />)}</div></details>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><Select value={costAllocationMethod} onChange={(e) => setCostAllocationMethod(e.target.value)}><option value="PROPORTIONAL_VALUE">Distribuir por valor</option><option value="PROPORTIONAL_QUANTITY">Distribuir por cantidad</option></Select><CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />{currency !== 'PYG' && <MoneyInput currency="USD" symbol="Gs." value={exchangeRatePyg} onValueChange={setExchangeRatePyg} placeholder="Cotización PYG" />}</div>
        <div className="grid gap-2 rounded-xl border border-ink-600/70 p-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.target.checked)} /> Compra a crédito</label><Input type="date" disabled={!creditEnabled} value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Vencimiento de crédito" /><Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Referencia proveedor" /></div>
        <div className="flex items-center justify-between text-sm text-mute"><span>Total final estimado: <strong className="text-ink-800">{gs(estimatedTotal)}</strong></span><Button type="submit" disabled={busy}>Crear pedido</Button></div>
      </form>{error && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}{message && <p className="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}
    </Card>
    <div className="space-y-3">
      {busy && purchases.length === 0 && <div className="space-y-2" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {!busy && purchases.length === 0 && <EmptyState icon="box" title="Sin compras registradas." description="Creá la primera orden de compra o importación." />}
      {purchases.length > 0 && <div className="overflow-x-auto" data-testid="compras-tabla">
        <div className={cn(GRID_COMPRAS, 'px-3.5 pb-2 pt-1')}>
          {encabezado('proveedor', 'Proveedor')}
          <span className={CELDA}>Estado</span>
          <span className={CELDA}>Líneas</span>
          {encabezado('fecha', 'Fecha')}
          {encabezado('vence', 'Vence')}
          {encabezado('costo', 'Costo final', 'justify-end')}
          {encabezado('saldo', 'Saldo', 'justify-end')}
          <span className={cn(CELDA, 'text-right')}>Acciones</span>
        </div>
        <div className="space-y-1">
          {ordenadas.map(purchase => {
            const abierta = expandida === purchase.id
            const saldo = Number(purchase.outstandingPyg || 0)
            const lineas = purchase.lines || []
            const vencimiento = vencimientoCompra(purchase)
            return <div key={purchase.id}>
              <div
                role="button"
                tabIndex={0}
                data-testid="compra-fila"
                onClick={() => setExpandida(abierta ? null : purchase.id)}
                onKeyDown={event => { if (event.key === 'Enter') setExpandida(abierta ? null : purchase.id) }}
                className={cn(GRID_COMPRAS, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40', abierta && 'border-fono/40')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name={abierta ? 'chevron' : 'chevron'} className={cn('h-3.5 w-3.5 shrink-0 text-mute transition', abierta ? 'rotate-180' : '-rotate-90')} />
                  <b className="truncate text-sm" title={purchase.supplierName}>{purchase.supplierName}</b>
                </span>
                <Badge color={purchase.status === 'RECEIVED' ? 'green' : 'orange'} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}</Badge>
                <span className="truncate text-xs tabular-nums text-mute">{lineas.length}</span>
                <span className="truncate text-xs text-mute">{fechaCompra(purchase.createdAt)}</span>
                <span className={cn('truncate text-xs', vencimiento.urgente ? 'font-semibold text-warn' : 'text-mute')} title={vencimiento.titulo}>{vencimiento.texto}</span>
                <span className="truncate text-right text-sm font-semibold tabular-nums text-fore">{gs(purchase.finalCostPyg ?? 0)}</span>
                <span className={cn('truncate text-right text-sm font-semibold tabular-nums', saldo > 0 ? 'text-warn' : 'text-ok')}>{gs(saldo)}</span>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  {purchase.status === 'DRAFT' && <Button variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={event => { event.stopPropagation(); receive(purchase) }}>Recibir</Button>}
                  {!demo && saldo > 0 && <Button className="h-8 px-2 text-xs" disabled={busy || !accounts.length} onClick={event => { event.stopPropagation(); openPayment(purchase) }}>Pagar</Button>}
                </span>
              </div>
              {abierta && <div className="mt-1 space-y-2 rounded-xl border border-ink-600 bg-ink-800/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {purchase.creditEnabled && <Badge color="orange">Crédito</Badge>}
                  {purchase.supplierReference && <span className="text-[11px] text-mute">Ref. {purchase.supplierReference}</span>}
                  <span className="text-[11px] text-mute">Pagado {gs(purchase.paidPyg ?? 0)}</span>
                </div>
                {purchase.status === 'DRAFT'
                  ? <div className="space-y-1">{lineas.map(item => <div key={item.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><MoneyInput aria-label={`Costo unitario de ${item.productName || item.productId}`} value={lineCostValue(purchase, item)} onValueChange={(value) => setLineCost(purchase.id, item.id, value)} className="w-36 shrink-0" placeholder="Costo ₲" /></div>)}</div>
                  : <div className="space-y-1 text-sm">{lineas.map(item => <div key={item.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><span className="shrink-0 tabular-nums">{gs(item.finalTotalCostPyg ?? Number(item.quantity) * Number(item.unitCostPyg))}</span></div>)}</div>}
                {costChanges(purchase).length > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => saveCosts(purchase)}>Guardar costos</Button>}
              </div>}
            </div>
          })}
        </div>
      </div>}
    </div>
    <Modal open={suppliersOpen} onClose={() => { setSuppliersOpen(false); setEditingSupplier(null); setSupplierForm(null) }} title="Proveedores">
      {editingSupplier && supplierForm && <form onSubmit={saveSupplier} className="mb-4 space-y-3 rounded-xl border border-ink-600 p-3"><p className="text-sm font-semibold">Editar proveedor</p><div className="grid gap-2 sm:grid-cols-2">{SUPPLIER_FIELDS.map(([key, label]) => key === 'city' ? <div key={key}><Label>{label}</Label><CityAutocomplete value={supplierForm[key]} onSelect={(city, department) => setSupplierForm(current => ({ ...current, city, department }))} /></div> : key === 'phone' ? <div key={key}><Label>{label}</Label><PhoneField disabled={busy} countryCode={supplierForm.countryCode || '+595'} phone={supplierForm.phone || ''} onCountryCodeChange={(countryCode) => setSupplierForm(current => ({ ...current, countryCode }))} onChange={(phone) => setSupplierForm(current => ({ ...current, phone }))} /></div> : key === 'email' ? <div key={key}><Label>{label}</Label><EmailField disabled={busy} value={supplierForm.email || ''} onChange={(email) => setSupplierForm(current => ({ ...current, email }))} /></div> : <div key={key}><Label>{label}</Label><Input required={key === 'name'} value={supplierForm[key]} onChange={(e) => setSupplierForm(current => ({ ...current, [key]: e.target.value }))} /></div>)}</div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Guardar proveedor</Button><Button type="button" variant="ghost" onClick={() => { setEditingSupplier(null); setSupplierForm(null) }}>Cancelar</Button></div></form>}
      {suppliers.length === 0 ? <EmptyState compact icon="users" title="Sin proveedores registrados." /> : <div className="space-y-2">{suppliers.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-600 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}{item.code ? <span className="ml-2 rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fono-light">{item.code}</span> : null}</p><p className="truncate text-xs text-mute">{[item.city, item.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p></div><Button type="button" variant="outline" onClick={() => openSupplierEdit(item)}>Editar</Button></div>)}</div>}
    </Modal>
    <Modal open={paymentPurchase !== null} onClose={() => setPaymentPurchase(null)} title="Registrar pago a proveedor"><form onSubmit={paySupplier} className="space-y-3"><p className="text-sm text-mute">{paymentPurchase?.supplierName} · saldo actual {gs(paymentPurchase?.outstandingPyg || 0)}. La cotización queda congelada en este pago.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant={payment.action === 'advance' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'advance' }))}>Registrar anticipo</Button><Button type="button" variant={payment.action === 'pay' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'pay' }))}>Registrar pago</Button></div>{supplierBalance && <div className="rounded-xl border border-ink-600 p-3 text-sm"><p className="font-semibold">{supplierBalance.supplier?.name || paymentPurchase?.supplierName}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs text-mute"><span>Comprado<strong className="mt-0.5 block text-fore">{gs(supplierBalance.totalPurchasedPyg)}</strong></span><span>Pagado<strong className="mt-0.5 block text-ok">{gs(supplierBalance.paidPyg)}</strong></span><span>Pendiente<strong className="mt-0.5 block text-warn">{gs(supplierBalance.outstandingPyg)}</strong></span></div></div>}<div><Label>Cuenta de salida</Label><Select required value={payment.accountId} onChange={(event) => { const account = accounts.find(item => item.id === event.target.value); setPayment(data => ({ ...data, accountId: event.target.value, currency: account?.currency || 'PYG', exchangeRatePyg: account?.currency === 'PYG' ? '1' : '' })) }}><option value="">Elegí una cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Monto en {payment.currency}</Label><MoneyInput required currency={payment.currency} value={payment.originalAmount} onValueChange={(value) => setPayment(data => ({ ...data, originalAmount: value }))} placeholder="0" /></div><div><Label>Cotización en Gs.</Label><MoneyInput required disabled={payment.currency === 'PYG'} currency="USD" symbol="Gs." value={payment.exchangeRatePyg} onValueChange={(value) => setPayment(data => ({ ...data, exchangeRatePyg: value }))} placeholder={payment.currency === 'PYG' ? '1' : 'Ej. 7500'} /></div></div><div><Label>Referencia <span className="text-mute">(opcional)</span></Label><Input maxLength={200} value={payment.reference} onChange={(event) => setPayment(data => ({ ...data, reference: event.target.value }))} placeholder="Transferencia, recibo o comprobante" /></div><Button className="w-full" type="submit" disabled={busy || !payment.accountId || !Number(payment.originalAmount) || !Number(payment.exchangeRatePyg)}>{payment.action === 'advance' ? 'Guardar anticipo' : 'Guardar pago'}</Button></form></Modal>
  </div>
}
