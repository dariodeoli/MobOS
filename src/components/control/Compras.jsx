import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { addProducto, addProductoApi, getProductos } from '@/lib/storage'
import { isDemoRuntime } from '@/lib/demoMode'
import { api } from '@/lib/api/client'
import { purchasesApi } from '@/lib/api/purchases'
import { suppliersApi } from '@/lib/api/suppliers'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { loadDemoPurchases, createDemoPurchase, receiveDemoPurchase, updateDemoPurchaseCosts } from '@/lib/demoPurchases'
import { gs } from '@/utils/calculos'
import { Aviso, Badge, Button, Card, EmptyState, IconAction, Input, Label, Modal, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import SearchField from '@/components/shared/SearchField'
import PhoneField, { parseTelefono, componerTelefono } from '@/components/shared/PhoneField'
import EmailField from '@/components/shared/EmailField'
import RucField from '@/components/shared/RucField'
import Icon from '@/components/shared/Icon'
import { descargarCsv } from '@/utils/descargarCsv'
import ProductCombobox from '@/components/shared/ProductCombobox'
import CurrencySelect from '@/components/shared/CurrencySelect'
import AutorizacionBloque from '@/components/ventas/venta/AutorizacionBloque'
import { cn } from '@/lib/utils'
import { normalizarBusqueda } from '@/utils/cliente'

// Tabla compacta: una fila por compra y el detalle de líneas se despliega en
// la misma fila, donde viven los costos editables del borrador.
const GRID_PROVEEDORES = 'grid min-w-[30rem] grid-cols-[minmax(7rem,1.6fr)_5rem_minmax(5rem,1fr)_7.5rem_4.5rem] items-center gap-x-2'
const GRID_COMPRAS = 'grid min-w-[53.5rem] grid-cols-[minmax(8rem,1.4fr)_5rem_3rem_5rem_5rem_6.5rem_6.5rem_8.5rem] items-center gap-x-2'
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
// Estado visible de la orden: el backend solo completa `receivedAt` cuando la
// recepción termina; mientras falte mercadería la orden queda en PARTIAL.
const ESTADOS_COMPRA = {
  DRAFT: { texto: 'Borrador', color: 'orange' },
  PARTIAL: { texto: 'Parcial', color: 'blue' },
  RECEIVED: { texto: 'Recibida', color: 'green' },
}
const estadoCompra = (purchase) => ESTADOS_COMPRA[purchase.status] || ESTADOS_COMPRA.DRAFT
const fechaRecepcion = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
}
// `receivedQty` llega por línea desde la API; los datos demo viejos no lo traen
// y una compra recibida equivale a todas sus unidades.
const recibidoDeLinea = (purchase, item) => Number.isFinite(Number(item?.receivedQty)) ? Number(item.receivedQty) : (purchase.status === 'RECEIVED' ? Number(item?.quantity || 0) : 0)
const pendienteDeLinea = (purchase, item) => Math.max(0, Number(item?.quantity || 0) - recibidoDeLinea(purchase, item))
const devueltoDeLinea = (devoluciones, purchase, item) => Number(devoluciones[`${purchase.id}:${item.id}`] || 0)
const devolvibleDeLinea = (devoluciones, purchase, item) => Math.max(0, recibidoDeLinea(purchase, item) - devueltoDeLinea(devoluciones, purchase, item))
import Cronologia from '@/components/shared/Cronologia'
import AttachmentList from '@/components/shared/AttachmentList'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS, GRILLA_DOS_COLUMNAS_COMPACTA, PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'
const emptyLine = () => ({ productId: '', quantity: '1', unitCostPyg: '0', lotReference: '' })
const DEFAULT_PURCHASE_CREDIT_LIMIT_PYG = 5000000
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
  const { sucursal, sucursales, sesion, empresa } = useSesion()
  // La búsqueda global abre Compras con ?q= (proveedor, referencia o número).
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') || ''
  const [query, setQuery] = useState(qParam)
  const busqueda = useBusquedaDiferida(query)
  const branchTouched = useRef(false)
  const branchOptions = sucursales.length > 0 ? sucursales : (sucursal ? [sucursal] : [])
  const [purchases, setPurchases] = useState(demo ? loadDemoPurchases() : [])
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState({ name: '', countryCode: '+595', phone: '', city: '', department: '', address: '' })
  const [suppliersOpen, setSuppliersOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState(null)
  const [historySupplier, setHistorySupplier] = useState(null)
  const [branchId, setBranchId] = useState(''); const [lines, setLines] = useState([emptyLine()])
  const [costs, setCosts] = useState({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' })
  const [currency, setCurrency] = useState('PYG'); const [exchangeRatePyg, setExchangeRatePyg] = useState('1')
  const [creditEnabled, setCreditEnabled] = useState(false); const [dueAt, setDueAt] = useState(''); const [supplierReference, setSupplierReference] = useState('')
  const [costAllocationMethod, setCostAllocationMethod] = useState('PROPORTIONAL_VALUE')
  const [accounts, setAccounts] = useState([]); const [paymentPurchase, setPaymentPurchase] = useState(null)
  const [pagoRegistrado, setPagoRegistrado] = useState(null)
  const [adjuntosDe, setAdjuntosDe] = useState(null)
  const [historialDe, setHistorialDe] = useState(null)
  const [payment, setPayment] = useState({ accountId: '', currency: 'PYG', originalAmount: '', exchangeRatePyg: '1', reference: '', action: 'pay' })
  const [supplierBalance, setSupplierBalance] = useState(null)
  const [lineCostEdits, setLineCostEdits] = useState({})
  const [expandida, setExpandida] = useState(null)
  const [recepcionDe, setRecepcionDe] = useState(null)
  const [recepcionCantidades, setRecepcionCantidades] = useState({})
  const [devolucionDe, setDevolucionDe] = useState(null)
  const [devolucionCantidades, setDevolucionCantidades] = useState({})
  const [devolucionMotivo, setDevolucionMotivo] = useState('')
  const [devolucionPaso, setDevolucionPaso] = useState('datos')
  // Devoluciones hechas en esta sesión: la API no expone lo ya devuelto por
  // línea, así que se descuentan localmente y el backend valida igual.
  const [devolucionesLocales, setDevolucionesLocales] = useState({})
  const [accionError, setAccionError] = useState('')
  const [compraAuth, setCompraAuth] = useState(null)
  const [orden, setOrden] = useState({ key: 'fecha', dir: 'desc' })
  const [busy, setBusy] = useState(!demo); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [exportando, setExportando] = useState(false)

  const filtroRef = useRef('')
  filtroRef.current = busqueda.trim()
  const load = useCallback(async (search = filtroRef.current) => {
    setBusy(true); setError('')
    try { const [purchaseRows, supplierRows, accountRows] = await Promise.all([demo ? Promise.resolve(loadDemoPurchases()) : purchasesApi.list(search), demo ? Promise.resolve([]) : suppliersApi.list(), getPaymentAccounts()]); setPurchases(purchaseRows); setSuppliers(supplierRows); setAccounts(accountRows.filter(account => account.isActive)) }
    catch (err) { setError(err?.message || 'No se pudieron cargar las compras.') } finally { setBusy(false) }
  }, [demo])
  useEffect(() => { load(busqueda.trim()) }, [load, busqueda])
  useEffect(() => { if (qParam) setQuery(qParam) }, [qParam])
  const estimatedTotal = useMemo(() => {
    const total = totalOf(lines, costs)
    return currency === 'PYG' ? total : Math.round(total * (Number(exchangeRatePyg) || 1))
  }, [lines, costs, currency, exchangeRatePyg])
  // Compra a crédito por encima del umbral: solo el dueño (ADMIN) no necesita
  // autorización; gerencia y el resto sí.
  const esAdmin = sesion?.rol === 'dueno'
  const limiteCredito = Number(empresa?.purchaseCreditLimitPyg ?? DEFAULT_PURCHASE_CREDIT_LIMIT_PYG)
  const proveedorSeleccionado = supplierId && supplierId !== 'new' ? suppliers.find(item => item.id === supplierId) || null : null
  const proveedorAuth = supplierId === 'new'
    ? { supplierName: newSupplier.name.trim() }
    : proveedorSeleccionado ? { supplierId: proveedorSeleccionado.id, supplierName: proveedorSeleccionado.name } : null
  const requiereCompraAuth = Boolean(creditEnabled && !esAdmin && estimatedTotal > limiteCredito && proveedorAuth?.supplierName)
  useEffect(() => { if (!requiereCompraAuth) setCompraAuth(null) }, [requiereCompraAuth])
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
    if (requiereCompraAuth && !compraAuth) return setError('La compra a crédito supera el límite sin autorización. Solicitá autorización a gerencia y esperá la aprobación.')
    setBusy(true)
    try {
      let finalSupplierId = supplierId
      let finalSupplierName = supplierId === 'new' ? newSupplier.name.trim() : suppliers.find(item => item.id === supplierId)?.name || ''
      if (supplierId === 'new' && !demo) {
        const created = await suppliersApi.create({ name: finalSupplierName, phone: componerTelefono({ countryCode: newSupplier.countryCode, phone: newSupplier.phone }) || undefined, city: newSupplier.city.trim() || undefined, department: newSupplier.department?.trim() || undefined, address: newSupplier.address.trim() || undefined })
        finalSupplierId = created.id; finalSupplierName = created.name
        setSuppliers(items => [...items, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      const payload = { supplierName: finalSupplierName, ...(finalSupplierId && finalSupplierId !== 'new' ? { supplierId: finalSupplierId } : {}), ...(requiereCompraAuth && compraAuth ? { purchaseAuthorizationId: compraAuth.id } : {}), branchId: branchId || undefined, ...Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, toPyg(value)])), currency, exchangeRatePyg: currency === 'PYG' ? 1 : rate, creditEnabled, dueAt: dueAt || undefined, supplierReference: supplierReference || undefined, costAllocationMethod, lines: lines.map(line => ({ ...line, quantity: Number(line.quantity), unitCostPyg: toPyg(line.unitCostPyg) })) }
      if (demo) { const created = { ...payload, id: `demo-purchase-${Date.now()}`, status: 'DRAFT', createdAt: new Date().toISOString(), receivedAt: null, payments: [], lines: payload.lines.map((line, index) => ({ ...line, id: `demo-line-${Date.now()}-${index}`, productName: products.find((p) => p.id === line.productId)?.nombre, baseTotalPyg: line.quantity * line.unitCostPyg, finalTotalCostPyg: line.quantity * line.unitCostPyg })) }; createDemoPurchase(created); setPurchases(loadDemoPurchases()) }
      else { const created = await purchasesApi.create(payload); setPurchases(items => [created, ...items]); if (!suppliers.some(item => item.name === created.supplierName)) setSuppliers(items => [...items, { id: created.supplierId, name: created.supplierName }].sort((a, b) => a.name.localeCompare(b.name))) }
      setSupplierId(''); setNewSupplier({ name: '', countryCode: '+595', phone: '', city: '', department: '', address: '' }); setLines([emptyLine()]); setCosts({ shippingPyg: '0', customsPyg: '0', insurancePyg: '0', taxesPyg: '0', otherCostsPyg: '0' }); setCreditEnabled(false); setCompraAuth(null); setDueAt(''); setSupplierReference(''); setMessage('Compra creada con costo final distribuido por línea.')
    } catch (err) { setError(err?.message || 'No se pudo crear la compra.') } finally { setBusy(false) }
  }
  const lineasDevolucion = useMemo(() => {
    if (!devolucionDe) return []
    return (devolucionDe.lines || []).map(item => {
      const maximo = devolvibleDeLinea(devolucionesLocales, devolucionDe, item)
      const crudo = devolucionCantidades[item.id]
      const cantidad = crudo === '' || crudo === undefined ? 0 : Number(crudo)
      return { item, maximo, cantidad, totalPyg: cantidad * Number(item.finalUnitCostPyg ?? item.unitCostPyg ?? 0) }
    }).filter(line => line.maximo > 0 || line.cantidad > 0)
  }, [devolucionDe, devolucionCantidades, devolucionesLocales])
  const totalDevolucionPyg = lineasDevolucion.reduce((sum, line) => sum + line.totalPyg, 0)
  function abrirRecepcion(purchase) {
    setError(''); setMessage(''); setAccionError('')
    setRecepcionDe(purchase)
    setRecepcionCantidades(Object.fromEntries((purchase.lines || []).map(item => [item.id, String(pendienteDeLinea(purchase, item))])))
  }
  async function recibirTodo(purchase) {
    setBusy(true); setError(''); setAccionError('')
    try {
      if (demo) { receiveDemoPurchase(purchase.id); setPurchases(loadDemoPurchases()) }
      else { await purchasesApi.receive(purchase.id); await load() }
      setMessage('Compra recibida y stock actualizado.')
      setRecepcionDe(null)
    } catch (err) { setAccionError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) }
  }
  async function confirmarRecepcion(event) {
    event.preventDefault(); if (!recepcionDe) return
    const lineas = (recepcionDe.lines || []).map(item => {
      const pendiente = pendienteDeLinea(recepcionDe, item)
      const crudo = recepcionCantidades[item.id]
      return { item, pendiente, cantidad: crudo === '' || crudo === undefined ? 0 : Number(crudo) }
    }).filter(line => line.pendiente > 0)
    if (lineas.some(line => !Number.isSafeInteger(line.cantidad) || line.cantidad < 0 || line.cantidad > line.pendiente)) return setAccionError('Revisá las cantidades: tienen que ser enteros y no superar lo pendiente.')
    const elegidas = lineas.filter(line => line.cantidad > 0)
    if (!elegidas.length) return setAccionError('Elegí al menos una cantidad pendiente para recibir.')
    setBusy(true); setAccionError('')
    try {
      const result = await purchasesApi.receive(recepcionDe.id, elegidas.map(line => ({ id: line.item.id, quantity: line.cantidad })))
      await load()
      setRecepcionDe(null)
      toast.success('Recepción registrada.', result?.status === 'RECEIVED' ? 'La compra quedó recibida por completo.' : 'Quedó parcial: el resto sigue pendiente.')
    } catch (err) { setAccionError(err?.message || 'No se pudo recibir la compra.') } finally { setBusy(false) }
  }
  function abrirDevolucion(purchase) {
    setError(''); setMessage(''); setAccionError('')
    if (demo) { toast.info('Devolución al proveedor', 'Requiere conexión con el servidor: la demo no registra devoluciones ni movimientos de stock.'); return }
    setDevolucionDe(purchase)
    setDevolucionCantidades(Object.fromEntries((purchase.lines || []).map(item => [item.id, ''])))
    setDevolucionMotivo('')
    setDevolucionPaso('datos')
  }
  function revisarDevolucion(event) {
    event.preventDefault(); if (!devolucionDe) return
    if (!devolucionMotivo.trim()) return setAccionError('Indicá el motivo de la devolución al proveedor.')
    if (lineasDevolucion.some(line => !Number.isSafeInteger(line.cantidad) || line.cantidad < 0 || line.cantidad > line.maximo)) return setAccionError('Revisá las cantidades: no pueden superar lo devolvible por línea.')
    if (!lineasDevolucion.some(line => line.cantidad > 0)) return setAccionError('Elegí al menos una cantidad para devolver.')
    setAccionError(''); setDevolucionPaso('confirmar')
  }
  async function registrarDevolucion() {
    if (!devolucionDe) return
    const elegidas = lineasDevolucion.filter(line => line.cantidad > 0)
    setBusy(true); setAccionError('')
    try {
      await purchasesApi.returnPurchase(devolucionDe.id, { reason: devolucionMotivo.trim(), lines: elegidas.map(line => ({ id: line.item.id, quantity: line.cantidad })) })
      setDevolucionesLocales(prev => {
        const next = { ...prev }
        for (const line of elegidas) { const key = `${devolucionDe.id}:${line.item.id}`; next[key] = (Number(next[key]) || 0) + line.cantidad }
        return next
      })
      await load()
      if (devolucionDe.supplierId) { try { setSupplierBalance(await suppliersApi.balance(devolucionDe.supplierId)) } catch { setSupplierBalance(null) } }
      const unidades = elegidas.reduce((sum, line) => sum + line.cantidad, 0)
      toast.success('Devolución registrada.', `${unidades} unidad${unidades === 1 ? '' : 'es'} menos de stock por ${gs(totalDevolucionPyg)}.`)
      setDevolucionDe(null); setDevolucionPaso('datos')
    } catch (err) { setAccionError(err?.message || 'No se pudo registrar la devolución.'); setDevolucionPaso('datos') } finally { setBusy(false) }
  }

  async function exportar() {
    if (demo) return
    setExportando(true); setError('')
    try { await descargarCsv('purchases', {}, 'mobos-compras.csv') } catch (cause) { setError(cause?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) }
  }

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
      setLines(bajos.map((item) => ({ productId: item.id, sku: item.sku || '', nombre: item.name || '', quantity: String(Math.max(1, Number(item.reorderPoint) - Number(item.stock))), unitCostPyg: '0', lotReference: '' })))
      setMessage(`Se sugirieron ${bajos.length} productos bajo umbral. Elegí proveedor y confirmá cantidades.`)
    } catch (cause) { setError(cause?.message || 'No se pudo consultar el stock.') } finally { setBusy(false) }
  }

  async function openPayment(purchase) {
    setError(''); setPaymentPurchase(purchase); setPagoRegistrado(null)
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
      const result = payment.action === 'advance' ? await purchasesApi.advance(paymentPurchase.id, payload) : await purchasesApi.pay(paymentPurchase.id, payload)
      await load(); setPagoRegistrado(result?.payment || null); setMessage('Pago a proveedor registrado y saldo actualizado.')
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
  // La demo no consulta el servidor: el filtro del header se aplica en memoria.
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!demo || !q) return ordenadas
    return ordenadas.filter(purchase => `${purchase.supplierName} ${purchase.supplierReference || ''} ${purchase.id}`.toLowerCase().includes(q))
  }, [ordenadas, busqueda, demo])

  return <div className="space-y-4">
    <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-4 text-sm text-mute">Anticipos, crédito y costos finales auditables por equipo o lote.</p></div><div className="flex flex-wrap gap-2">{!demo && <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={exportando} onClick={exportar}><Icon name="download" className="h-4 w-4" />Exportar CSV</Button>}<Button type="button" variant="outline" onClick={() => setSuppliersOpen(true)}>Proveedores</Button></div></div>
      <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proveedor, referencia o número…" ariaLabel="Buscar compras" className="mb-4 max-w-md" />
      <form onSubmit={create} className="space-y-3"><div className={GRILLA_DOS_COLUMNAS_COMPACTA}><Select aria-label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Elegí un proveedor</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">＋ Nuevo proveedor</option></Select><div><Select aria-label="Sucursal de recepción" value={branchId} onChange={(e) => { branchTouched.current = true; setBranchId(e.target.value) }}>{branchOptions.length === 0 ? <option value="">Sin sucursal definida</option> : <><option value="">Sin sucursal (general)</option>{branchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.nombre || branch.name}</option>)}</>}</Select><p className="mt-1 px-1 text-xs text-mute">Es tu sucursal donde entra el stock, no la del proveedor.</p></div></div>
        {supplierId === 'new' && <div className={GRILLA_DOS_COLUMNAS_COMPACTA}><Input required value={newSupplier.name} onChange={(e) => setNewSupplier(s => ({ ...s, name: e.target.value }))} placeholder="Nombre del proveedor" /><PhoneField countryCode={newSupplier.countryCode || '+595'} phone={newSupplier.phone || ''} onCountryCodeChange={(countryCode) => setNewSupplier(s => ({ ...s, countryCode }))} onChange={(phone) => setNewSupplier(s => ({ ...s, phone }))} placeholder="Teléfono (opcional)" /><div className="space-y-1"><CityAutocomplete value={newSupplier.city} onSelect={(city, department) => setNewSupplier(s => ({ ...s, city, department }))} placeholder="Ciudad (opcional)" />{newSupplier.department && <p className="px-1 text-xs text-fono-light">Departamento: {newSupplier.department}</p>}</div><Input value={newSupplier.address} onChange={(e) => setNewSupplier(s => ({ ...s, address: e.target.value }))} placeholder="Dirección (opcional)" /></div>}
        <div className="space-y-2">{lines.map((line, index) => <ProductLine key={index} products={products} line={line} currency={currency} onChange={(value) => updateLine(index, value)} onSelectProduct={(product) => chooseProduct(index, product)} onCreateProduct={createProduct} canRemove={lines.length > 1} onRemove={() => setLines(items => items.filter((_, itemIndex) => itemIndex !== index))} />)}<Button type="button" variant="outline" onClick={() => setLines(items => [...items, emptyLine()])}>+ Agregar línea / lote</Button>{!demo && <Button type="button" variant="outline" disabled={busy} onClick={sugerirReposicion}>Sugerir reposición</Button>}</div>
        <details className="rounded-xl border border-ink-600/70 p-3"><summary className="cursor-pointer select-none text-sm font-semibold text-fore">Costos de importación (flete, aduana, seguro…) <span className="ml-1 text-xs font-normal text-mute">· {gs(costsTotalPyg)}</span></summary><div className={cn('mt-3 lg:grid-cols-3', GRILLA_DOS_COLUMNAS_COMPACTA)}>{COST_FIELDS.map(([key, label]) => <MoneyInput key={key} currency={currency} value={costs[key]} onValueChange={(value) => setCosts(current => ({ ...current, [key]: value }))} placeholder={label} />)}</div></details>
        <div className={cn('lg:grid-cols-3', GRILLA_DOS_COLUMNAS_COMPACTA)}><Select value={costAllocationMethod} onChange={(e) => setCostAllocationMethod(e.target.value)}><option value="PROPORTIONAL_VALUE">Distribuir por valor</option><option value="PROPORTIONAL_QUANTITY">Distribuir por cantidad</option></Select><CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />{currency !== 'PYG' && <MoneyInput currency="USD" symbol="Gs." value={exchangeRatePyg} onValueChange={setExchangeRatePyg} placeholder="Cotización PYG" />}</div>
        <div className="grid gap-2 rounded-xl border border-ink-600/70 p-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.target.checked)} /> Compra a crédito</label><Input type="date" disabled={!creditEnabled} value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Vencimiento de crédito" /><Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Referencia proveedor" /></div>
        {!demo && requiereCompraAuth && (
          <AutorizacionBloque
            kind="PURCHASE_CREDIT"
            entity="PURCHASE"
            entityId={proveedorAuth?.supplierId ?? null}
            titulo="Compra a crédito por encima del límite"
            descripcion={`El total supera el límite sin autorización (${gs(limiteCredito)}). Pedí autorización a gerencia y confirmá la compra con la aprobación.`}
            requestedValue={{ ...(proveedorAuth?.supplierId ? { supplierId: proveedorAuth.supplierId } : {}), supplierName: proveedorAuth?.supplierName, totalPyg: estimatedTotal }}
            monto={estimatedTotal}
            campoMax="maxTotalPyg"
            onSelect={setCompraAuth}
            bloqueado={busy}
          />
        )}
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-mute shadow-lg shadow-black/10"><span>Total final estimado: <strong className="text-fore">{gs(estimatedTotal)}</strong></span><Button type="submit" disabled={busy}>Crear pedido</Button></div>
      </form>{error && <Aviso tono="error" className="mt-3">{error}</Aviso>}{message && <Aviso tono="ok" className="mt-3">{message}</Aviso>}
    </Card>
    <div className="space-y-3">
      {busy && purchases.length === 0 && <div className="space-y-2" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {!busy && purchases.length === 0 && <EmptyState icon="box" title="Sin compras registradas." description="Creá la primera orden de compra o importación." />}
      {!busy && purchases.length > 0 && filtradas.length === 0 && <EmptyState compact icon="search" title="Ninguna compra coincide con la búsqueda." />}
      {filtradas.length > 0 && <div className="overflow-x-auto" data-testid="compras-tabla">
        <div className={cn(GRID_COMPRAS, 'px-3.5 pb-2 pt-1')}>
          {encabezado('proveedor', 'Proveedor')}
          <span className={CELDA_ENCABEZADO}>Estado</span>
          <span className={CELDA_ENCABEZADO}>Líneas</span>
          {encabezado('fecha', 'Fecha')}
          {encabezado('vence', 'Vence')}
          {encabezado('costo', 'Costo final', 'justify-end')}
          {encabezado('saldo', 'Saldo', 'justify-end')}
          <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
        </div>
        <div className="space-y-1">
          {filtradas.map(purchase => {
            const abierta = expandida === purchase.id
            const saldo = Number(purchase.outstandingPyg || 0)
            const lineas = purchase.lines || []
            const vencimiento = vencimientoCompra(purchase)
            const estado = estadoCompra(purchase)
            const pendientes = lineas.reduce((sum, item) => sum + pendienteDeLinea(purchase, item), 0)
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
                <Badge color={estado.color} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{estado.texto}</Badge>
                <span className="truncate text-xs tabular-nums text-mute">{lineas.length}</span>
                <span className={CELDA_DATO}>{fechaCompra(purchase.createdAt)}</span>
                <span className={cn('truncate text-xs', vencimiento.urgente ? 'font-semibold text-warn' : 'text-mute')} title={vencimiento.titulo}>{vencimiento.texto}</span>
                <span className="truncate text-right text-sm font-semibold tabular-nums text-fore">{gs(purchase.finalCostPyg ?? 0)}</span>
                <span className={cn('truncate text-right text-sm font-semibold tabular-nums', saldo > 0 ? 'text-warn' : 'text-ok')}>{gs(saldo)}</span>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  {!demo && <IconAction icon="receipt" label="Adjuntos de la compra" disabled={busy} onClick={event => { event.stopPropagation(); setAdjuntosDe(purchase) }} />}
                  {!demo && <IconAction icon="clock" label="Historial de la compra" disabled={busy} onClick={event => { event.stopPropagation(); setHistorialDe(purchase) }} />}
                  {(purchase.status === 'DRAFT' || purchase.status === 'PARTIAL') && <IconAction icon="download" tone="fono" label="Recibir mercadería" disabled={busy} onClick={event => { event.stopPropagation(); abrirRecepcion(purchase) }} />}
                  {(purchase.status === 'RECEIVED' || purchase.status === 'PARTIAL') && <IconAction icon="back" tone="warn" label="Devolver al proveedor" disabled={busy} onClick={event => { event.stopPropagation(); abrirDevolucion(purchase) }} />}
                  {!demo && saldo > 0 && <IconAction icon="money" tone="ok" label="Pagar la compra" disabled={busy || !accounts.length} onClick={event => { event.stopPropagation(); openPayment(purchase) }} />}
                </span>
              </div>
              {abierta && <div className="mt-1 space-y-2 rounded-xl border border-ink-600 bg-ink-800/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {purchase.creditEnabled && <Badge color="orange">Crédito</Badge>}
                  {purchase.supplierReference && <span className="text-[11px] text-mute">Ref. {purchase.supplierReference}</span>}
                  <span className="text-[11px] text-mute">Pagado {gs(purchase.paidPyg ?? 0)}</span>
                  {purchase.receivedAt && <span className="text-[11px] text-mute">Recibida el {fechaRecepcion(purchase.receivedAt)}</span>}
                  {pendientes > 0 && <span className="text-[11px] text-warn">Pendiente de recibir: {pendientes}</span>}
                </div>
                {purchase.status === 'DRAFT'
                  ? <div className="space-y-1">{lineas.map(item => <div key={item.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}</span><MoneyInput aria-label={`Costo unitario de ${item.productName || item.productId}`} value={lineCostValue(purchase, item)} onValueChange={(value) => setLineCost(purchase.id, item.id, value)} className="w-36 shrink-0" placeholder="Costo ₲" /></div>)}</div>
                  : <div className="space-y-1 text-sm">{lineas.map(item => { const pendiente = pendienteDeLinea(purchase, item); return <div key={item.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{item.productName || item.productId} × {item.quantity}{item.lotReference ? ` · ${item.lotReference}` : ''}{pendiente > 0 ? ` · recibido ${recibidoDeLinea(purchase, item)} · quedan ${pendiente}` : ''}</span><span className="shrink-0 tabular-nums">{gs(item.finalTotalCostPyg ?? Number(item.quantity) * Number(item.unitCostPyg))}</span></div> })}</div>}
                {costChanges(purchase).length > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => saveCosts(purchase)}>Guardar costos</Button>}
              </div>}
            </div>
          })}
        </div>
      </div>}
    </div>
<Modal open={suppliersOpen} onClose={() => { setSuppliersOpen(false); setEditingSupplier(null); setSupplierForm(null); setHistorySupplier(null) }} title="Proveedores" className="max-w-2xl">
      {editingSupplier && supplierForm && <form onSubmit={saveSupplier} className="mb-4 space-y-3 rounded-xl border border-ink-600 p-3"><p className="text-sm font-semibold">Editar proveedor</p><div className={GRILLA_DOS_COLUMNAS_COMPACTA}>{SUPPLIER_FIELDS.map(([key, label]) => key === 'city' ? <div key={key}><Label>{label}</Label><CityAutocomplete value={supplierForm[key]} onSelect={(city, department) => setSupplierForm(current => ({ ...current, city, department }))} /></div> : key === 'phone' ? <div key={key}><Label>{label}</Label><PhoneField disabled={busy} countryCode={supplierForm.countryCode || '+595'} phone={supplierForm.phone || ''} onCountryCodeChange={(countryCode) => setSupplierForm(current => ({ ...current, countryCode }))} onChange={(phone) => setSupplierForm(current => ({ ...current, phone }))} /></div> : key === 'email' ? <div key={key}><Label>{label}</Label><EmailField disabled={busy} value={supplierForm.email || ''} onChange={(email) => setSupplierForm(current => ({ ...current, email }))} /></div> : key === 'document' ? <div key={key}><Label>{label}</Label><RucField disabled={busy} value={supplierForm.document || ''} onChange={(document) => setSupplierForm(current => ({ ...current, document }))} onAplicar={(datos) => setSupplierForm(current => ({ ...current, name: datos.name || current.name, document: datos.fullRuc || current.document }))} /></div> : <div key={key}><Label>{label}</Label><Input required={key === 'name'} value={supplierForm[key]} onChange={(e) => setSupplierForm(current => ({ ...current, [key]: e.target.value }))} /></div>)}</div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Guardar proveedor</Button><Button type="button" variant="ghost" onClick={() => { setEditingSupplier(null); setSupplierForm(null) }}>Cancelar</Button></div></form>}
      {suppliers.length === 0 ? <EmptyState compact icon="users" title="Sin proveedores registrados." /> : <div className="overflow-x-auto" data-testid="proveedores-tabla"><div className={cn(GRID_PROVEEDORES, 'px-3.5 pb-2 pt-1')}><span className={CELDA_ENCABEZADO}>Proveedor</span><span className={CELDA_ENCABEZADO}>Código</span><span className={CELDA_ENCABEZADO}>Ciudad</span><span className={CELDA_ENCABEZADO}>Teléfono</span><span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span></div><div className="space-y-1">{suppliers.map(item => <div key={item.id} data-testid="proveedor-fila" className={cn(GRID_PROVEEDORES, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2')}><span className={CELDA_IDENTIDAD} title={item.name}>{item.name}</span><span className="truncate font-mono text-[11px] text-fono-light">{item.code || '—'}</span><span className={CELDA_DATO} title={item.city || undefined}>{item.city || '—'}</span><span className="truncate text-xs tabular-nums text-mute">{item.phone || '—'}</span><span className="flex items-center justify-end gap-1"><IconAction icon="clock" label={`Historial de ${item.name}`} onClick={() => setHistorySupplier(item)} /><IconAction icon="edit" tone="fono" label={`Editar ${item.name}`} onClick={() => openSupplierEdit(item)} /></span></div>)}</div></div>}
    </Modal>
    <Modal open={historySupplier !== null} onClose={() => setHistorySupplier(null)} title={`Historial de ${historySupplier?.name || 'proveedor'}`}>
      {historySupplier && <Cronologia endpoint={`/api/suppliers/${historySupplier.id}/history`} active={historySupplier !== null} vacio="Sin actividad" descripcionVacio="Las compras, pagos y unidades de este proveedor aparecerán acá." />}
    </Modal>
    <Modal open={paymentPurchase !== null} onClose={() => { setPaymentPurchase(null); setPagoRegistrado(null) }} title="Registrar pago a proveedor">{pagoRegistrado ? <div className="space-y-3"><Aviso tono="ok">Pago registrado. Podés adjuntar el comprobante.</Aviso><AttachmentList entity="SUPPLIER_PAYMENT" entityId={pagoRegistrado.id} puedeSubir titulo="Comprobante del pago" /><Button type="button" className="w-full" onClick={() => { setPaymentPurchase(null); setPagoRegistrado(null) }}>Listo</Button></div> : <form onSubmit={paySupplier} className="space-y-3"><p className="text-sm text-mute">{paymentPurchase?.supplierName} · saldo actual {gs(paymentPurchase?.outstandingPyg || 0)}. La cotización queda congelada en este pago.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant={payment.action === 'advance' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'advance' }))}>Registrar anticipo</Button><Button type="button" variant={payment.action === 'pay' ? 'primary' : 'outline'} onClick={() => setPayment(data => ({ ...data, action: 'pay' }))}>Registrar pago</Button></div>{supplierBalance && <div className="rounded-xl border border-ink-600 p-3 text-sm"><p className="font-semibold">{supplierBalance.supplier?.name || paymentPurchase?.supplierName}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs text-mute"><span>Comprado<strong className="mt-0.5 block text-fore">{gs(supplierBalance.totalPurchasedPyg)}</strong></span><span>Pagado<strong className="mt-0.5 block text-ok">{gs(supplierBalance.paidPyg)}</strong></span><span>Pendiente<strong className="mt-0.5 block text-warn">{gs(supplierBalance.outstandingPyg)}</strong></span></div></div>}<div><Label>Cuenta de salida</Label><Select required value={payment.accountId} onChange={(event) => { const account = accounts.find(item => item.id === event.target.value); setPayment(data => ({ ...data, accountId: event.target.value, currency: account?.currency || 'PYG', exchangeRatePyg: account?.currency === 'PYG' ? '1' : '' })) }}><option value="">Elegí una cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></div><div className={GRILLA_DOS_COLUMNAS}><div><Label>Monto en {payment.currency}</Label><MoneyInput required currency={payment.currency} value={payment.originalAmount} onValueChange={(value) => setPayment(data => ({ ...data, originalAmount: value }))} placeholder="0" /></div><div><Label>Cotización en Gs.</Label><MoneyInput required disabled={payment.currency === 'PYG'} currency="USD" symbol="Gs." value={payment.exchangeRatePyg} onValueChange={(value) => setPayment(data => ({ ...data, exchangeRatePyg: value }))} placeholder={payment.currency === 'PYG' ? '1' : 'Ej. 7500'} /></div></div><div><Label>Referencia <span className="text-mute">(opcional)</span></Label><Input maxLength={200} value={payment.reference} onChange={(event) => setPayment(data => ({ ...data, reference: event.target.value }))} placeholder="Transferencia, recibo o comprobante" /></div><Button className="w-full" type="submit" disabled={busy || !payment.accountId || !Number(payment.originalAmount) || !Number(payment.exchangeRatePyg)}>{payment.action === 'advance' ? 'Guardar anticipo' : 'Guardar pago'}</Button></form>}</Modal>
    <Modal open={adjuntosDe !== null} onClose={() => setAdjuntosDe(null)} title="Adjuntos de la compra">
      {adjuntosDe && <AttachmentList entity="PURCHASE" entityId={adjuntosDe.id} puedeSubir titulo="Factura de la compra" />}
    </Modal>
    <Modal open={historialDe !== null} onClose={() => setHistorialDe(null)} title={`Historial de ${historialDe?.supplierName || 'compra'}`}>
      {historialDe && <Cronologia endpoint={`/api/purchases/${historialDe.id}/history`} active={historialDe !== null} vacio="Sin actividad" descripcionVacio="El alta, los costos, la recepción, los pagos y los adjuntos de esta compra aparecerán acá." />}
    </Modal>
    <Modal open={recepcionDe !== null} onClose={() => !busy && setRecepcionDe(null)} title="Recibir mercadería">
      {recepcionDe && <form onSubmit={event => { event.preventDefault(); if (demo) recibirTodo(recepcionDe); else confirmarRecepcion(event) }} className="space-y-4">
        <p className="text-sm text-mute">{recepcionDe.supplierName} · {estadoCompra(recepcionDe).texto}. Lo que elijas entra al stock; el resto queda pendiente en la orden.</p>
        {demo && <Aviso tono="warn">La recepción parcial requiere conexión con el servidor: en la demo solo se puede recibir la compra completa.</Aviso>}
        <div className="space-y-2">
          {(recepcionDe.lines || []).map(item => {
            const pendiente = pendienteDeLinea(recepcionDe, item)
            return <div key={item.id} className="grid gap-2 rounded-xl border border-ink-600/70 p-2 sm:grid-cols-[minmax(0,1fr)_10rem_6.5rem] sm:items-center">
              <span className="min-w-0 truncate text-sm">{item.productName || item.productId}{item.lotReference ? ` · ${item.lotReference}` : ''}</span>
              <span className="text-[11px] text-mute">Pedido {item.quantity} · Recibido {recibidoDeLinea(recepcionDe, item)} · <b className={pendiente > 0 ? 'text-warn' : 'text-ok'}>Pendiente {pendiente}</b></span>
              {pendiente > 0
                ? (demo
                  ? <span className="text-[11px] text-mute">Se recibe completo</span>
                  : <Input inputMode="numeric" aria-label={`Recibir ${item.productName || item.productId}`} value={recepcionCantidades[item.id] ?? ''} onChange={(event) => setRecepcionCantidades(current => ({ ...current, [item.id]: event.target.value.replace(/\D/g, '') }))} placeholder="Cantidad" />)
                : <span className="text-[11px] text-ok">Completa</span>}
            </div>
          })}
        </div>
        {accionError && <Aviso tono="error">{accionError}</Aviso>}
        <div className={PIE_ACCIONES_REVERSO}>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setRecepcionDe(null)}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{demo ? 'Recibir todo' : 'Recibir cantidades'}</Button>
        </div>
      </form>}
    </Modal>
    <Modal open={devolucionDe !== null} onClose={() => !busy && setDevolucionDe(null)} title="Devolver al proveedor">
      {devolucionDe && <form onSubmit={revisarDevolucion} className="space-y-4">
        <p className="text-sm text-mute">{devolucionDe.supplierName}. La devolución descuenta stock y el saldo pendiente con el proveedor.</p>
        {devolucionPaso === 'datos' ? <>
          <div className="space-y-2">
            {lineasDevolucion.length === 0 && <p className="rounded-lg border border-ink-600 px-3 py-2 text-sm text-mute">No quedan unidades recibidas pendientes de devolución en esta compra.</p>}
            {lineasDevolucion.map(({ item, maximo }) => <div key={item.id} className="grid gap-2 rounded-xl border border-ink-600/70 p-2 sm:grid-cols-[minmax(0,1fr)_10rem_6.5rem] sm:items-center">
              <span className="min-w-0 truncate text-sm">{item.productName || item.productId}{item.lotReference ? ` · ${item.lotReference}` : ''}</span>
              <span className="text-[11px] text-mute">Recibido {recibidoDeLinea(devolucionDe, item)} · <b className="text-fore">Devolvible {maximo}</b></span>
              <Input inputMode="numeric" aria-label={`Devolver ${item.productName || item.productId}`} value={devolucionCantidades[item.id] ?? ''} onChange={(event) => setDevolucionCantidades(current => ({ ...current, [item.id]: event.target.value.replace(/\D/g, '') }))} placeholder="Cantidad" />
            </div>)}
          </div>
          {lineasDevolucion.length > 0 && <p className="text-xs text-mute">El servidor valida que no se devuelva más de lo recibido pendiente de devolución.</p>}
          <div><Label htmlFor="motivo-devolucion">Motivo de la devolución</Label><Textarea id="motivo-devolucion" value={devolucionMotivo} onChange={(event) => setDevolucionMotivo(event.target.value)} placeholder="Ej: mercadería dañada o distinta a lo pedido…" rows={2} required /></div>
          {accionError && <Aviso tono="error">{accionError}</Aviso>}
          <div className={PIE_ACCIONES_REVERSO}>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setDevolucionDe(null)}>Cancelar</Button>
            <Button type="submit" variant="danger" disabled={busy || lineasDevolucion.length === 0}>Revisar devolución</Button>
          </div>
        </> : <>
          <div className="space-y-2 rounded-xl border border-ink-600 p-3 text-sm">
            {lineasDevolucion.filter(line => line.cantidad > 0).map(line => <div key={line.item.id} className="flex justify-between gap-3"><span className="min-w-0 truncate">{line.item.productName || line.item.productId} × {line.cantidad}</span><span className="shrink-0 tabular-nums">{gs(line.totalPyg)}</span></div>)}
            <div className="flex justify-between gap-3 border-t border-ink-600 pt-2 font-semibold"><span>Total a devolver</span><span className="tabular-nums">{gs(totalDevolucionPyg)}</span></div>
            <p className="text-xs text-mute">Motivo: {devolucionMotivo.trim()}</p>
          </div>
          <p className="text-sm text-mute">Se darán de baja {lineasDevolucion.reduce((sum, line) => sum + line.cantidad, 0)} unidad(es) de stock y el saldo con el proveedor bajará {gs(totalDevolucionPyg)}.</p>
          {accionError && <Aviso tono="error">{accionError}</Aviso>}
          <div className={PIE_ACCIONES_REVERSO}>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setAccionError(''); setDevolucionPaso('datos') }}>Volver</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={registrarDevolucion}>{busy ? 'Registrando…' : 'Confirmar devolución'}</Button>
          </div>
        </>}
      </form>}
    </Modal>
  </div>
}
