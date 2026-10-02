import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Badge, Button, Drawer, EmptyState, Input, Label, Money, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import Cronologia from '@/components/shared/Cronologia'
import MedidorBateria from '@/components/shared/MedidorBateria'
import EtiquetasProductoModal from '@/components/shared/EtiquetasProductoModal'
import KardexProducto from '@/components/productos/KardexProducto'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { num } from '@/utils/calculos'
import { fechaHora } from '@/utils/fecha'
import { formatGs } from '@/utils/moneda'
import SerialTexto from '@/components/shared/SerialTexto'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { demoInventorySeed, listDemoTransfers, listDemoUnits } from '@/lib/demoInventory'
import { eventosDemo } from '@/components/productos/kardexDemo'
import { cn } from '@/lib/utils'

const CONDITION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const DESTINATION = { NORMAL: 'Normal', OFFER: 'Oferta', WHOLESALE: 'Mayorista' }
const UNIT_STATUS = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const UNIT_TONE = { AVAILABLE: 'green', RESERVED: 'orange', SOLD: 'red', DEFECTIVE: 'slate', IN_TRANSIT: 'blue' }
const CATEGORIAS = ['Celulares', 'Accesorios', 'iPad', 'Apple Watch', 'Mac', 'Otros']

// #306: la ficha se organiza por secciones (resumen operativo, unidades, kardex,
// precios, compras e historial) con un índice fijo para navegarlas.
const SECCIONES = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'kardex', label: 'Kardex' },
  { id: 'precios', label: 'Precios' },
  { id: 'compras', label: 'Compras' },
  { id: 'historial', label: 'Historial' },
]
const GRID_COMPRAS = 'grid min-w-[44rem] grid-cols-[7.5rem_6rem_minmax(14rem,1.8fr)_minmax(7rem,0.8fr)] items-center gap-x-2'

const nombre = (row) => row?.name || row?.nombre || ''
const categoria = (row) => row?.category || row?.categoria || ''
const precio = (row) => Number(row?.pricePyg ?? row?.precioVenta ?? 0)
const mayorista = (row) => Number(row?.wholesalePricePyg ?? 0)
const costo = (row) => Number(row?.costPyg ?? row?.precioCosto ?? 0)
const esCompraRecibida = (action) => /recibida/i.test(String(action || ''))

// Detalle premium de un producto: resumen operativo, stock por estado, equipos
// (IMEI), kardex, precios, compras, historial y edición para administración o
// gerencia.
export default function ProductoDetalle({ product, canManage, esDemo, onClose, onChanged, onSell }) {
  const toast = useToast()
  const [current, setCurrent] = useState(product)
  const { sucursal } = useSesion()
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(!esDemo)
  // #286: si la carga falla se dice (con reintento) en vez de mostrar «no tiene
  // unidades» aunque existan.
  const [errorUnits, setErrorUnits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editando, setEditando] = useState(false)
  const [cronologiaAbierta, setCronologiaAbierta] = useState(false)
  const [kardexAbierto, setKardexAbierto] = useState(false)
  const [etiquetasOpen, setEtiquetasOpen] = useState(false)
  const [seccionActiva, setSeccionActiva] = useState('resumen')
  // Compras del producto (cuenta real): salen de la cronología, que ya trae las
  // líneas de compra con proveedor, cantidades y costos.
  const [compras, setCompras] = useState({ filas: [], loading: false, error: '' })
  const [form, setForm] = useState(() => ({
    categoria: product?.category || 'Otros',
    condicion: product?.condition || 'NEW',
    modelo: product?.model || '',
    color: product?.color || '',
    capacidad: product?.capacity || '',
    precio: String(precio(product) || ''),
    mayorista: String(mayorista(product) || ''),
    costo: String(costo(product) || ''),
    seguro: product?.insuranceRate != null ? String(product.insuranceRate) : '',
    umbral: product?.reorderPoint != null ? String(product.reorderPoint) : '',
    priceUsd: product?.priceUsd != null ? String(product.priceUsd) : '',
    garantiaDias: product?.warrantyDays != null ? String(product.warrantyDays) : '',
    garantiaCubre: product?.warrantyCoverage || '',
    garantiaNoCubre: product?.warrantyExclusions || '',
  }))

  const loadUnits = useCallback(async () => {
    if (!current?.id) { setLoadingUnits(false); return }
    // Demo (#306): las unidades ficticias ya existen en el inventario del demo;
    // se leen del store local en vez de decir que hacen falta una cuenta real.
    if (esDemo) {
      setErrorUnits('')
      setLoadingUnits(false)
      setUnits(listDemoUnits('', 'active').filter((unidad) => unidad.productId === current.id))
      return
    }
    setLoadingUnits(true)
    setErrorUnits('')
    try {
      // #286: por id de producto (exacto) y con la sucursal activa — el mismo
      // alcance que el selector del POS y el resto del panel. Antes se buscaba
      // por texto (SKU) y un fallo quedaba en silencio: la sección decía «no
      // tiene unidades» aunque existieran (o mostraba las de otra sucursal).
      const query = new URLSearchParams({ productId: current.id })
      if (sucursal?.id) query.set('branchId', sucursal.id)
      const rows = await api.get(`/api/inventory-units?${query.toString()}`)
      setUnits(Array.isArray(rows) ? rows : [])
    } catch (cause) {
      setUnits([])
      setErrorUnits(cause?.message || 'No se pudieron cargar los equipos de este producto.')
    } finally { setLoadingUnits(false) }
  }, [current?.id, esDemo, sucursal?.id])
  useEffect(() => { loadUnits() }, [loadUnits])
  useEffect(() => {
    if (!esDemo) return undefined
    const refrescar = () => loadUnits()
    window.addEventListener('mobos:demo-guardado', refrescar)
    return () => window.removeEventListener('mobos:demo-guardado', refrescar)
  }, [esDemo, loadUnits])

  // Inventario serializado del demo (incluye bajas) y stock operativo: el mismo
  // número que cierra el kardex y el que muestra la ficha.
  const unidadesDemo = useMemo(() => {
    if (!esDemo || !current?.id) return []
    return demoInventorySeed().units.filter((unidad) => unidad.productId === current.id)
    // `units` es la señal de refresco tras un movimiento en la demo.
  }, [esDemo, current?.id, units]) // eslint-disable-line react-hooks/exhaustive-deps
  const stockMostrado = useMemo(() => {
    if (esDemo && unidadesDemo.length) return unidadesDemo.filter((unidad) => unidad.status === 'AVAILABLE' && !unidad.removedAt).length
    return Number(current?.stock ?? 0)
  }, [esDemo, unidadesDemo, current?.stock])
  const productoKardex = useMemo(() => (esDemo ? { ...current, stock: stockMostrado } : current), [esDemo, current, stockMostrado])

  const resumen = useMemo(() => {
    const base = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, DEFECTIVE: 0, IN_TRANSIT: 0 }
    for (const unit of units) base[unit.status] = (base[unit.status] || 0) + 1
    return base
  }, [units])

  const costoUnitario = costo(current)
  const margen = precio(current) - costoUnitario
  const margenPct = precio(current) > 0 ? (margen / precio(current)) * 100 : null
  const valorStock = costoUnitario * Number(stockMostrado || 0)
  const porReponer = current?.reorderPoint != null && Number(stockMostrado) <= Number(current.reorderPoint) && Number(current.reorderPoint) > 0

  const cargarCompras = useCallback(async () => {
    if (!current?.id || esDemo) return
    setCompras({ filas: [], loading: true, error: '' })
    try {
      const data = await api.get(`/api/products/${encodeURIComponent(current.id)}/history`)
      setCompras({ filas: (Array.isArray(data?.events) ? data.events : []).filter((evento) => evento.type === 'purchase'), loading: false, error: '' })
    } catch (cause) {
      setCompras({ filas: [], loading: false, error: cause?.message || 'No se pudieron cargar las compras.' })
    }
  }, [current?.id, esDemo])
  useEffect(() => { cargarCompras() }, [cargarCompras])

  // Demo: los movimientos del producto (altas/compras, ventas, reservas,
  // revisiones, bajas y traslados) alimentan kardex y compras sin API.
  const eventosDemoProducto = useMemo(() => {
    if (!esDemo) return []
    return eventosDemo({ producto: productoKardex, unidades: unidadesDemo, transferencias: listDemoTransfers() })
  }, [esDemo, productoKardex, unidadesDemo])
  const comprasFilas = esDemo
    ? eventosDemoProducto.filter((evento) => evento.kind === 'COMPRA').map((evento) => ({
        id: evento.id,
        createdAt: evento.at,
        action: evento.label,
        detail: [evento.detail, evento.costo ? formatGs(evento.costo) : null].filter(Boolean).join(' · '),
        user: evento.user ? { name: evento.user } : null,
      }))
    : compras.filas
  const comprasCargando = esDemo ? false : compras.loading
  const comprasError = esDemo ? '' : compras.error
  const historialDemo = useMemo(() => [...eventosDemoProducto].sort((a, b) => b.at - a.at), [eventosDemoProducto])

  function irASeccion(id) {
    setSeccionActiva(id)
    if (id === 'kardex') setKardexAbierto(true)
    document.getElementById(`producto-seccion-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function guardarEdicion(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const seguro = parsePercent(form.seguro)
      const payload = {
        id: current.id,
        category: form.categoria,
        condition: form.condicion,
        model: form.modelo.trim(),
        color: form.color.trim(),
        capacity: form.capacidad.trim(),
        pricePyg: num(form.precio),
        ...(form.mayorista === '' ? { wholesalePricePyg: null } : { wholesalePricePyg: num(form.mayorista) }),
        ...(form.costo === '' ? { costPyg: null } : { costPyg: num(form.costo) }),
        ...(seguro === null ? { insuranceRate: null } : { insuranceRate: seguro }),
        ...(form.umbral === '' ? { reorderPoint: null } : { reorderPoint: num(form.umbral) }),
        ...(form.priceUsd === '' ? { priceUsd: null } : { priceUsd: Number(String(form.priceUsd).replace(',', '.')) }),
        ...(form.garantiaDias === '' ? { warrantyDays: null } : { warrantyDays: num(form.garantiaDias) }),
        warrantyCoverage: form.garantiaCubre.trim(),
        warrantyExclusions: form.garantiaNoCubre.trim(),
      }
      const updated = await api.patch('/api/products', payload)
      setCurrent(updated)
      setEditando(false)
      toast.success('Producto actualizado.')
      onChanged?.()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el producto.') } finally { setBusy(false) }
  }
  async function desactivar() {
    if (busy || !current?.id) return
    setBusy(true); setError('')
    try {
      await api.delete(`/api/products?id=${encodeURIComponent(current.id)}`)
      toast.success('Producto desactivado.')
      onChanged?.()
      onClose?.()
    } catch (cause) { setError(cause?.message || 'No se pudo desactivar el producto.') } finally { setBusy(false) }
  }

  return (
    <>
      <Drawer open onClose={onClose} title={nombre(current)} className="w-full sm:max-w-3xl lg:max-w-4xl">
      <div className="space-y-5">
        {/* #306: índice de secciones, fijo arriba mientras se recorre la ficha. */}
        <nav className="-mx-4 -mt-4 sticky top-0 z-20 flex gap-1.5 overflow-x-auto border-b border-ink-600 bg-ink-800 px-4 py-2 sm:-mx-5 sm:-mt-5 sm:px-5" role="tablist" aria-label="Secciones del producto" data-testid="producto-secciones">
          {SECCIONES.map((seccion) => (
            <button
              key={seccion.id}
              type="button"
              role="tab"
              aria-selected={seccionActiva === seccion.id}
              onClick={() => irASeccion(seccion.id)}
              className={cn('min-h-11 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition md:min-h-0', seccionActiva === seccion.id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:bg-ink-700 hover:text-fore')}
              data-testid={`producto-tab-${seccion.id}`}
            >
              {seccion.label}
            </button>
          ))}
        </nav>

        <section id="producto-seccion-resumen" data-testid="producto-seccion-resumen" className="space-y-5">
          <div className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={current?.condition === 'NEW' ? 'green' : 'orange'}>{CONDITION[current?.condition] || current?.condition || 'Nuevo'}</Badge>
              <Badge color="slate">{categoria(current) || 'Sin categoría'}</Badge>
              {(current?.capacity || current?.color || current?.model) && <Badge color="slate">{[current?.model, current?.capacity, current?.color].filter(Boolean).join(' · ')}</Badge>}
              {current?.destination && current.destination !== 'NORMAL' && <Badge color="blue">{DESTINATION[current.destination]}</Badge>}
              {current?.isActive === false && <Badge color="red">Inactivo</Badge>}
              {porReponer && <Badge color="orange">Reponer</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-wide">{current?.sku || 'Sin SKU'}</span>
              {current?.sku && <button type="button" className="rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore" title="Copiar SKU" aria-label="Copiar SKU" onClick={() => { copiarAlPortapapeles(current.sku); toast.success('SKU copiado.') }}><Icon name="copy" className="h-3.5 w-3.5" /></button>}
            </div>
            <p className="mt-1 text-xs text-mute">{current?.branch?.name || ''}{current?.branchId && !current?.branch?.name ? 'Sucursal asignada' : ''}</p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div><p className="text-xs text-mute">Precio de venta</p><p className="text-2xl font-bold tabular-nums text-fono-light">{precio(current) > 0 ? <Money value={precio(current)} /> : '—'}</p></div>
              {mayorista(current) > 0 && <div><p className="text-xs text-mute">Mayorista</p><p className="text-lg font-semibold tabular-nums"><Money value={mayorista(current)} /></p></div>}
              {current?.priceUsd != null && Number(current.priceUsd) > 0 && <div><p className="text-xs text-mute">En dólares</p><p className="text-lg font-semibold tabular-nums"><Money value={current.priceUsd} currency="USD" /></p></div>}
              <div className="ml-auto text-right"><p className="text-xs text-mute">Stock</p><p className="text-2xl font-bold tabular-nums" data-testid="producto-stock">{stockMostrado}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => onSell?.(current)}>Vender</Button>
              <Button variant="outline" disabled={busy} onClick={() => setEtiquetasOpen(true)}>Etiqueta de precio</Button>
              {canManage && !esDemo && <Button variant="outline" disabled={busy} onClick={() => { if (!editando) irASeccion('precios'); setEditando(value => !value) }}>{editando ? 'Cancelar edición' : 'Editar'}</Button>}
              {canManage && !esDemo && <button type="button" disabled={busy} onClick={desactivar} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-bad hover:text-bad">Desactivar</button>}
            </div>
            {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
          </div>

          {/* Resumen operativo: lo que gerencia mira antes de decidir. */}
          <div className="rounded-2xl border border-ink-600 p-4" data-testid="producto-resumen-stock">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={ROTULO_SECCION}>Estado del stock</h3>
              {porReponer ? <Badge color="orange">Por reponer · umbral {current.reorderPoint}</Badge> : <Badge color="slate">{current?.reorderPoint != null ? `Umbral ${current.reorderPoint}` : 'Sin umbral'}</Badge>}
            </div>
            {loadingUnits && <div className="mt-3 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
            {!loadingUnits && units.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries(UNIT_STATUS).map(([status, label]) => <div key={status} className="rounded-xl bg-ink-800/60 p-2.5 text-center"><p className="text-lg font-bold tabular-nums">{resumen[status] || 0}</p><p className="text-[10px] text-mute">{label}</p></div>)}
              </div>
            )}
            {!loadingUnits && units.length === 0 && (
              <p className="mt-2 text-sm text-mute">{esDemo ? 'Sin unidades con IMEI: el stock se controla por cantidad.' : 'Sin unidades con IMEI en la sucursal activa: el stock se controla por cantidad.'}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Stock</p><p className="mt-1 text-lg font-bold tabular-nums">{stockMostrado}</p></div>
              <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Valor de stock</p><p className="mt-1 font-semibold">{costoUnitario > 0 ? <Money value={valorStock} /> : 'Costo pendiente'}</p></div>
              <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Margen por unidad</p><p className="mt-1 font-semibold">{costoUnitario > 0 && precio(current) > 0 ? <><Money value={margen} /> <span className="text-xs font-normal text-mute">{formatPercent(margenPct)}%</span></> : 'Cargá costo y precio'}</p></div>
              <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Reposición</p><p className="mt-1 font-semibold">{current?.reorderPoint ?? '—'}</p></div>
            </div>
          </div>
        </section>

        <section id="producto-seccion-unidades" data-testid="producto-seccion-unidades" className="rounded-2xl border border-ink-600 p-4">
          {/* #287: el producto y sus unidades son el mismo objeto: desde acá se
              pasa a la vista de Unidades acotada a este producto. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Equipos por estado</h3>
            {units.length > 0 && (
              <Link
                to={`/inventario/unidades?producto=${encodeURIComponent(current.id)}${current.sku ? `&q=${encodeURIComponent(current.sku)}` : ''}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1 text-[11px] font-semibold text-fono-light transition hover:border-fono/40"
                title="Abrir estas unidades en Inventario"
              >
                <Icon name="box" className="h-3.5 w-3.5" />Ver unidades en Inventario
              </Link>
            )}
          </div>
          {loadingUnits && <div className="mt-3 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
          {!loadingUnits && Boolean(errorUnits) && (
            <Aviso tono="error" className="mt-2 flex flex-wrap items-center gap-2 p-3" role="alert">
              <span className="min-w-0 flex-1">{errorUnits}</span>
              <Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-[11px] text-bad" onClick={() => loadUnits()}>Reintentar</Button>
            </Aviso>
          )}
          {!loadingUnits && !errorUnits && units.length === 0 && <p className="mt-2 text-sm text-mute">{esDemo ? 'Este producto del demo no tiene unidades con IMEI.' : 'No hay unidades de este producto en la sucursal activa. Cambiá de sucursal para ver otras o revisá que la compra esté recibida.'}</p>}
          {!loadingUnits && units.length > 0 && <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(UNIT_STATUS).map(([status, label]) => <div key={status} className="rounded-xl bg-ink-800/60 p-2.5 text-center"><p className="text-lg font-bold tabular-nums">{resumen[status] || 0}</p><p className="text-[10px] text-mute">{label}</p></div>)}
            </div>
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {units.map(unit => <div key={unit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs">
                <SerialTexto serial={unit.serial} />
                <span className="flex items-center gap-2 text-mute">{unit.batteryHealth ? <MedidorBateria porcentaje={unit.batteryHealth} variante="chip" /> : null}{unit.location?.name || 'Sin ubicación'}<Badge color={UNIT_TONE[unit.status] || 'slate'}>{UNIT_STATUS[unit.status] || unit.status}</Badge></span>
              </div>)}
            </div>
          </>}
        </section>

        <section id="producto-seccion-kardex" data-testid="producto-seccion-kardex" className="rounded-2xl border border-ink-600 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Kardex</h3>
            {!kardexAbierto && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setKardexAbierto(true)} data-testid="kardex-abrir">
                <Icon name="report" className="h-4 w-4" />Ver movimientos
              </Button>
            )}
          </div>
          {!kardexAbierto && (
            <p className="mt-2 text-sm text-mute">
              Entradas y salidas con saldo corrido, desde compras, ventas, traslados, ajustes y altas de unidades.
              {esDemo ? ' En el demo se reconstruye de las unidades ficticias de este navegador.' : ''}
            </p>
          )}
          {kardexAbierto && (
            <div className="mt-3">
              <KardexProducto product={productoKardex} esDemo={esDemo} onCerrar={() => setKardexAbierto(false)} />
            </div>
          )}
        </section>

        <section id="producto-seccion-precios" data-testid="producto-seccion-precios" className="rounded-2xl border border-ink-600 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Precios</h3>
            {canManage && !esDemo && <Button type="button" variant="outline" disabled={busy} onClick={() => setEditando(value => !value)}>{editando ? 'Cancelar edición' : 'Editar producto'}</Button>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Precio de venta</p><p className="mt-1 font-semibold">{precio(current) > 0 ? <Money value={precio(current)} /> : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Mayorista</p><p className="mt-1 font-semibold">{mayorista(current) > 0 ? <Money value={mayorista(current)} /> : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">En dólares</p><p className="mt-1 font-semibold">{current?.priceUsd != null && Number(current.priceUsd) > 0 ? <Money value={current.priceUsd} currency="USD" /> : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Costo</p><p className="mt-1 font-semibold">{costoUnitario > 0 ? <Money value={costoUnitario} /> : <span className="text-warn">pendiente</span>}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Margen</p><p className="mt-1 font-semibold">{costoUnitario > 0 && precio(current) > 0 ? <><Money value={margen} /> <span className="text-xs font-normal text-mute">{formatPercent(margenPct)}%</span></> : '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Seguro</p><p className="mt-1 font-semibold">{current?.insuranceRate != null && Number(current.insuranceRate) > 0 ? `${formatPercent(current.insuranceRate)}%` : 'sin seguro'}</p></div>
          </div>
          <p className="mt-2 text-xs text-mute">El margen no incluye comisiones ni seguro; el umbral de reposición se configura en el resumen del producto.</p>

          {editando && (
            <form onSubmit={guardarEdicion} className={cn('mt-4 rounded-xl border border-fono/25 bg-fono/5 p-4', GRILLA_DOS_COLUMNAS)}>
              <div className="sm:col-span-2"><h4 className={ROTULO_SECCION}>Editar producto</h4></div>
              <div><Label htmlFor="categoria">Categoría</Label><Select id="categoria" value={form.categoria} onChange={event => setForm(current => ({ ...current, categoria: event.target.value }))}>{CATEGORIAS.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}{!CATEGORIAS.includes(form.categoria) && form.categoria && <option value={form.categoria}>{form.categoria}</option>}</Select></div>
              <div><Label htmlFor="condicion">Condición</Label><Select id="condicion" value={form.condicion} onChange={event => setForm(current => ({ ...current, condicion: event.target.value }))}>{Object.entries(CONDITION).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
              <div><Label htmlFor="modelo">Modelo</Label><Input id="modelo" value={form.modelo} onChange={event => setForm(current => ({ ...current, modelo: event.target.value }))} placeholder="Ej. iPhone 15 Pro Max" /></div>
              <div><Label htmlFor="color">Color</Label><Input id="color" value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} placeholder="Ej. Titanio Negro" /></div>
              <div><Label htmlFor="capacidad">Capacidad</Label><Input id="capacidad" value={form.capacidad} onChange={event => setForm(current => ({ ...current, capacidad: event.target.value }))} placeholder="Ej. 256GB" /></div>
              <div><Label htmlFor="precio-de-venta-gs">Precio de venta (Gs)</Label><MoneyInput id="precio-de-venta-gs" value={form.precio} onValueChange={value => setForm(current => ({ ...current, precio: value === '' ? '' : String(value) }))} /></div>
              <div><Label htmlFor="precio-mayorista-gs">Precio mayorista (Gs)</Label><MoneyInput id="precio-mayorista-gs" value={form.mayorista} onValueChange={value => setForm(current => ({ ...current, mayorista: value === '' ? '' : String(value) }))} /></div>
              <div><Label htmlFor="costo-gs">Costo (Gs)</Label><MoneyInput id="costo-gs" value={form.costo} onValueChange={value => setForm(current => ({ ...current, costo: value === '' ? '' : String(value) }))} /></div>
              <div><Label htmlFor="seguro">Seguro (%)</Label><PercentField id="seguro" value={form.seguro} onChange={value => setForm(current => ({ ...current, seguro: value }))} placeholder="Ej. 2" /></div>
              <div><Label htmlFor="umbral-de-reposicion">Umbral de reposición</Label><Input id="umbral-de-reposicion" inputMode="numeric" value={form.umbral} onChange={event => setForm(current => ({ ...current, umbral: event.target.value.replace(/\D/g, '') }))} placeholder="Ej. 3" /></div>
              <div><Label htmlFor="precio-en-usd-opcional">Precio en USD (opcional)</Label><MoneyInput id="precio-en-usd-opcional" currency="USD" value={form.priceUsd} onValueChange={value => setForm(current => ({ ...current, priceUsd: value === '' ? '' : String(value) }))} placeholder="0,00" /></div>
              <div><Label htmlFor="garantia-dias">Garantía (días)</Label><Input id="garantia-dias" inputMode="numeric" value={form.garantiaDias} onChange={event => setForm(current => ({ ...current, garantiaDias: event.target.value.replace(/\D/g, '') }))} placeholder="Ej. 365" /><p className="mt-1 text-[11px] text-mute">Al vender se crea la garantía del equipo automáticamente.</p></div>
              <div className="sm:col-span-2"><Label htmlFor="que-cubre">Qué cubre</Label><Textarea id="que-cubre" rows={2} value={form.garantiaCubre} onChange={event => setForm(current => ({ ...current, garantiaCubre: event.target.value }))} placeholder="Defectos de fábrica…" /></div>
              <div className="sm:col-span-2"><Label htmlFor="que-no-cubre">Qué no cubre</Label><Textarea id="que-no-cubre" rows={2} value={form.garantiaNoCubre} onChange={event => setForm(current => ({ ...current, garantiaNoCubre: event.target.value }))} placeholder="Daños físicos, humedad…" /></div>
              <div className="flex items-end gap-2"><Button type="submit" disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar cambios'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditando(false)}>Cancelar</Button></div>
            </form>
          )}
        </section>

        <section id="producto-seccion-compras" data-testid="producto-seccion-compras" className="rounded-2xl border border-ink-600 p-4">
          <h3 className={ROTULO_SECCION}>Compras</h3>
          <p className="mt-1 text-xs text-mute">Ingresos de este producto con proveedor, cantidad, costo y lote{esDemo ? ' (datos ficticios del demo)' : ''}.</p>
          {comprasCargando && <div className="mt-3 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
          {!comprasCargando && Boolean(comprasError) && (
            <Aviso tono="error" className="mt-2 flex flex-wrap items-center gap-2 p-3" role="alert">
              <span className="min-w-0 flex-1">{comprasError}</span>
              <Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-[11px] text-bad" onClick={() => cargarCompras()}>Reintentar</Button>
            </Aviso>
          )}
          {!comprasCargando && !comprasError && comprasFilas.length === 0 && (
            <EmptyState compact icon="receipt" title="Sin compras de este producto" description="Las compras registradas o recibidas para este producto aparecerán acá." />
          )}
          {!comprasCargando && !comprasError && comprasFilas.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-ink-600" data-testid="producto-compras-tabla">
              <div className={cn(GRID_COMPRAS + ' border-b border-ink-600 bg-ink-800 px-3.5 py-2')}>
                <span className={ROTULO_SECCION}>Fecha</span><span className={ROTULO_SECCION}>Estado</span><span className={ROTULO_SECCION}>Detalle</span><span className={ROTULO_SECCION}>Usuario</span>
              </div>
              {comprasFilas.map((fila) => (
                <div key={fila.id} className={GRID_COMPRAS + ' border-b border-ink-600/60 px-3.5 py-2 text-xs last:border-0'} data-testid="producto-compra">
                  <span className="truncate text-mute" title={fila.createdAt}>{fechaHora(fila.createdAt)}</span>
                  <span><Badge color={esCompraRecibida(fila.action) ? 'green' : 'slate'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{esCompraRecibida(fila.action) ? 'Recibida' : 'Borrador'}</Badge></span>
                  <span className="truncate" title={fila.detail}>{fila.detail}</span>
                  <span className="truncate text-mute" title={fila.user?.name || undefined}>{fila.user?.name || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="producto-seccion-historial" data-testid="producto-seccion-historial" className="rounded-2xl border border-ink-600 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={ROTULO_SECCION}>Historial</h3>
            <button type="button" onClick={() => setCronologiaAbierta(value => !value)} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">{cronologiaAbierta ? 'Ocultar' : 'Ver historial'}</button>
          </div>
          {cronologiaAbierta && (
            <div className="mt-3">
              {esDemo
                ? (historialDemo.length === 0
                  ? <EmptyState compact icon="clock" title="Sin actividad" description="Las altas, ventas y traslados del producto aparecerán acá." />
                  : <ol className="space-y-2" data-testid="producto-historial-demo">
                      {historialDemo.map((evento) => (
                        <li key={evento.id} className="rounded-xl border border-ink-600 bg-ink-800/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{evento.label}</span>
                            <span className="text-[11px] text-mute">{fechaHora(evento.at)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-mute">{evento.detail || '—'}</p>
                          <p className="mt-0.5 text-[11px] text-mute">{evento.user || 'Sistema'}</p>
                        </li>
                      ))}
                    </ol>)
                : <Cronologia endpoint={`/api/products/${current.id}/history`} active={cronologiaAbierta} vacio="Sin actividad" descripcionVacio="Las compras, unidades y cambios de este producto aparecerán acá." />}
            </div>
          )}
        </section>
      </div>
      </Drawer>
      <EtiquetasProductoModal open={etiquetasOpen} onClose={() => setEtiquetasOpen(false)} productos={[current]} seleccionInicial={[current?.id || current?.sku]} />
    </>
  )
}
