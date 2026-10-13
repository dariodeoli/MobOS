import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { contextoActual, getProductos, modoDatosActual, refrescar, refrescarCatalogo, updateProducto } from '@/lib/storage'
import { useSesion } from '@/lib/sesion'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { useToast } from '@/components/ui'
import { etiquetaCondicionUnidad, nombreProducto, sigueEnInventario, sinCostoUnitario } from '@/utils/inventario'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { prepararVentaDesdeInventario } from '@/lib/posCart'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { useVistaListaGrid } from '@/hooks/useVistaListaGrid'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { coincideExacto, leerProveedoresRecientes, recordarProveedorReciente } from '@/lib/proveedores'
import { puedeCaerAlDialogo } from '@/lib/printing/agent'
import useValidacionFormulario from '@/hooks/useValidacionFormulario'
import { ETIQUETAS_TRANSFERENCIA, conteoAplicable, reglasTransferencia, valoresTransferencia } from '@/lib/validacionGlobal'
import { api, apiFetch } from '@/lib/api/client'
import { demoAutorizacionesStock } from '@/lib/autorizacionesStock'
import { resources } from '@/lib/api'
import { cotizacionReferencia } from '@/lib/fx'
import { suppliersApi } from '@/lib/api/suppliers'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { descargarCsv } from '@/utils/descargarCsv'
import { ultimos4 } from '@/utils/serial'
import { transferReceiveUrlFor } from '@/components/shared/OrderReceipt'
import { qrDataUrl } from '@/lib/qr'
import { gs } from '@/utils/calculos'
import { GRUPOS_INVENTARIO, INVENTARIO_TABS, MOTIVOS_BAJA, MOTIVOS_REVISION, TABS_CON_UNIDADES, TABS_LISTA_STOCK, fechaVerificacion, normalizeScan } from './stockHelpers'
import { imprimirEtiquetasStock, printQuickReceipt } from './impresionStock'
import { useStockItems } from './useStockItems'
import { conFiltroStock, leerFiltrosStock, rangoDePeriodo, sinFiltrosStock } from './stockFiltros'
import { EtiquetasStockError, vistaPreviaEtiquetasPdf } from '@/lib/printing/etiquetasStock'
import { filasEtiquetasDeItems, unidadDeItem } from '@/lib/stockItems'

export function useStockControl({ tab: tabProp, onTabChange } = {}) {
  // La búsqueda global abre Unidades con ?q=<serial> ya aplicado y #287 suma
  // ?producto=<id>: la vista de Unidades acotada a un producto (desde su ficha).
  const [searchParams, setSearchParams] = useSearchParams()
  const qParam = searchParams.get('q') || ''
  const productoParam = searchParams.get('producto') || ''
  const [products, setProducts] = useState([]), [units, setUnits] = useState([]), [removedUnits, setRemovedUnits] = useState([]), [reservations, setReservations] = useState([]), [transfers, setTransfers] = useState([]), [locations, setLocations] = useState([]), [cargandoUnidades, setCargandoUnidades] = useState(true)
  const apiMode = modoDatosActual() === 'api'
  const { sesion, usuario, sucursal, sucursales, esDemo } = useSesion()
  // Las sucursales ya vienen hidratadas en la sesión (el selector del shell las
  // consulta una sola vez): se reusan para los modales en lugar de repetir la
  // consulta en cada carga del inventario (#247).
  const branches = useMemo(() => (sucursales || []).map(item => ({ ...item, name: item.name || item.nombre })), [sucursales])
  const navigate = useNavigate()
  // #213: en demo el inventario usa los mismos recursos (store session-only).
  const inventarioOperativo = apiMode || esDemo
  const canViewAlerts = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageLocations = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const canManageVisibility = Boolean(sesion?.esPropietario)
  // Costo y proveedor: la API los devuelve null a quien no los ve (VENDEDOR/CAJERA).
  const rolVeCosto = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE' || usuario?.role === 'ADMIN' || usuario?.role === 'GERENTE')
  const [tab, setTab] = useState(tabProp && INVENTARIO_TABS.includes(tabProp) && (tabProp !== 'alertas' || canViewAlerts) && (tabProp !== 'autorizaciones' || canViewAlerts) ? tabProp : 'unidades'), [query, setQuery] = useState(qParam), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [orden, recordarOrden] = useUltimoUsado('inventario:orden', 'recientes'), [exportando, setExportando] = useState(false)
  const [stockAlerts, setStockAlerts] = useState({ alerts: [], outOfStock: [] })
  // #331: autorizaciones de stock (retiro/ajuste y transferencia) para la
  // bandeja de Control → Autorizaciones y su contador.
  const [authStock, setAuthStock] = useState({ rows: [], loading: false, error: '' })
  const toast = useToast()
  const [seleccionados, setSeleccionados] = useState([])
  const [crearVariante, setCrearVariante] = useState(false)
  const [modeloNuevo, setModeloNuevo] = useState('')
  const [gondolaOpen, setGondolaOpen] = useState(false)
  // Las filas elegidas salen de la lista de Stock (paginada por cursor) y, en las
  // pestañas con unidades completas, de `units`; el serial y el estado son los
  // mismos que usan los diálogos y la ficha.
  const itemsElegidos = () => stock.items.filter((item) => seleccionados.includes(item.id))
  const unidadesElegidas = () => {
    const deLista = itemsElegidos().filter((item) => item.kind === 'unit').map((item) => unidadDeItem(item, products))
    const vistas = new Set(deLista.map((unit) => unit.id))
    return [...deLista, ...units.filter((unit) => seleccionados.includes(unit.id) && !vistas.has(unit.id))]
  }
  async function copiarImeis() {
    const texto = unidadesElegidas().map((unit) => `${nombreProducto(unit.product || {})} · IMEI ${unit.serial || ''}`).join('\n')
    if (await copiarAlPortapapeles(texto)) toast.success(`${unidadesElegidas().length} IMEI(s) copiados.`); else toast.error('No se pudieron copiar los IMEIs.')
  }
  // #217/§8: «Vender todos» deja la venta armada en el POS (producto, IMEI y
  // precio de lista) y el vendedor solo revisa y cobra. Cada unidad vendible del
  // lote viaja con su serial; las que no están disponibles quedan fuera.
  async function venderTodos() {
    const elegidas = unidadesElegidas()
    const vendibles = elegidas.filter((unit) => unit.status === 'AVAILABLE' && (unit.productId || unit.product?.id))
    if (!vendibles.length) { toast.error('No hay unidades disponibles en la selección para vender.'); return }
    // El POS arma el carrito con el espejo del catálogo: se actualiza antes de
    // navegar para que los productos recién ingresados aparezcan.
    await refrescar().catch(() => {})
    const porProducto = new Map()
    for (const unit of vendibles) {
      const productoId = unit.productId || unit.product.id
      const linea = porProducto.get(productoId) || { productoId, quantity: 0, serials: [], precio: 0 }
      linea.quantity += 1
      if (unit.serial) linea.serials.push(unit.serial)
      if (!linea.nombre) linea.nombre = nombreProducto(unit.product || {})
      if (!linea.precio && Number(unit.product?.pricePyg) > 0) linea.precio = Number(unit.product.pricePyg)
      porProducto.set(productoId, linea)
    }
    const { empresaId, sucursalId, userId } = contextoActual()
    const items = [...porProducto.values()].map(({ precio, ...linea }) => (precio > 0 ? { ...linea, precio } : linea))
    if (!prepararVentaDesdeInventario({ empresaId, sucursalId, usuarioId: userId, items })) { toast.error('No se pudo preparar la venta en el POS.'); return }
    const sobrantes = elegidas.length - vendibles.length
    toast.success(`${vendibles.length} unidad${vendibles.length === 1 ? '' : 'es'} para vender en el POS${sobrantes > 0 ? ` (${sobrantes} quedaron fuera por no estar disponibles)` : ''}.`)
    setSeleccionados([])
    navigate('/pos')
  }
  function exportarUnidadesSeleccionadas() {
    const lista = unidadesElegidas()
    const filas = [['Producto', 'IMEI / Serial', 'Condición', 'Ubicación', 'Verificado'], ...lista.map((unit) => [nombreProducto(unit.product || {}), unit.serial || '', etiquetaCondicionUnidad(unit) || unit.condition || '', unit.location?.name || '', unit.lastVerifiedAt ? fechaVerificacion(unit.lastVerifiedAt) : 'Sin verificar'])]
    const csv = filas.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(',')).join('\n')
    descargarCsvCliente('mobos-unidades-seleccionadas.csv', csv)
    toast.success(`${lista.length} unidad(es) exportadas.`)
  }
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [thresholdValue, setThresholdValue] = useState('')
  const [detalleUnidad, setDetalleUnidad] = useState(null)
  const [informeDe, setInformeDe] = useState(null)
  const [certificadoDe, setCertificadoDe] = useState(null)
  const [constanciaDe, setConstanciaDe] = useState(null)
  const [vistaUbicaciones, cambiarVistaUbicaciones] = useVistaListaGrid('ubicaciones', 'grid')
  // #304: debajo de `sm` el listado usa tarjetas compactas (no la tabla ancha).
  const esMovil = usePantallaAngosta('(min-width: 640px)')
  // #209: selecciones frecuentes arrancan con el último usado; se avisa en
  // pantalla y siempre se puede cambiar.
  const [motivoBajaRecordado, recordarMotivoBaja] = useUltimoUsado('inventario:motivo-baja')
  const [motivoRevisionRecordado, recordarMotivoRevision] = useUltimoUsado('inventario:motivo-revision')
  const [altaSucursalRecordada, recordarAltaSucursal] = useUltimoUsado('inventario:alta-sucursal')
  const [altaDepositoRecordado, recordarAltaDeposito] = useUltimoUsado('inventario:alta-deposito')
  const [recepcionDepositoRecordado, recordarRecepcionDeposito] = useUltimoUsado('inventario:recepcion-deposito')
  const [scannerOpen, setScannerOpen] = useState(false), [receiveOpen, setReceiveOpen] = useState(false), [reserveOpen, setReserveOpen] = useState(false), [transferOpen, setTransferOpen] = useState(false)
  const [reasonAction, setReasonAction] = useState(null), [reason, setReason] = useState(''), [reasonKind, setReasonKind] = useState('')
  const [arrivalUnit, setArrivalUnit] = useState(null), [arrivalLocationId, setArrivalLocationId] = useState('')
  // #218: recepción de un lote completo (transferencia) con depósito destino.
  const [receiveBatch, setReceiveBatch] = useState(null)
  // Conteo físico rápido con cámara: escanea cada equipo y contrasta contra stock.
  const [countOpen, setCountOpen] = useState(false)
  const [countSession, setCountSession] = useState(null) // { scanning, found: Map, unknown: [], duplicates: [], flash }
  const [receive, setReceive] = useState({ productId: '', serial: '', branchId: '', locationId: '', condition: 'NEW', batteryHealth: '', supplierName: '', costCurrency: 'PYG', originalCost: '', exchangeRatePyg: '', notes: '' })
  // #323: el error de la carga rápida vive adentro del diálogo (junto al campo)
  // y no en el Aviso general, que quedaba detrás del overlay.
  const [receiveError, setReceiveError] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [recientesProveedores, setRecientesProveedores] = useState(() => leerProveedoresRecientes(contextoActual().empresaId))
  const [cotizacion, setCotizacion] = useState(null)
  const [reserve, setReserve] = useState({ serials: '', customerName: '', customerId: '', hours: '2' })
  const [reserveMatches, setReserveMatches] = useState([])
  const reserveTimer = useRef(null)
  const [guiaPara, setGuiaPara] = useState(null)
  // #218: ETA del lote editable desde la tabla mientras siga en tránsito.
  const [etaPara, setEtaPara] = useState(null)
  const [remitoQr, setRemitoQr] = useState(null), [remitoQrImg, setRemitoQrImg] = useState(''), [remitoQrBusy, setRemitoQrBusy] = useState(false), [remitoQrError, setRemitoQrError] = useState('')
  const remitoQrSeq = useRef(0)
  const [tracking, setTracking] = useState(null)
  const [etiquetaAex, setEtiquetaAex] = useState(null) // { guia, formato, partida, busy, error, unconfigured, webUrl }
  const [envioAex, setEnvioAex] = useState(null)
  const [transfer, setTransfer] = useState({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '', eta: '' })
  const [transferAuth, setTransferAuth] = useState(null)
  const [locationForm, setLocationForm] = useState(null) // { id?, name, code, branchId }
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipientResults, setRecipientResults] = useState([])
  const [searchingRecipient, setSearchingRecipient] = useState(false)
  const [recipientError, setRecipientError] = useState('')
  const [grants, setGrants] = useState([])
  const [receivedStock, setReceivedStock] = useState([])
  const [visibilityError, setVisibilityError] = useState('')
  // Aviso del resultado de una etiqueta: el respaldo con diálogo se abre solo
  // (dentro de las funciones de impresión); acá se informa el resto.
  // `genero` concuerda el participio con el nombre del documento (Etiqueta →
  // «enviada», Informe → «enviado»).
  const avisarImpresion = (resultado, nombre = 'Etiqueta', genero = 'f') => {
    if (!resultado) return
    const sufijo = genero === 'm' ? 'o' : 'a'
    if (resultado.ok && !resultado.encolado) { setNotice(`${nombre} enviad${sufijo} a la impresora.`); return }
    if (resultado.ok && resultado.encolado) {
      setNotice(resultado.remoto ? `${nombre} encolad${sufijo}: la imprime el puente cuando la reclame.` : `${nombre} encolad${sufijo}: la impresora no respondió y se reintenta sola.`)
      return
    }
    if (!puedeCaerAlDialogo(resultado)) setError(resultado.error || `No se pudo imprimir ${nombre.toLowerCase()}.`)
  }
  // Comprobante rápido desde Vendidos (#215 §10): un clic en el ícono, sin
  // abrir la ficha ni salir de la lista.
  async function imprimirComprobanteRapido(unit) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      // La lista de Stock no trae el pedido de la venta: se completa con la unidad real.
      let completa = unit
      if (!unit?.sale?.orderId && unit?.serial) {
        const filas = await resources.inventoryUnits.list(unit.serial, 'active')
        completa = filas.find((fila) => fila.id === unit.id) || unit
      }
      avisarImpresion(await printQuickReceipt(completa), 'Comprobante')
    } catch (cause) {
      setError(cause?.message || 'No se pudo imprimir el comprobante de la venta.')
    } finally {
      setBusy(false)
    }
  }
  // ADMIN y GERENTE transfieren por su rol; el resto necesita autorización.
  const puedeTransferirSinAuth = sesion?.rol === 'dueno' || sesion?.rol === 'GERENTE'
  const transferSerials = transfer.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean)
  // #297: el traslado no se confirma sin origen, destino, modelo, IMEI/serial y
  // la autorización cuando el rol la exige.
  const controlTransferencia = useValidacionFormulario(
    valoresTransferencia(transfer, { puedeTransferirSinAuth, transferAuth }),
    reglasTransferencia(transfer, { puedeTransferirSinAuth }),
    ETIQUETAS_TRANSFERENCIA,
  )
  useEffect(() => { setTransferAuth(null) }, [transfer.sourceBranchId, transfer.destinationBranchId, transfer.productId, transfer.serials])
  // La pestaña activa vive en la URL (/inventario/<slug>). Sin slug válido o sin
  // permiso para Alertas, se cae en Unidades.
  const loadAlerts = useCallback(async () => {
    if (!inventarioOperativo || !canViewAlerts) return
    setAlertsLoading(true); setAlertsError('')
    const params = new URLSearchParams()
    if (sucursal?.id) params.set('branchId', sucursal.id)
    const query = params.toString() ? `?${params}` : ''
    try {
      const payload = await api.get(`/api/stock-alerts${query}`)
      setStockAlerts(payload || { alerts: [], outOfStock: [] })
    } catch (cause) { setAlertsError(cause?.message || 'No se pudieron cargar las alertas.') } finally { setAlertsLoading(false) }
  }, [inventarioOperativo, canViewAlerts, sucursal?.id])
  // #331: bandeja de autorizaciones de stock. Solo la carga quien puede
  // resolverlas (dueño/gerencia); el contador de Control y de la pestaña sale
  // de estas filas. La resolución no cambia la semántica: la aprobada se
  // consume al ejecutarse desde la ficha de la unidad.
  const cargarAutorizacionesStock = useCallback(async () => {
    if (!inventarioOperativo || !canViewAlerts) return
    if (esDemo) { setAuthStock({ rows: demoAutorizacionesStock(), loading: false, error: '' }); return }
    setAuthStock(actuales => ({ ...actuales, loading: true, error: '' }))
    try {
      const [ajustes, transferencias] = await Promise.all([
        api.get('/api/authorizations?kind=STOCK_ADJUST'),
        api.get('/api/authorizations?kind=TRANSFER'),
      ])
      setAuthStock({
        rows: [...(Array.isArray(ajustes) ? ajustes : []), ...(Array.isArray(transferencias) ? transferencias : [])]
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
        loading: false,
        error: '',
      })
    } catch (cause) {
      setAuthStock(actuales => ({ ...actuales, loading: false, error: cause?.message || 'No se pudieron cargar las autorizaciones de stock.' }))
    }
  }, [inventarioOperativo, canViewAlerts, esDemo])
  const pendientesStock = useMemo(() => authStock.rows.filter((row) => row.status === 'PENDING').length, [authStock.rows])
  // #247 (seguimiento): el primer pintado espera **solo** lo que la lista de
  // Unidades usa (las unidades y el catálogo local). El resto —depósitos,
  // proveedores, alertas y las pestañas de reservas/traslados/eliminados— se
  // hidrata en cuanto el hilo queda libre (o al abrir esa pestaña), así la
  // pantalla deja de pagar seis consultas antes de mostrar la primera fila.
  // Las unidades completas (ficha, verificación, tránsito, conteo…) las piden solo
  // las pestañas que las usan; Unidades, Vendidos y Eliminados salen de
  // GET /api/stock/items y no esperan esta carga.
  const [unidadesPedidas, setUnidadesPedidas] = useState(false)
  const unidadesNecesarias = unidadesPedidas || TABS_CON_UNIDADES.includes(tab)
  const unidadesCargadas = useRef(false)
  const recargarStockRef = useRef(null)
  const detalleRef = useRef(null)
  const refresh = useCallback(async (search, { lista = true } = {}) => {
    if (!inventarioOperativo) { setCargandoUnidades(false); return }
    setBusy(true); setError('')
    if (unidadesNecesarias && !unidadesCargadas.current) setCargandoUnidades(true)
    try {
      const tareas = []
      if (unidadesNecesarias) {
        // #287: la vista puede venir acotada a un producto (desde su ficha).
        tareas.push(resources.inventoryUnits.list(search, 'active', { ...(productoParam ? { productId: productoParam } : {}) }).then((siguientes) => { setUnits(siguientes); unidadesCargadas.current = true }))
      } else if (detalleRef.current?.serial) {
        // La ficha abierta se mantiene al día sin cargar todo el inventario.
        const { id, serial } = detalleRef.current
        tareas.push(resources.inventoryUnits.list(serial, 'active').then((filas) => { const fresca = filas.find((fila) => fila.id === id); if (fresca) setDetalleUnidad((actual) => (actual && actual.id === id ? fresca : actual)) }))
      }
      if (lista) tareas.push(recargarStockRef.current?.())
      setProducts(getProductos())
      await Promise.all(tareas)
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el inventario.') } finally { setBusy(false); setCargandoUnidades(false) }
  }, [inventarioOperativo, productoParam, unidadesNecesarias])
  // La cotización del día ya no bloquea el arranque (#247): entra con los
  // secundarios y, si alguien guarda un costo antes de que llegue, se pide en
  // el momento (ver `guardarCostoRapido`).
  const cargarCotizacion = useCallback(async () => {
    try {
      const valor = await cotizacionReferencia()
      if (valor) { setCotizacion(valor); return valor }
    } catch { /* sin cotización se guarda el monto tal cual */ }
    return null
  }, [])
  const secundariosListos = useRef(false)
  const cargarSecundarios = useCallback(async () => {
    if (!inventarioOperativo || secundariosListos.current) return
    secundariosListos.current = true
    const [nextRemoved, nextReservations, nextTransfers, nextLocations, nextProveedores] = await Promise.all([
      resources.inventoryUnits.list('', 'removed').catch(() => []),
      resources.inventoryReservations.list().catch(() => []),
      resources.transfers.list().catch(() => []),
      resources.stockLocations.list().catch(() => []),
      suppliersApi.list().catch(() => []),
      cargarCotizacion(),
      cargarAutorizacionesStock(),
    ])
    setRemovedUnits(nextRemoved); setReservations(nextReservations); setTransfers(nextTransfers); setLocations(nextLocations)
    setProveedores(Array.isArray(nextProveedores) ? nextProveedores : [])
    loadAlerts()
  }, [inventarioOperativo, loadAlerts, cargarCotizacion, cargarAutorizacionesStock])
  useEffect(() => {
    if (!inventarioOperativo) return undefined
    const agendado = window.requestIdleCallback
      ? window.requestIdleCallback(() => cargarSecundarios(), { timeout: 2500 })
      : window.setTimeout(() => cargarSecundarios(), 800)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(agendado)
      else window.clearTimeout(agendado)
    }
  }, [inventarioOperativo, cargarSecundarios])
  const busquedaDiferida = useBusquedaDiferida(query)
  // Filtros de la lista de Stock: viven en la URL (?tipo=&estado=&sucursal=&proveedor=).
  const filtros = useMemo(() => leerFiltrosStock(searchParams), [searchParams])
  const esListaStock = TABS_LISTA_STOCK.includes(tab)
  const filtrosApi = useMemo(() => {
    const rango = tab === 'vendidos' ? rangoDePeriodo(filtros) : { desde: '', hasta: '' }
    return {
      tipo: filtros.tipo,
      estado: tab === 'vendidos' ? 'vendido' : tab === 'eliminados' ? 'eliminado' : filtros.estado,
      sucursal: filtros.sucursal,
      proveedor: rolVeCosto ? filtros.proveedor : '',
      producto: filtros.producto,
      q: busquedaDiferida,
      desde: rango.desde,
      hasta: rango.hasta,
    }
  }, [tab, filtros, rolVeCosto, busquedaDiferida])
  const stock = useStockItems({ activo: inventarioOperativo && esListaStock, filtros: filtrosApi })
  recargarStockRef.current = stock.recargar
  const cambiarFiltros = useCallback((cambios) => setSearchParams((actuales) => conFiltroStock(actuales, cambios), { replace: true }), [setSearchParams])
  const limpiarFiltros = useCallback(() => setSearchParams((actuales) => sinFiltrosStock(actuales), { replace: true }), [setSearchParams])
  useEffect(() => { refresh(busquedaDiferida, { lista: false }) }, [refresh, busquedaDiferida])
  useEffect(() => { if (qParam) setQuery(qParam) }, [qParam])
  // #287: el producto que acota la vista (nombre para el contexto de la barra).
  const productoFiltro = useMemo(() => {
    if (!productoParam) return null
    const deLista = stock.items.find((item) => item.productId === productoParam)
    const deUnidad = units.find((unit) => unit.productId === productoParam)?.product || (deLista ? { name: deLista.name } : undefined)
    const delCatalogo = getProductos().find((fila) => fila.id === productoParam)
    return { id: productoParam, nombre: deUnidad?.name || delCatalogo?.nombre || delCatalogo?.name || 'Producto' }
  }, [productoParam, units, stock.items])
  useEffect(() => {
    if (!detalleUnidad) return
    // El refresco puede correr con el detalle ya cerrado (current null): sin el
    // guardia, `current.id` tira y la pantalla queda en blanco.
    setDetalleUnidad(current => (current ? units.find(unit => unit.id === current.id) || current : current))
  }, [units]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!apiMode || tab !== 'compartido') return undefined
    let active = true
    setVisibilityError('')
    Promise.all([resources.sharedStock.list().catch(() => []), canManageVisibility ? resources.sharedStock.mine().catch(() => []) : Promise.resolve([])])
      .then(([received, mine]) => { if (active) { setReceivedStock(received); setGrants(mine) } })
      .catch(() => { if (active) setVisibilityError('No se pudo cargar la disponibilidad compartida.') })
    return () => { active = false }
  }, [tab, apiMode, canManageVisibility])
  const tabValido = (value) => INVENTARIO_TABS.includes(value)
  // La URL manda: si cambia por atrás/adelante o por un enlace profundo, la
  // pestaña activa sigue al prop.
  // Abrir una pestaña que necesita datos secundarios los adelanta si el
  // navegador todavía no llegó a hidratarlos en idle.
  useEffect(() => {
    if (['alertas', 'reservas', 'traslados', 'eliminados'].includes(tab)) cargarSecundarios()
    if (tab === 'alertas' && secundariosListos.current && !stockAlerts.alerts?.length) loadAlerts()
  }, [tab, cargarSecundarios, loadAlerts]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tabValido && tabValido(tabProp) && tabProp !== tab) setTab(tabProp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabProp])
  async function saveThreshold(event) {
    event.preventDefault()
    const value = Number(thresholdValue)
    if (!threshold || !Number.isInteger(value) || value < 0 || value > 99999) return
    setBusy(true); setError('')
    try {
      if (esDemo) updateProducto(threshold.id, { reorderPoint: value })
      else await api.patch('/api/products', { id: threshold.id, reorderPoint: value })
      setNotice(`Umbral de ${threshold.name} actualizado a ${value}.`)
      setThreshold(null)
      await loadAlerts()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el umbral.') } finally { setBusy(false) }
  }
  const availableProducts = useMemo(() => products.filter(product => product.branchId), [products])
  // #287: el buscador promete «IMEI, SKU o modelo» y la API ya busca por SKU; el
  // filtro local no lo miraba y las filas desaparecían al llegar por SKU.
  const filtroBusqueda = lista => { const q = query.trim().toLowerCase(); if (!q) return lista; return lista.filter(unit => [unit.serial, unit.product?.name, unit.product?.sku, unit.reservationCustomer, unit.notes, unit.supplierName].some(valor => String(valor || '').toLowerCase().includes(q))) }
  // La unidad sigue acá mientras no haya salido del local: entran reservadas,
  // en revisión y vendidas sin entregar (modo Taller y lotes sobre el inventario).
  const disponibles = filtroBusqueda(units.filter(sigueEnInventario))
  const sinCostoUnits = units.filter(sinCostoUnitario)
  const enTransito = filtroBusqueda(units.filter(unit => unit.status === 'IN_TRANSIT'))
  // Traslado dueño del adjunto al recibir: la unidad en tránsito viene de una
  // línea de transferencia que la incluye entre sus IMEI.
  const transferDeArrival = useMemo(() => arrivalUnit ? transfers.find(item => item.lines?.some(line => Array.isArray(line.serials) && line.serials.includes(arrivalUnit.serial))) : null, [arrivalUnit, transfers])
  const locationsFor = branchId => locations.filter(location => location.branchId === branchId && location.isActive)
  const grantedIds = useMemo(() => new Set(grants.filter(grant => grant.isActive).map(grant => grant.recipientTenant?.id).filter(Boolean)), [grants])
  const receivedBySource = useMemo(() => receivedStock.reduce((acc, row) => { const key = row.sourceTenant || 'Otra empresa'; (acc[key] ||= []).push(row); return acc }, {}), [receivedStock])
  const setAndRefresh = async (operation, success, alFallar) => { setBusy(true); setError(''); setNotice(''); try { await operation(); setNotice(success); await refresh(query); await refrescarCatalogo({ forzar: true }) } catch (cause) { const mensaje = cause?.message || 'No se pudo guardar.'; if (alFallar) alFallar(mensaje); else setError(mensaje) } finally { setBusy(false) } }
  async function search(event) { event.preventDefault(); await refresh(busquedaDiferida) }
  async function exportarUnidades() { setExportando(true); setError(''); try { await descargarCsv('inventory-units', { q: query.trim() || undefined, orden }, 'mobos-inventario-unidades.csv') } catch (cause) { setError(cause?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) } }
  async function verify(unit) { await setAndRefresh(() => resources.inventoryUnits.verify({ serial: unit.serial }), `IMEI ${unit.serial.slice(-4)} verificado.`) }
  // Rack (#240 §4): verificación en serie, un solo refresh y un solo aviso.
  async function verificarLote(lista = []) {
    if (!lista.length) return
    await setAndRefresh(async () => {
      for (const unit of lista) await resources.inventoryUnits.verify({ serial: unit.serial })
    }, `${lista.length} ${lista.length === 1 ? 'unidad verificada' : 'unidades verificadas'}.`)
  }
  // #209: la carga rápida arranca con la última sucursal y depósito usados.
  // Si los catálogos todavía no cargaron se confía en lo recordado (se validó
  // al guardarlo); cuando ya están, se valida que sigan existiendo.
  function abrirReceive() {
    cargarSecundarios()
    setReceiveError('')
    const branchId = !branches.length || branches.some(branch => branch.id === altaSucursalRecordada) ? altaSucursalRecordada : ''
    const locationId = !locations.length || locations.some(location => location.id === altaDepositoRecordado && location.branchId === branchId && location.isActive) ? altaDepositoRecordado : ''
    setReceive(data => ({ ...data, branchId: data.branchId || branchId, locationId: data.locationId || locationId }))
    setReceiveOpen(true)
  }
  // #209: la recepción en tránsito arranca con el último depósito usado.
  function abrirLlegada(unit) {
    const locationId = !locations.length || locations.some(location => location.id === recepcionDepositoRecordado && location.branchId === unit?.branchId && location.isActive) ? recepcionDepositoRecordado : ''
    setArrivalLocationId(locationId)
    setArrivalUnit(unit)
  }
  async function receiveUnit(event) { event.preventDefault(); setReceiveError(''); const lineas = receive.serial.split(/[\n,;]+/).map(normalizeScan).filter(Boolean); const ubicacion = lineas.find((linea) => linea.startsWith('UBI:')); const ubicacionValida = ubicacion && locations.some((location) => location.id === ubicacion.slice(4) && location.branchId === receive.branchId); if (ubicacionValida) setReceive((data) => ({ ...data, locationId: ubicacion.slice(4) })); const serials = lineas.filter((linea) => !linea.startsWith('UBI:')); if (!serials.length) { setReceiveError('Indicá al menos un IMEI/serial.'); return } const locationId = ubicacionValida ? ubicacion.slice(4) : receive.locationId
    // Costo diferido y en la moneda elegida: en Gs el monto es el total; en
    // moneda extranjera va el monto original con la cotización y el backend
    // calcula el total en guaraníes.
    const montoCosto = String(receive.originalCost || '').trim()
    const costo = receive.costCurrency === 'PYG'
      ? { costPyg: montoCosto ? Number(montoCosto) : null, costCurrency: 'PYG' }
      : { originalCost: montoCosto ? Number(montoCosto) : null, costCurrency: receive.costCurrency, ...(String(receive.exchangeRatePyg || '').trim() ? { exchangeRatePyg: Number(receive.exchangeRatePyg) } : {}) }
    await setAndRefresh(async () => {
      await resources.inventoryUnits.create({ ...receive, ...costo, locationId: locationId || null, ...(serials.length === 1 ? { serial: serials[0] } : { serials }), batteryHealth: receive.batteryHealth === '' ? undefined : Number(receive.batteryHealth) })
      if (receive.branchId) recordarAltaSucursal(receive.branchId); if (locationId) recordarAltaDeposito(locationId)
      const proveedorConocido = coincideExacto(proveedores, receive.supplierName); if (proveedorConocido) setRecientesProveedores(recordarProveedorReciente(contextoActual().empresaId, proveedorConocido.id))
      setReceive({ productId: '', serial: '', branchId: receive.branchId, locationId, condition: 'NEW', batteryHealth: '', supplierName: '', costCurrency: 'PYG', originalCost: '', exchangeRatePyg: '', notes: '' }); setReceiveOpen(false)
    }, `${serials.length} ${serials.length === 1 ? 'unidad recibida' : 'unidades recibidas'} y stock actualizado.`, setReceiveError) }
  async function createReservation(event) {
    event.preventDefault()
    const serials = reserve.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean)
    if (!serials.length) return
    const horas = Number(reserve.hours)
    if (!Number.isInteger(horas) || horas < 1 || horas > 24) { setError('La reserva puede durar entre 1 y 24 horas.'); return }
    await setAndRefresh(async () => {
      // La reserva nunca crea clientes: si no existe, queda solo el nombre (o vacío).
      await resources.inventoryReservations.create({
        serials,
        ...(reserve.customerId ? { customerId: reserve.customerId } : {}),
        customerName: reserve.customerName.trim(),
        minutes: horas * 60,
      })
      setReserve({ serials: '', customerName: '', customerId: '', hours: '2' }); setReserveMatches([]); setReserveOpen(false)
    }, `Reserva creada por ${horas} ${horas === 1 ? 'hora' : 'horas'}. Se liberará automáticamente al vencer.`)
  }
  async function releaseReservation(serial) { await setAndRefresh(() => resources.inventoryReservations.release([serial]), 'Reserva liberada y unidad disponible.') }
  async function moveLocation(unit, locationId) {
    if (!unit || (unit.locationId || null) === (locationId || null)) return
    await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'move', locationId }), locationId ? 'Ubicación actualizada.' : 'Unidad sin ubicación.')
  }
  // #216: costo en dólares editable desde la fila (lápiz) con la cotización del día.
  async function guardarCostoRapido(unit, valor) {
    const monto = Number(String(valor || '').replace(',', '.'))
    if (!Number.isFinite(monto) || monto <= 0) { setError('Indicá un costo en dólares mayor a cero.'); return }
    // #247: la cotización se carga diferida; si todavía no llegó, se pide acá.
    const cotizacionActual = Number(cotizacion) > 0 ? Number(cotizacion) : Number(await cargarCotizacion()) || 0
    const rate = cotizacionActual > 0 ? cotizacionActual : undefined
    await setAndRefresh(() => resources.inventoryUnits.update({ id: unit.id, action: 'details', costCurrency: 'USD', originalCost: monto, ...(rate ? { exchangeRatePyg: rate } : {}) }), 'Costo actualizado en dólares.')
  }
  function sellUnit(unit) {
    // Se lleva producto, IMEI y —si la unidad estaba reservada— el cliente, para
    // no volver a buscarlos en Cargar venta.
    try {
      sessionStorage.setItem('mobos:venta-handoff', JSON.stringify({
        productId: unit.productId,
        serial: unit.serial,
        customerName: unit.reservationCustomer || '',
        ts: Date.now(),
      }))
    } catch { /* la venta sigue disponible sin preselección */ }
    window.location.assign('/ventas')
  }
  function startCount() { setUnidadesPedidas(true); setCountSession({ scanning: true, found: new Map(), unknown: [], duplicates: [], flash: null }); setCountOpen(true) }
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
    copiarAlPortapapeles(text || 'Sin faltantes.')
    setNotice(text ? 'Lista de faltantes copiada.' : 'No hay faltantes para copiar.')
  }
  // ── Conteos físicos auditables ──────────────────────────────────────
  // Documento por sucursal con escaneo incremental; la aprobación (con o sin
  // ajuste de stock) la resuelve gerencia desde el backend.
  const [conteos, setConteos] = useState([]), [conteosLoading, setConteosLoading] = useState(false), [conteosError, setConteosError] = useState('')
  const [conteoId, setConteoId] = useState(null), [conteoDetalle, setConteoDetalle] = useState(null), [conteoLoading, setConteoLoading] = useState(false), [conteoError, setConteoError] = useState('')
  const [conteoSerial, setConteoSerial] = useState(''), [conteoFlash, setConteoFlash] = useState(null), [conteoBusy, setConteoBusy] = useState(false)
  const [conteoSinSerie, setConteoSinSerie] = useState({ productId: '', quantity: '1' })
  const [nuevoConteoOpen, setNuevoConteoOpen] = useState(false), [nuevoConteoNota, setNuevoConteoNota] = useState('')
  const [aplicarConteoOpen, setAplicarConteoOpen] = useState(false), [ajustarConteo, setAjustarConteo] = useState(true)
  const [cancelarConteoOpen, setCancelarConteoOpen] = useState(false), [camaraConteoOpen, setCamaraConteoOpen] = useState(false)
  const conteoSerialRef = useRef(null)
  const escanearConteoRef = useRef(null)
  const puedeAplicarConteo = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')
  const cargarConteos = useCallback(async () => {
    if (!apiMode) return
    setConteosLoading(true); setConteosError('')
    try {
      const params = new URLSearchParams()
      if (sucursal?.id) params.set('branchId', sucursal.id)
      const query = params.toString() ? `?${params}` : ''
      setConteos((await api.get(`/api/inventory-counts${query}`)) || [])
    } catch (cause) { setConteosError(cause?.message || 'No se pudieron cargar los conteos.') } finally { setConteosLoading(false) }
  }, [apiMode, sucursal?.id])
  const cargarConteo = useCallback(async (id, silencioso = false) => {
    if (!id || !apiMode) return
    if (!silencioso) setConteoLoading(true)
    setConteoError('')
    try { setConteoDetalle(await api.get(`/api/inventory-counts/${encodeURIComponent(id)}`)) }
    catch (cause) { setConteoError(cause?.message || 'No se pudo cargar el conteo.') }
    finally { if (!silencioso) setConteoLoading(false) }
  }, [apiMode])
  useEffect(() => { if (tab === 'conteos') cargarConteos() }, [tab, cargarConteos])
  useEffect(() => { if (conteoId) cargarConteo(conteoId); else setConteoDetalle(null) }, [conteoId, cargarConteo])
  useEffect(() => { escanearConteoRef.current = escanearConteo })
  useEffect(() => {
    if (!conteoFlash) return undefined
    const timer = window.setTimeout(() => setConteoFlash(null), 2600)
    return () => window.clearTimeout(timer)
  }, [conteoFlash])
  const detectarConteoCamara = useCallback((raw) => { escanearConteoRef.current?.(raw) }, [])
  const cerrarCamaraConteo = useCallback(() => setCamaraConteoOpen(false), [])
  function abrirConteo(item) { setConteoError(''); setConteoSerial(''); setConteoFlash(null); setConteoDetalle(null); setConteoId(item.id) }
  function cerrarConteo() { setConteoId(null); setConteoDetalle(null); setConteoSerial(''); setConteoFlash(null); setConteoError(''); if (apiMode) cargarConteos() }
  async function crearConteo(event) {
    event.preventDefault()
    if (conteoBusy) return
    setConteoBusy(true); setConteosError('')
    try {
      const nota = nuevoConteoNota.trim()
      const creado = await api.post('/api/inventory-counts', { ...(nota ? { note: nota } : {}), ...(sucursal?.id ? { branchId: sucursal.id } : {}) })
      setNuevoConteoOpen(false); setNuevoConteoNota('')
      await cargarConteos()
      setConteoId(creado.id)
      toast.success('Conteo iniciado: escaneá los equipos y aplicalo al terminar.')
    } catch (cause) { setConteosError(cause?.message || 'No se pudo iniciar el conteo.'); setNuevoConteoOpen(false) } finally { setConteoBusy(false) }
  }
  async function escanearConteo(raw) {
    const serial = normalizeScan(raw)
    if (!serial || !conteoId || conteoBusy) return
    if ((conteoDetalle?.lines || []).some(line => line.serial === serial)) { setConteoSerial(''); setConteoFlash({ kind: 'dup', serial }); conteoSerialRef.current?.focus(); return }
    setConteoBusy(true); setConteoError('')
    try {
      const linea = await api.patch('/api/inventory-counts', { id: conteoId, action: 'scan', serial })
      setConteoSerial(''); setConteoFlash({ kind: linea.expected ? 'ok' : 'miss', serial })
      await cargarConteo(conteoId, true)
      conteoSerialRef.current?.focus()
    } catch (cause) { setConteoError(cause?.message || 'No se pudo registrar el escaneo.') } finally { setConteoBusy(false) }
  }
  async function enviarEscaneo(event) { event.preventDefault(); await escanearConteo(conteoSerial) }
  async function sumarSinSerie(event) {
    event.preventDefault()
    const quantity = Number(conteoSinSerie.quantity)
    if (!conteoId || !conteoSinSerie.productId || !Number.isSafeInteger(quantity) || quantity < 1 || conteoBusy) return
    setConteoBusy(true); setConteoError('')
    try {
      await api.patch('/api/inventory-counts', { id: conteoId, action: 'scan', productId: conteoSinSerie.productId, quantity })
      setConteoSinSerie({ productId: '', quantity: '1' })
      await cargarConteo(conteoId, true)
    } catch (cause) { setConteoError(cause?.message || 'No se pudo sumar el producto sin serie.') } finally { setConteoBusy(false) }
  }
  async function aplicarConteo() {
    if (!conteoId || conteoBusy) return
    // #297: sin líneas escaneadas no hay nada que aprobar; el ajuste masivo de
    // faltantes no puede dispararse con el conteo vacío.
    if (!conteoAplicable(conteoDetalle)) { setConteoError('Escaneá al menos un equipo antes de aplicar el conteo.'); setAplicarConteoOpen(false); return }
    setConteoBusy(true); setConteoError('')
    try {
      const resultado = await api.patch('/api/inventory-counts', { id: conteoId, action: 'apply', adjust: ajustarConteo })
      setAplicarConteoOpen(false)
      await Promise.all([cargarConteo(conteoId, true), cargarConteos()])
      await refresh(busquedaDiferida)
      toast.success(ajustarConteo ? `Conteo aplicado: ${resultado.missing} faltante(s) pasaron a defectuoso y el stock se recalculó.` : `Conteo aprobado sin ajustar stock (${resultado.missing} faltante(s)).`)
    } catch (cause) { setConteoError(cause?.message || 'No se pudo aplicar el conteo.'); setAplicarConteoOpen(false) } finally { setConteoBusy(false) }
  }
  async function cancelarConteo() {
    if (!conteoId || conteoBusy) return
    setConteoBusy(true); setConteoError('')
    try {
      await api.patch('/api/inventory-counts', { id: conteoId, action: 'cancel' })
      setCancelarConteoOpen(false)
      await Promise.all([cargarConteo(conteoId, true), cargarConteos()])
      toast.success('Conteo cancelado. El stock no cambió.')
    } catch (cause) { setConteoError(cause?.message || 'No se pudo cancelar el conteo.'); setCancelarConteoOpen(false) } finally { setConteoBusy(false) }
  }
  function openReserveFor(unit) {
    // La reserva se abre sobre el inventario, no detrás del detalle de la unidad.
    setDetalleUnidad(null)
    setReserve({ serials: unit.serial, customerName: '', customerId: '', hours: '2' })
    setReserveMatches([])
    setReserveOpen(true)
  }
  function buscarClienteReserva(texto) {
    setReserve(data => ({ ...data, customerName: texto, customerId: '' }))
    if (reserveTimer.current) clearTimeout(reserveTimer.current)
    reserveTimer.current = setTimeout(async () => {
      const q = texto.trim()
      if (q.length < 2) { setReserveMatches([]); return }
      try { setReserveMatches((await api.get(`/api/customers?q=${encodeURIComponent(q)}`)) || []) } catch { setReserveMatches([]) }
    }, 250)
  }
  // #279 (A4): apartar una unidad que viaja (asignación futura). Queda bloqueada
  // para otras ventas y, al recibirla, el IMEI se vincula solo a esta venta.
  const [apartarPara, setApartarPara] = useState(null)
  const [apartado, setApartado] = useState({ customerName: '', customerId: '', notes: '' })
  const [apartadoMatches, setApartadoMatches] = useState([])
  const apartadoTimer = useRef(null)
  function buscarClienteApartado(texto) {
    setApartado((actual) => ({ ...actual, customerName: texto, customerId: '' }))
    if (apartadoTimer.current) clearTimeout(apartadoTimer.current)
    apartadoTimer.current = setTimeout(async () => {
      const q = texto.trim()
      if (q.length < 2) { setApartadoMatches([]); return }
      try { setApartadoMatches((await api.get(`/api/customers?q=${encodeURIComponent(q)}`)) || []) } catch { setApartadoMatches([]) }
    }, 250)
  }
  function abrirApartado(unit) {
    setApartarPara(unit)
    setApartado({ customerName: unit?.transitAssignment?.customerName || '', customerId: unit?.transitAssignment?.customerId || '', notes: '' })
    setApartadoMatches([])
    setError('')
  }
  async function guardarApartado(event) {
    event.preventDefault()
    if (!apartarPara || busy) return
    const cliente = apartado.customerName.trim()
    await setAndRefresh(async () => {
      await resources.transitAssignments.create({ unitId: apartarPara.id, ...(apartado.customerId ? { customerId: apartado.customerId } : {}), ...(cliente ? { customerName: cliente } : {}), ...(apartado.notes.trim() ? { notes: apartado.notes.trim() } : {}) })
      setApartarPara(null)
      setApartado({ customerName: '', customerId: '', notes: '' })
    }, `Equipo apartado${cliente ? ` para ${cliente}` : ''}: queda bloqueado para otras ventas y al llegar se vincula solo.`)
  }
  async function liberarApartado(unit) {
    if (!unit?.transitAssignment?.id) return
    await setAndRefresh(() => resources.transitAssignments.update({ id: unit.transitAssignment.id, action: 'release' }), `Apartado de ${ultimos4(unit.serial)} liberado.`)
  }
  function unidadesDeTransferencia(transfer) {
    const seriales = new Set((transfer?.lines || []).flatMap(line => line.serials || []))
    return [...units, ...removedUnits].filter(unit => seriales.has(unit.serial))
  }
  async function confirmarRecepcionLote(event) {
    event.preventDefault()
    const transfer = receiveBatch?.transfer
    const seriales = (transfer?.lines || []).flatMap(line => line.serials || [])
    if (!transfer || !seriales.length) { setError('El lote no tiene seriales para recibir.'); return }
    setReceiveBatch(current => ({ ...current, busy: true }))
    try {
      await setAndRefresh(async () => {
        for (const serial of seriales) await resources.inventoryUnits.verify({ serial, ...(receiveBatch.locationId ? { locationId: receiveBatch.locationId } : {}) })
        if (receiveBatch.locationId) recordarRecepcionDeposito(receiveBatch.locationId)
        setReceiveBatch(null)
      }, `Lote recibido: ${seriales.length} equipo(s) disponibles en stock.`)
    } catch (cause) { setError(cause?.message || 'No se pudo recibir el lote.'); setReceiveBatch(current => (current ? { ...current, busy: false } : current)) }
  }
  async function receiveArrival(event) {
    event.preventDefault()
    const unit = arrivalUnit
    if (!unit) return
    const locationId = arrivalLocationId || null
    await setAndRefresh(async () => { await resources.inventoryUnits.verify({ serial: unit.serial, ...(locationId ? { locationId } : {}) }); if (locationId) recordarRecepcionDeposito(locationId); setArrivalUnit(null); setArrivalLocationId('') }, `IMEI ${ultimos4(unit.serial)} recibido en sucursal y disponible en stock.`)
  }
  async function saveLocation(event) {
    event.preventDefault()
    const form = locationForm
    if (!form?.name?.trim() || !form?.branchId) { setError('Sucursal y nombre son obligatorios.'); return }
    await setAndRefresh(async () => {
      const payload = { name: form.name.trim(), code: form.code?.trim() ? form.code.trim() : null, color: form.color || null }
      if (form.id) await resources.stockLocations.update({ id: form.id, ...payload })
      else await resources.stockLocations.create({ branchId: form.branchId, ...payload })
      setLocationForm(null)
    }, form.id ? 'Ubicación actualizada.' : 'Ubicación creada. Ya podés asignarla al recibir o trasladar unidades.')
  }
  async function guardarGuia(event) {
    event.preventDefault()
    const guia = (guiaPara?.guia || '').trim()
    if (!guia || !guiaPara?.id) return
    await setAndRefresh(async () => { await resources.transfers.update({ id: guiaPara.id, aexGuide: guia }); setGuiaPara(null) }, 'Guía AEX adjuntada al traslado.')
  }
  // #218: la ETA del lote se puede ajustar (o quitar) mientras esté en tránsito.
  async function guardarEtaLote(event) {
    event.preventDefault()
    if (!etaPara?.id) return
    await setAndRefresh(async () => { await resources.transfers.update({ id: etaPara.id, eta: etaPara.eta ? `${etaPara.eta}T12:00:00.000Z` : null }); setEtaPara(null) }, etaPara.eta ? 'ETA del lote actualizada.' : 'ETA del lote quitada.')
  }
  // Enlace/QR del remito: el destino confirma la recepción desde el teléfono;
  // regenerar invalida el enlace anterior.
  async function prepararRemitoQr(item) {
    const seq = ++remitoQrSeq.current
    setRemitoQr({ ...item, publicToken: item.publicToken || '' }); setRemitoQrImg(''); setRemitoQrError(''); setRemitoQrBusy(true)
    try {
      const data = await resources.transfers.accessToken(item.id)
      if (seq !== remitoQrSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo preparar el enlace.')
      setRemitoQr(current => current && current.id === item.id ? { ...current, publicToken: token } : current)
      const url = transferReceiveUrlFor(token)
      if (url) setRemitoQrImg(await qrDataUrl(url))
    } catch (cause) {
      if (seq === remitoQrSeq.current) setRemitoQrError(cause?.message || 'No se pudo preparar el enlace.')
    } finally { if (seq === remitoQrSeq.current) setRemitoQrBusy(false) }
  }
  async function regenerarRemitoQr() {
    if (!remitoQr || remitoQrBusy) return
    const seq = ++remitoQrSeq.current
    setRemitoQrBusy(true); setRemitoQrError('')
    try {
      const data = await resources.transfers.accessToken(remitoQr.id, true)
      if (seq !== remitoQrSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo regenerar el enlace.')
      setRemitoQr(current => current ? { ...current, publicToken: token } : current)
      const url = transferReceiveUrlFor(token)
      if (url) setRemitoQrImg(await qrDataUrl(url))
      setNotice('Enlace regenerado: el remito impreso con el QR anterior ya no confirma la recepción.')
    } catch (cause) {
      if (seq === remitoQrSeq.current) setRemitoQrError(cause?.message || 'No se pudo regenerar el enlace.')
    } finally { if (seq === remitoQrSeq.current) setRemitoQrBusy(false) }
  }
  async function copiarRemitoQr() {
    const url = transferReceiveUrlFor(remitoQr?.publicToken)
    if (!url) return
    if (await copiarAlPortapapeles(url)) setNotice('Enlace del remito copiado al portapapeles.'); else setRemitoQrError('No se pudo copiar el enlace.')
  }
  async function cotizarEnvio(item) {
    setEnvioAex({ transferId: item.id, pesoKg: '1', quotes: null, busy: true, unconfigured: false, webUrl: '', resultado: null })
    try {
      const resultado = await api.post('/api/aex/ship', { transferId: item.id, pesoKg: 1 })
      if (resultado?.unconfigured) { setEnvioAex(current => ({ ...current, busy: false, unconfigured: true, webUrl: resultado.webUrl })); window.open(resultado.webUrl, '_blank', 'noopener,noreferrer'); return }
      setEnvioAex(current => ({ ...current, busy: false, quotes: resultado?.quotes || [], origen: resultado?.origen, destino: resultado?.destino }))
    } catch (cause) { setError(cause?.message || 'No se pudo cotizar el envío.'); setEnvioAex(null) }
  }
  async function confirmarEnvio(event) {
    event.preventDefault()
    if (!envioAex?.transferId || envioAex.busy) return
    setEnvioAex(current => ({ ...current, busy: true }))
    try {
      const resultado = await api.post('/api/aex/ship', { transferId: envioAex.transferId, pesoKg: Number(envioAex.pesoKg) || 1, confirm: true })
      if (resultado?.unavailable) { setEnvioAex(current => ({ ...current, busy: false, unavailable: true, webUrl: resultado.webUrl })); return }
      setEnvioAex(null)
      setNotice(`Envío AEX confirmado. Guía ${resultado.guide} · ${gs(resultado.costPyg)} · ${resultado.serviceName}`)
      await refresh()
    } catch (cause) { setError(cause?.message || 'No se pudo confirmar el envío.'); setEnvioAex(null) }
  }
  async function seguirGuia(item) {
    setTracking({ guia: item.aexGuide, loading: true, unconfigured: false, webUrl: '', events: [] })
    try {
      const resultado = await api.get(`/api/aex/tracking?guia=${encodeURIComponent(item.aexGuide)}`)
      if (resultado?.unconfigured) {
        setTracking(current => ({ ...current, loading: false, unconfigured: true, webUrl: resultado.webUrl }))
        window.open(resultado.webUrl, '_blank', 'noopener,noreferrer')
      } else {
        setTracking({ guia: item.aexGuide, loading: false, unconfigured: false, webUrl: resultado?.webUrl || '', events: resultado?.events || [] })
      }
    } catch (cause) { setError(cause?.message || 'No se pudo consultar el seguimiento.'); setTracking(null) }
  }
  // Etiqueta/guía AEX: el PDF lo genera AEX y lo descarga el servidor (la
  // clave privada nunca llega al navegador). Se abre en una pestaña para que el
  // diálogo de impresión del sistema elija la etiqueta térmica o el A4.
  function abrirEtiquetaAex(item) {
    setEtiquetaAex({ guia: item.aexGuide, formato: 'etiqueta8x6', partida: false, busy: false, error: '', unconfigured: false, webUrl: '' })
  }
  async function imprimirEtiquetaAex(event) {
    event.preventDefault()
    const actual = etiquetaAex
    if (!actual?.guia || actual.busy) return
    setEtiquetaAex(current => ({ ...current, busy: true, error: '', unconfigured: false }))
    try {
      const query = new URLSearchParams({ guia: actual.guia, formato: actual.formato, ...(actual.partida ? { partida: '1' } : {}) })
      const response = await apiFetch(`/api/aex/label?${query}`)
      const tipo = response.headers.get('content-type') || ''
      if (!response.ok || !tipo.includes('application/pdf')) {
        const data = tipo.includes('application/json') ? await response.json() : null
        if (data?.unconfigured) {
          setEtiquetaAex(current => ({ ...current, busy: false, unconfigured: true, webUrl: data.webUrl || '' }))
          window.open(data.webUrl, '_blank', 'noopener,noreferrer')
          return
        }
        throw new Error(data?.message || 'AEX no pudo generar la etiqueta.')
      }
      const url = URL.createObjectURL(await response.blob())
      const abierta = window.open(url, '_blank', 'noopener,noreferrer')
      if (!abierta) {
        const link = document.createElement('a')
        link.href = url
        link.download = `aex-${actual.guia}.pdf`
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setEtiquetaAex(null)
      setNotice(`Etiqueta de la guía ${actual.guia} lista para imprimir.`)
    } catch (cause) {
      setEtiquetaAex(current => ({ ...current, busy: false, error: cause?.message || 'No se pudo descargar la etiqueta.' }))
    }
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
  detalleRef.current = detalleUnidad
  // Abre la ficha de una fila de la lista: la unidad completa se pide por su
  // serial (la lista no trae toda la ficha) y se mantiene al día en cada refresco.
  async function abrirDetalleItem(item) {
    if (!item || item.kind !== 'unit') return
    const local = units.find((unit) => unit.id === item.id)
    if (local) { setDetalleUnidad(local); return }
    setError('')
    try {
      const filas = await resources.inventoryUnits.list(item.serial, item.status === 'eliminado' ? 'removed' : 'active')
      const unidad = filas.find((fila) => fila.id === item.id)
      if (unidad) setDetalleUnidad(unidad)
      else setError('No se pudo abrir la ficha de la unidad. Actualizá la lista e intentá de nuevo.')
    } catch (cause) {
      console.error('[stock] no se pudo abrir la ficha', cause)
      setError(cause?.message || 'No se pudo abrir la ficha de la unidad.')
    }
  }
  // U4b: imprime (o previsualiza) las etiquetas de las filas elegidas con la
  // misma función pura que arma el trabajo de impresora y el PDF. Los mensajes
  // de EtiquetasStockError se muestran tal cual.
  async function imprimirEtiquetasSeleccion(items = itemsElegidos(), { vistaPrevia = false } = {}) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const filas = filasEtiquetasDeItems(items, products)
      if (vistaPrevia) {
        const { pdf, html, total } = await vistaPreviaEtiquetasPdf(filas)
        const url = URL.createObjectURL(pdf || new Blob([html], { type: 'text/html' }))
        const abierta = window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(url), 60000)
        if (abierta) setNotice(`Vista previa de ${total} ${total === 1 ? 'etiqueta' : 'etiquetas'}.`)
        else setError('El navegador bloqueó la vista previa. Permití las ventanas emergentes para este sitio.')
        return
      }
      const { total, resultados } = await imprimirEtiquetasStock(filas)
      const fallido = resultados.find(({ resultado }) => !resultado?.ok) || resultados.find(({ resultado }) => resultado?.encolado)
      if (fallido) avisarImpresion(fallido.resultado, 'Etiquetas', 'f')
      else setNotice(`${total} ${total === 1 ? 'etiqueta enviada' : 'etiquetas enviadas'} a la impresora.`)
    } catch (cause) {
      if (cause instanceof EtiquetasStockError) setError(cause.message)
      else { console.error('[stock] etiquetas', cause); setError(cause?.message || 'No se pudieron preparar las etiquetas.') }
    } finally {
      setBusy(false)
    }
  }
  function cambiarTab(next) {
    if (!tabValido(next)) return
    setTab(next)
    // Conteos y Autorizaciones viven solo en esta pantalla: el slug no está en
    // la whitelist del panel (la navegación de pestañas la lleva POS en #332),
    // así que no se navega y la URL conserva la pestaña anterior.
    if (next !== 'conteos' && next !== 'autorizaciones') onTabChange?.(next)
  }
  // #305: grupo activo derivado de la pestaña (los enlaces directos siguen
  // funcionando) y sus vistas visibles.
  const grupos = useMemo(
    () => GRUPOS_INVENTARIO.map((grupo) => ({ ...grupo, tabs: grupo.tabs.filter((id) => (id !== 'alertas' && id !== 'autorizaciones') || canViewAlerts) })),
    [canViewAlerts],
  )
  function requestReason(kind, unitOrUnits) {
    const units = Array.isArray(unitOrUnits) ? unitOrUnits : [unitOrUnits]
    const unit = units[0]
    const esBaja = kind === 'remove'
    const habilita = kind === 'adjust' && unit?.status === 'DEFECTIVE'
    const opciones = esBaja ? MOTIVOS_BAJA : MOTIVOS_REVISION
    const recordado = esBaja ? motivoBajaRecordado : motivoRevisionRecordado
    setReason('')
    setReasonKind(!habilita && opciones.includes(recordado) ? recordado : '')
    setReasonAction({ kind, units, unit })
  }
  async function applyReason(event) {
    event.preventDefault()
    if (!reason.trim() || !reasonAction) return
    const { kind, units = [], unit } = reasonAction
    const objetivos = units.length ? units : [unit]
    const motivo = reasonKind ? `${reasonKind}: ${reason.trim()}` : reason.trim()
    if (kind === 'remove' && reasonKind) recordarMotivoBaja(reasonKind)
    if (kind === 'adjust' && reasonKind && objetivos[0]?.status !== 'DEFECTIVE') recordarMotivoRevision(reasonKind)
    for (const target of objetivos) {
      const lastFour = ultimos4(target.serial)
      if (kind === 'adjust') {
        const status = target.status === 'DEFECTIVE' ? 'AVAILABLE' : 'DEFECTIVE'
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'adjust', status, reason: motivo }), `IMEI ${lastFour} marcado como ${status === 'DEFECTIVE' ? 'en revisión' : 'disponible'}.`)
      } else if (kind === 'remove') {
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'remove', reason: motivo }), `IMEI ${lastFour} retirado. Podés restaurarlo desde Eliminados.`)
      } else {
        await setAndRefresh(() => resources.inventoryUnits.update({ id: target.id, action: 'restore', reason: reason.trim() }), `IMEI ${lastFour} restaurado a disponible.`)
      }
    }
    setReasonAction(null)
  }
  async function createTransfer(event) {
    event.preventDefault()
    // #297: submit inválido bloqueado con las mismas reglas del botón.
    if (!controlTransferencia.intentar().valido) return
    const serials = transfer.serials.split(/[\n,;]+/).map(normalizeScan).filter(Boolean)
    await setAndRefresh(async () => { await resources.transfers.create({ ...transfer, destinationLocationId: transfer.destinationLocationId || null, eta: transfer.eta ? `${transfer.eta}T12:00:00.000Z` : null, lines: [{ productId: transfer.productId, quantity: serials.length, serials }], ...(transferAuth && !puedeTransferirSinAuth ? { transferAuthorizationId: transferAuth.id } : {}) }); setTransfer({ sourceBranchId: '', destinationBranchId: '', destinationLocationId: '', productId: '', serials: '', notes: '', eta: '' }); setTransferAuth(null); controlTransferencia.limpiar(); setTransferOpen(false) }, 'Transferencia registrada con trazabilidad por IMEI.')
  }
  return {
    searchParams,
    setSearchParams,
    qParam,
    productoParam,
    products,
    setProducts,
    units,
    setUnits,
    removedUnits,
    setRemovedUnits,
    reservations,
    setReservations,
    transfers,
    setTransfers,
    locations,
    setLocations,
    cargandoUnidades,
    setCargandoUnidades,
    apiMode,
    sesion,
    sucursal,
    sucursales,
    esDemo,
    branches,
    navigate,
    inventarioOperativo,
    canViewAlerts,
    canManageLocations,
    canManageVisibility,
    tab,
    setTab,
    query,
    setQuery,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    orden,
    recordarOrden,
    exportando,
    setExportando,
    stockAlerts,
    setStockAlerts,
    authStock,
    setAuthStock,
    toast,
    seleccionados,
    setSeleccionados,
    crearVariante,
    setCrearVariante,
    modeloNuevo,
    setModeloNuevo,
    gondolaOpen,
    setGondolaOpen,
    unidadesElegidas,
    copiarImeis,
    venderTodos,
    exportarUnidadesSeleccionadas,
    alertsLoading,
    setAlertsLoading,
    alertsError,
    setAlertsError,
    threshold,
    setThreshold,
    thresholdValue,
    setThresholdValue,
    detalleUnidad,
    setDetalleUnidad,
    informeDe,
    setInformeDe,
    certificadoDe,
    setCertificadoDe,
    constanciaDe,
    setConstanciaDe,
    vistaUbicaciones,
    cambiarVistaUbicaciones,
    esMovil,
    motivoBajaRecordado,
    recordarMotivoBaja,
    motivoRevisionRecordado,
    recordarMotivoRevision,
    altaSucursalRecordada,
    recordarAltaSucursal,
    altaDepositoRecordado,
    recordarAltaDeposito,
    recepcionDepositoRecordado,
    recordarRecepcionDeposito,
    scannerOpen,
    setScannerOpen,
    receiveOpen,
    setReceiveOpen,
    reserveOpen,
    setReserveOpen,
    transferOpen,
    setTransferOpen,
    reasonAction,
    setReasonAction,
    reason,
    setReason,
    reasonKind,
    setReasonKind,
    arrivalUnit,
    setArrivalUnit,
    arrivalLocationId,
    setArrivalLocationId,
    receiveBatch,
    setReceiveBatch,
    countOpen,
    setCountOpen,
    countSession,
    setCountSession,
    receive,
    setReceive,
    receiveError,
    setReceiveError,
    proveedores,
    setProveedores,
    recientesProveedores,
    setRecientesProveedores,
    cotizacion,
    setCotizacion,
    reserve,
    setReserve,
    reserveMatches,
    setReserveMatches,
    reserveTimer,
    guiaPara,
    setGuiaPara,
    etaPara,
    setEtaPara,
    remitoQr,
    setRemitoQr,
    remitoQrImg,
    setRemitoQrImg,
    remitoQrBusy,
    setRemitoQrBusy,
    remitoQrError,
    setRemitoQrError,
    remitoQrSeq,
    tracking,
    setTracking,
    etiquetaAex,
    setEtiquetaAex,
    envioAex,
    setEnvioAex,
    transfer,
    setTransfer,
    transferAuth,
    setTransferAuth,
    locationForm,
    setLocationForm,
    recipientQuery,
    setRecipientQuery,
    recipientResults,
    setRecipientResults,
    searchingRecipient,
    setSearchingRecipient,
    recipientError,
    setRecipientError,
    grants,
    setGrants,
    receivedStock,
    setReceivedStock,
    visibilityError,
    setVisibilityError,
    avisarImpresion,
    imprimirComprobanteRapido,
    puedeTransferirSinAuth,
    transferSerials,
    controlTransferencia,
    loadAlerts,
    cargarAutorizacionesStock,
    pendientesStock,
    refresh,
    cargarCotizacion,
    secundariosListos,
    cargarSecundarios,
    busquedaDiferida,
    productoFiltro,
    tabValido,
    saveThreshold,
    availableProducts,
    filtroBusqueda,
    disponibles,
    sinCostoUnits,
    enTransito,
    stock,
    filtros,
    cambiarFiltros,
    limpiarFiltros,
    rolVeCosto,
    esListaStock,
    itemsElegidos,
    setUnidadesPedidas,
    abrirDetalleItem,
    imprimirEtiquetasSeleccion,
    transferDeArrival,
    locationsFor,
    grantedIds,
    receivedBySource,
    setAndRefresh,
    search,
    exportarUnidades,
    verify,
    verificarLote,
    abrirReceive,
    abrirLlegada,
    receiveUnit,
    createReservation,
    releaseReservation,
    moveLocation,
    guardarCostoRapido,
    sellUnit,
    startCount,
    countScan,
    countMissing,
    copyMissing,
    conteos,
    setConteos,
    conteosLoading,
    setConteosLoading,
    conteosError,
    setConteosError,
    conteoId,
    setConteoId,
    conteoDetalle,
    setConteoDetalle,
    conteoLoading,
    setConteoLoading,
    conteoError,
    setConteoError,
    conteoSerial,
    setConteoSerial,
    conteoFlash,
    setConteoFlash,
    conteoBusy,
    setConteoBusy,
    conteoSinSerie,
    setConteoSinSerie,
    nuevoConteoOpen,
    setNuevoConteoOpen,
    nuevoConteoNota,
    setNuevoConteoNota,
    aplicarConteoOpen,
    setAplicarConteoOpen,
    ajustarConteo,
    setAjustarConteo,
    cancelarConteoOpen,
    setCancelarConteoOpen,
    camaraConteoOpen,
    setCamaraConteoOpen,
    conteoSerialRef,
    escanearConteoRef,
    puedeAplicarConteo,
    cargarConteos,
    cargarConteo,
    detectarConteoCamara,
    cerrarCamaraConteo,
    abrirConteo,
    cerrarConteo,
    crearConteo,
    escanearConteo,
    enviarEscaneo,
    sumarSinSerie,
    aplicarConteo,
    cancelarConteo,
    openReserveFor,
    buscarClienteReserva,
    apartarPara,
    setApartarPara,
    apartado,
    setApartado,
    apartadoMatches,
    setApartadoMatches,
    apartadoTimer,
    buscarClienteApartado,
    abrirApartado,
    guardarApartado,
    liberarApartado,
    unidadesDeTransferencia,
    confirmarRecepcionLote,
    receiveArrival,
    saveLocation,
    guardarGuia,
    guardarEtaLote,
    prepararRemitoQr,
    regenerarRemitoQr,
    copiarRemitoQr,
    cotizarEnvio,
    confirmarEnvio,
    seguirGuia,
    abrirEtiquetaAex,
    imprimirEtiquetaAex,
    toggleLocation,
    searchRecipients,
    setGrant,
    cambiarTab,
    grupos,
    requestReason,
    applyReason,
    createTransfer,
  }
}
