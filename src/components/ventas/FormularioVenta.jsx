import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import {
  getProductos,
  productosById,
  addProducto,
  addProductoApi,
  updateProducto,
  addVenta,
  guardarOrdenApi,
  contextoActual,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from '@/lib/storage'
import { leerCarrito, guardarCarrito, borrarCarrito, lineasParaResumen } from '@/lib/posCart'
import { leerDemo, guardarDemo } from '@/lib/demoStorage.js'
import { encolarVenta } from '@/lib/offline/ventas'
import { descartarPreCliente } from '@/lib/preClientes'
import { normalizarNombre } from '@/utils/nombre'
import { codigoPedido } from '@/utils/pedido'
import { esErrorDeRed } from '@/lib/offline/queue'
import { fechaClave, num, gs } from '@/utils/calculos'
import { allocateCheckout } from '@/utils/checkout'
import { tradeInDraftPayment } from '@/utils/tradeInCheckout'
import { validateDemoPromotionItems, recordDemoPromotionUsage } from '@/lib/demoPromotions'
import { clientesDemoGuardados, guardarClienteDemo } from '@/lib/demoClientes'
import { resources } from '@/lib/api'
import { api } from '@/lib/api/client'
import { agruparProductos } from '@/utils/colores'
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  Modal,
} from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { parsePercent } from '@/components/shared/PercentField'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import { accountPayment } from './PaymentAccountFields'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
import ColaOffline from './ColaOffline'
import AnalyticsPos from './AnalyticsPos'
import { whatsappTrackingLink } from './PagosPedido'
import { telefonoValido, MENSAJE_TELEFONO } from '@/utils/telefono'
import SerialUnitPicker from '@/components/inventory/SerialUnitPicker'
import PasoProductos from './venta/PasoProductos'
import PasoCarrito from './venta/PasoCarrito'
import PasoCobro from './venta/PasoCobro'

// Recuerda el último vendedor elegido en esta compu, para no re-seleccionarlo
// en cada venta (suelen ser ráfagas de la misma persona).
const ULTIMO_VENDEDOR = 'fono:ultimoVendedor'

// Montos en ₲ son enteros y se escriben con puntos de miles ("20.000"). Tomamos
// solo los dígitos para no confundir el punto con un decimal (evita 20.000 20).
const gsNum = v => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

const VACIO = vendedorId => ({
  vendedorId: vendedorId || '',
  cliente: '',
  productoId: '',
  estadoPago: ESTADOS_PAGO[0],
  fecha: fechaClave(),
  fechaManual: false, // true si el usuario eligió una fecha distinta a mano
  precio: '',
  couponCode: null,
  soldWithoutInsurance: false,
  serials: [],
  medioPago: MEDIOS_PAGO[0],
  entrega: ENTREGA[0],
  montoDelivery: '',
  observacion: '',
  specialOrder: false,
  expectedAt: '',
})

const PAGO_VACIO = { medioPago: MEDIOS_PAGO[0], cuenta: '', monto: '' }

function Atajo({ k, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-ink-500 bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-fono-light">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  )
}

// Recupera el carrito persistido de esta empresa/sucursal. Las líneas que ya
// no corresponden a un producto activo se descartan en silencio para que un
// carrito viejo no rompa el formulario.
function leerCarritoInicial() {
  try {
    const { empresaId, sucursalId } = contextoActual()
    if (!empresaId) return null
    const guardado = leerCarrito(empresaId, sucursalId)
    if (!guardado) return null
    const prods = productosById()
    const items = Array.isArray(guardado.items)
      ? guardado.items
          .filter(it => it && prods[it.productoId])
          .map(it => ({
            ...it,
            nombre: prods[it.productoId].nombre,
            quantity: Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 1,
            serials: Array.isArray(it.serials) ? it.serials : [],
          }))
      : []
    const customer =
      guardado.customer && typeof guardado.customer === 'object' ? guardado.customer : null
    return {
      items,
      customer: customer
        ? {
            name: '',
            phone: '',
            countryCode: '+595',
            email: '',
            document: '',
            addresses: [],
            ...customer,
            addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
          }
        : null,
      descuento:
        guardado.descuento !== undefined && guardado.descuento !== null
          ? String(guardado.descuento)
          : '',
      pagos: Array.isArray(guardado.pagos) ? guardado.pagos : [],
      entrega: guardado.entrega,
      montoDelivery: typeof guardado.montoDelivery === 'string' ? guardado.montoDelivery : '',
      observacion: typeof guardado.observacion === 'string' ? guardado.observacion : '',
    }
  } catch {
    return null
  }
}

const CLIENTE_VACIO = {
  name: '',
  phone: '',
  countryCode: '+595',
  email: '',
  document: '',
  addresses: [],
}

// Cliente guardado (carrito local o venta suspendida): completa los campos que
// el formulario espera para que un registro viejo no lo rompa.
function clienteGuardado(valor) {
  if (!valor || typeof valor !== 'object') return { ...CLIENTE_VACIO }
  return {
    ...CLIENTE_VACIO,
    ...valor,
    addresses: Array.isArray(valor.addresses) ? valor.addresses : [],
  }
}

// Líneas recuperadas de una venta suspendida: se descartan las que no tienen
// producto y se normalizan cantidad, seriales y clave de fila. El resto de los
// campos viaja tal cual (precio manual, cupón, combo, descuentos, etc.).
function itemsGuardados(valor) {
  if (!Array.isArray(valor)) return []
  return valor
    .filter(it => it && typeof it === 'object' && it.productoId)
    .map((it, index) => ({
      ...it,
      key: typeof it.key === 'string' && it.key ? it.key : `suspendida-${Date.now()}-${index}`,
      nombre: typeof it.nombre === 'string' ? it.nombre : '',
      precio: Number(it.precio) || 0,
      quantity: Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 1,
      serials: Array.isArray(it.serials) ? it.serials.filter(serial => typeof serial === 'string') : [],
    }))
}

// Resumen fijo de la venta: total, cantidades, ajustes y el día del vendedor en
// una tira compacta que cruza las dos columnas en desktop. En pantallas
// angostas queda al pie (después del cobro) y la barra superior sigue siendo el
// acceso rápido al carrito.
function ResumenVenta({ totalGeneral, items, unidades, montoDescuento, montoDelivery, dia }) {
  return (
    <section
      data-testid="resumen-compra"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-fono/30 bg-ink-800 px-4 py-3 shadow-lg shadow-black/10"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
          Total de esta venta
        </span>
        <span className="text-2xl font-extrabold tracking-tight tabular-nums text-fore">
          {gs(totalGeneral)}
        </span>
        <span className="text-xs text-mute">
          {items.length} {items.length === 1 ? 'producto' : 'productos'} · {unidades}{' '}
          {unidades === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      {montoDescuento > 0 && (
        <span className="text-xs font-semibold text-warn">Descuento − {gs(montoDescuento)}</span>
      )}
      {montoDelivery > 0 && (
        <span className="text-xs text-mute">Entrega + {gs(montoDelivery)}</span>
      )}
      {items.length === 0 && (
        <span className="text-xs text-mute">Agregá productos para empezar la venta.</span>
      )}
      {dia && dia.cant > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs lg:ml-auto">
          <span className="font-bold uppercase tracking-wider text-mute">Tu día</span>
          <span className="text-mute">
            {dia.cant} {dia.cant === 1 ? 'venta' : 'ventas'} ·{' '}
            {dia.cant} {dia.cant === 1 ? 'pedido' : 'pedidos'}
          </span>
          <span className="text-mute">
            Facturación <b className="tabular-nums text-fore">{gs(dia.total)}</b>
          </span>
        </div>
      )}
    </section>
  )
}

export default function FormularioVenta({
  onGuardado,
  onCarrito,
  resumenDia,
  tradeInDraft,
  onTradeInConsumed,
}) {
  const { sesion, esDemo, empresa } = useSesion()
  const navigate = useNavigate()
  const puedeDescontar = esDemo || ['dueno', 'GERENTE'].includes(sesion?.rol)
  const productos = getProductos().filter(p => p.activo)
  const familias = agruparProductos(productos)
  // Carrito persistido: se restaura una sola vez al montar el formulario.
  const [cartInicial] = useState(() => leerCarritoInicial())
  const [f, setF] = useState(() => ({
    ...VACIO(sesion?.vendedorId || leerDemo(ULTIMO_VENDEDOR)),
    ...(cartInicial?.customer?.name ? { cliente: cartInicial.customer.name } : {}),
    ...(ENTREGA.includes(cartInicial?.entrega) ? { entrega: cartInicial.entrega } : {}),
    ...(cartInicial?.montoDelivery ? { montoDelivery: cartInicial.montoDelivery } : {}),
    ...(cartInicial?.observacion ? { observacion: cartInicial.observacion } : {}),
  }))
  const [customer, setCustomer] = useState(
    () =>
      cartInicial?.customer || {
        name: '',
        phone: '',
        countryCode: '+595',
        email: '',
        document: '',
        addresses: [],
      },
  )
  const [nuevoProd, setNuevoProd] = useState(false)
  const puedeCrearProducto = esDemo || Boolean(sesion?.esPropietario) || ['ADMIN', 'GERENTE'].includes(sesion?.rol)
  const [nombreProd, setNombreProd] = useState('')
  const [coloresNuevos, setColoresNuevos] = useState([])
  const [colorInput, setColorInput] = useState('')
  // Detalles del producto nuevo del POS: categoría, condición, precios y costo.
  const [nuevoDetalles, setNuevoDetalles] = useState({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '' })
  const [creandoProd, setCreandoProd] = useState(false)
  const [combos, setCombos] = useState([])
  const [noticeCombo, setNoticeCombo] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  // Fila de la venta cuyo selector de IMEI está abierto.
  const [imeiPara, setImeiPara] = useState(null)
  const [unidadesDeImei, setUnidadesDeImei] = useState(0)
  const [ok, setOk] = useState(false)
  const [items, setItems] = useState(() =>
    Array.isArray(cartInicial?.items) ? cartInicial.items : [],
  ) // carrito: varios productos del mismo cliente
  const [descuento, setDescuento] = useState(() => cartInicial?.descuento || '')
  // Autorización DISCOUNT vigente que cubre el descuento global del carrito
  // (solo para vendedores sin permiso de aprobar descuentos).
  const [authDescuento, setAuthDescuento] = useState(null)
  const onAuthDescuento = useCallback(auth => setAuthDescuento(auth), [])
  // Autorización BELOW_LIST_PRICE vigente que cubre la diferencia entre el
  // precio de lista y el precio manual cargado en las líneas.
  const [authPrecio, setAuthPrecio] = useState(null)
  const [pagos, setPagos] = useState(() =>
    Array.isArray(cartInicial?.pagos) ? cartInicial.pagos : [],
  )
  const [errorVenta, setErrorVenta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cuentas, setCuentas] = useState(null)
  const [errorCuentas, setErrorCuentas] = useState('')
  const [intentoCuentas, setIntentoCuentas] = useState(0)
  // Venta a crédito: plazo en días y límite del cliente.
  const [venderACredito, setVenderACredito] = useState(false)
  const [creditoDias, setCreditoDias] = useState('')
  // Factura a otro titular (esposo/a, padre, empresa) con RUC.
  const [billingTo, setBillingTo] = useState({ name: '', document: '' })
  const [lastOrder, setLastOrder] = useState(null)
  const [comprobante, setComprobante] = useState(false)
  const guardadoEnCurso = useRef(false)
  const [guardadoIncompleto, setGuardadoIncompleto] = useState(false)
  // Misma clave idempotente para todos los reintentos de una misma venta;
  // se regenera recién cuando la venta quedó confirmada.
  const idempotencyKeyRef = useRef(null)
  const usaCuentas = Boolean(cuentas?.length)
  const appliedTradeIn = useRef(null)

  // Ventas suspendidas (carrito en espera): lista de la sucursal, alta con
  // etiqueta opcional, recuperación y descarte.
  const [suspendidasOpen, setSuspendidasOpen] = useState(false)
  const [suspendidas, setSuspendidas] = useState([])
  const [cargandoSuspendidas, setCargandoSuspendidas] = useState(false)
  const [errorSuspendidas, setErrorSuspendidas] = useState('')
  const [suspenderOpen, setSuspenderOpen] = useState(false)
  const [labelSuspender, setLabelSuspender] = useState('')
  const [errorSuspender, setErrorSuspender] = useState('')
  const [suspendiendo, setSuspendiendo] = useState(false)
  const [recuperarPendiente, setRecuperarPendiente] = useState(null)
  // Aviso de disponibilidad al retomar un borrador: productos que ya no tienen
  // stock para la cantidad pedida, con salida "volver" o "vender igualmente".
  const [stockPendiente, setStockPendiente] = useState(null)
  // Enlace público del borrador recién generado (se muestra una sola vez).
  const [enlacePublico, setEnlacePublico] = useState(null)
  const [avisoEnlace, setAvisoEnlace] = useState('')
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  // Producto leído por el escáner: se muestra y se agrega recién al confirmar
  // (evita sumar al carrito por una lectura accidental).
  const [escaneado, setEscaneado] = useState(null)
  const [descartarPendiente, setDescartarPendiente] = useState(null)
  const [descartando, setDescartando] = useState(false)
  const [avisoSuspension, setAvisoSuspension] = useState('')
  // Aviso de la última venta que quedó en la cola local por falta de conexión.
  const [avisoOffline, setAvisoOffline] = useState('')
  const [avisoDemoSuspendidas, setAvisoDemoSuspendidas] = useState(false)

  useEffect(() => {
    if (!tradeInDraft || !cuentas || appliedTradeIn.current === tradeInDraft.id) return
    try {
      const payment = tradeInDraftPayment(tradeInDraft, cuentas, pagos)
      appliedTradeIn.current = tradeInDraft.id
      setPagos(current => [...current, payment])
      setErrorVenta('')
      onTradeInConsumed?.()
    } catch (error) {
      setErrorVenta(error.message)
    }
  }, [tradeInDraft, cuentas, pagos, onTradeInConsumed])

  useEffect(() => {
    let vigente = true
    setCuentas(null)
    setErrorCuentas('')
    Promise.resolve()
      .then(() => getPaymentAccounts())
      .then(result => {
        if (!Array.isArray(result)) throw new Error('Respuesta inválida al cargar cuentas.')
        if (vigente) setCuentas(result)
      })
      .catch(error => {
        if (vigente)
          setErrorCuentas(error?.message || 'No se pudieron cargar las cuentas de cobro.')
      })
    return () => {
      vigente = false
    }
  }, [esDemo, intentoCuentas])

  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))

  // Unidad preseleccionada desde Inventario (botón Vender): se restaura una
  // sola vez y el vendedor completa el precio de venta.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('mobos:venta-handoff')
      if (!raw) return
      const handoff = JSON.parse(raw)
      sessionStorage.removeItem('mobos:venta-handoff')
      if (!handoff?.productId || Date.now() - (Number(handoff.ts) || 0) > 10 * 60 * 1000) return
      const product = productos.find(p => p.id === handoff.productId)
      if (!product) return
      const serial = typeof handoff.serial === 'string' && handoff.serial.trim() ? handoff.serial.trim() : ''
      agregarProducto(product)
      if (serial) {
        setItems(arr => arr.map(it => (it.productoId === product.id ? { ...it, serials: [serial] } : it)))
      }
      // Reserva desde Inventario: el cliente queda precargado (y la búsqueda lo ofrece).
      const clienteReserva = typeof handoff.customerName === 'string' ? handoff.customerName.trim() : ''
      if (clienteReserva) {
        setCustomer(current => ({ ...current, name: clienteReserva }))
        setF(current => ({ ...current, cliente: clienteReserva }))
      }
    } catch { /* handoff corrupto: se ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos])

  // Persiste la venta a medio armar (productos, cliente, pagos, descuento y
  // entrega) para recuperarla si se recarga la página o se cambia de vendedor.
  // Un carrito vacío se borra para no dejar basura en localStorage.
  useEffect(() => {
    const { empresaId, sucursalId } = contextoActual()
    if (!empresaId) return
    const vacio =
      items.length === 0 &&
      pagos.length === 0 &&
      !descuento &&
      f.entrega === ENTREGA[0] &&
      !f.montoDelivery &&
      !f.observacion &&
      !(
        customer.name ||
        customer.phone ||
        customer.email ||
        customer.document ||
        customer.addresses?.length
      )
    if (vacio) {
      borrarCarrito(empresaId, sucursalId)
      return
    }
    guardarCarrito(empresaId, sucursalId, {
      items,
      customer,
      descuento,
      pagos,
      entrega: f.entrega,
      montoDelivery: f.montoDelivery,
      observacion: f.observacion,
    })
  }, [items, customer, descuento, pagos, f.entrega, f.montoDelivery, f.observacion])

  // Si cambia el día (o se corrige el reloj) con la app abierta, resincroniza la
  // fecha a HOY, salvo que la hayas elegido a mano.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'visible') return
      setF(s => (s.fechaManual || s.fecha === fechaClave() ? s : { ...s, fecha: fechaClave() }))
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    const id = setInterval(sync, 60000)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      clearInterval(id)
    }
  }, [])

  // Sin productos no queda nada que descontar: el descuento global no puede
  // quedar "residual" de una venta anterior.
  useEffect(() => {
    if (items.length === 0 && gsNum(descuento) > 0) setDescuento('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])
  // Combos activos de la tienda para agregarlos como varias líneas de una vez.
  useEffect(() => {
    if (esDemo) { setCombos([]); return }
    resources.combos.list().then(setCombos).catch(() => setCombos([]))
  }, [esDemo])

  function nombreDe(id) {
    return productos.find(p => p.id === id)?.nombre || ''
  }
  // Resolución autoritativa de precio por lista de cliente (issue #28): el
  // servidor decide escalón > lista > mayorista > minorista > USD. La UI cachea
  // por cliente+producto+cantidad y guarda el origen resuelto en la fila para
  // mostrarlo y para calcular la venta bajo lista.
  const preciosCache = useRef(new Map())
  const clientePreciosRef = useRef('__inicial__')
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Unidades disponibles del producto que se está por vender: con stock no se
  // puede "sobre pedir" (el servidor exige el IMEI exacto); el modal lo avisa.
  useEffect(() => {
    const fila = itemsRef.current.find(it => it.key === imeiPara)
    const producto = fila ? productos.find(p => p.id === fila.productoId) : null
    if (!imeiPara || !producto || esDemo) { setUnidadesDeImei(0); return undefined }
    let vivo = true
    api.get(`/api/inventory-units?q=${encodeURIComponent(producto.sku || producto.nombre || '')}`)
      .then(rows => { if (vivo) setUnidadesDeImei((rows || []).filter(unit => unit.productId === producto.id && unit.status === 'AVAILABLE').length) })
      .catch(() => { if (vivo) setUnidadesDeImei(0) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imeiPara])

  async function resolverPrecio(productoId, quantity) {
    if (esDemo || !productoId) return null
    const clienteId = customer?.id || ''
    const clave = `${clienteId}:${productoId}:${quantity}`
    if (preciosCache.current.has(clave)) return preciosCache.current.get(clave)
    try {
      const info = await resources.priceLists.pricing({
        productId: productoId,
        quantity: String(quantity),
        ...(clienteId ? { customerId: clienteId } : {}),
      })
      preciosCache.current.set(clave, info)
      return info
    } catch {
      return null
    }
  }

  // Aplica el precio resuelto por el servidor salvo que la fila tenga precio
  // manual o un cupón (el cupón ya viene cotizado por el servidor).
  async function aplicarPrecioResuelto(key, productoId, quantity) {
    const info = await resolverPrecio(productoId, quantity)
    if (!info) return
    setItems(arr => arr.map(it => {
      if (it.key !== key || it.precioManual || it.couponCode || it.combo) return it
      const esUsd = info.currency === 'USD'
      // El fallback USD→retail lo decide el servidor (#79); la UI solo lo usa.
      const precioPyg = Number(info.unitPricePygFallback ?? info.unitPricePyg) || 0
      return {
        ...it,
        precio: precioPyg,
        precioOrigen: info.origin,
        precioLista: info.priceList?.name || null,
        precioMinQty: info.minQty ?? null,
        precioUsd: esUsd ? Number(info.unitPriceUsd) : null,
        precioListaValor: esUsd ? null : precioPyg,
      }
    }))
  }

  // Al cambiar de cliente se descarta la caché y se vuelven a resolver las
  // filas sin precio manual, cupón ni combo. Corre también al montar para
  // refrescar un carrito restaurado.
  useEffect(() => {
    if (esDemo) return
    if (clientePreciosRef.current === (customer?.id || '')) return
    clientePreciosRef.current = customer?.id || ''
    preciosCache.current.clear()
    for (const fila of itemsRef.current) {
      if (!fila.precioManual && !fila.couponCode && !fila.combo) aplicarPrecioResuelto(fila.key, fila.productoId, fila.quantity || 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, esDemo])

  // Precio de lista que corresponde a esta venta: mayorista si el cliente lo es.
  function precioListaDe(id, quantity = 1) {
    const producto = productos.find(p => p.id === id)
    if (!producto) return undefined
    const info = preciosCache.current.get(`${customer?.id || ''}:${id}:${quantity}`)
    if (info) return Number(info.unitPricePygFallback ?? info.unitPricePyg) || 0
    if (customer?.pricingTier === 'WHOLESALE' && Number(producto.wholesalePricePyg) > 0) return Number(producto.wholesalePricePyg)
    return Number(producto.precioVenta) || 0
  }
  // Venta bajo lista: diferencia acumulada entre el precio de lista y el precio
  // manual de cada línea (espejo del control del servidor). Los cupones ya
  // vienen cotizados por el servidor y no cuentan como precio discrecional.
  const bajoLista = items.reduce((acc, it) => {
    if (it.couponCode || it.combo) return acc
    const lista = precioListaDe(it.productoId, it.quantity || 1)
    if (lista === undefined) return acc
    const gap = (Number(lista) - Number(it.precio || 0)) * (it.quantity || 1)
    if (gap <= 0) return acc
    acc.total += gap
    acc.base += Number(lista) * (it.quantity || 1)
    acc.productos.add(it.productoId)
    return acc
  }, { total: 0, base: 0, productos: new Set() })
  const descuentoPorPrecio = bajoLista.total
  const productoBajoId = bajoLista.productos.size === 1 ? [...bajoLista.productos][0] : null
  // Hasta el porcentaje configurado por la empresa (default 10%) la venta bajo
  // lista no pide autorización: solo el excedente se autoriza.
  const pctBajoListaPermitido = Number(empresa?.belowListPct ?? 10)
  const excedenteBajoLista = Math.max(0, descuentoPorPrecio - Math.floor((bajoLista.base * pctBajoListaPermitido) / 100))
  // Sin excedente que autorizar no hace falta la autorización: se limpia la selección.
  useEffect(() => { if (excedenteBajoLista <= 0 && authPrecio) setAuthPrecio(null) }, [excedenteBajoLista, authPrecio])
  function agregarCombo(combo) {
    const componentes = (Array.isArray(combo.items) ? combo.items : []).map(item => {
      const producto = productos.find(p => p.id === item.productId)
      return producto ? { producto, cantidad: Number(item.quantity) || 1 } : null
    }).filter(Boolean)
    if (componentes.length < 2) return
    const totalLista = componentes.reduce((sum, { producto, cantidad }) => sum + (Number(producto.precioVenta) || 0) * cantidad, 0)
    const precioCombo = Number(combo.pricePyg) || 0
    let asignado = 0
    const nuevas = componentes.map(({ producto, cantidad }, index) => {
      const base = (Number(producto.precioVenta) || 0) * cantidad
      const share = index === componentes.length - 1 ? Math.max(0, precioCombo - asignado) : Math.round(totalLista > 0 ? (precioCombo * base) / totalLista : precioCombo / componentes.length)
      asignado += share
      return {
        key: `${Date.now()}-${Math.random()}`,
        productoId: producto.id,
        nombre: producto.nombre,
        precio: cantidad > 0 ? Math.round(share / cantidad) : share,
        quantity: cantidad,
        couponCode: null,
        soldWithoutInsurance: false,
        serials: [],
        sobrePedido: false,
        combo: combo.name,
        comboId: combo.id,
      }
    })
    setItems(arr => [...arr, ...nuevas])
    setNoticeCombo(`Combo ${combo.name} agregado: ${nuevas.length} componentes por ${gs(precioCombo)}.`)
  }

  // Precio con el que entra un producto a la venta: mayorista si el cliente lo es.
  function precioDe(producto) {
    if (!producto) return 0
    if (customer?.pricingTier === 'WHOLESALE' && Number(producto.wholesalePricePyg) > 0) {
      return Number(producto.wholesalePricePyg)
    }
    return Number(producto.precioVenta) || 0
  }

  // Clic en el buscador: el producto entra a la venta y se termina de editar
  // (cantidad, precio, color, IMEI) en la lista.
  function agregarProducto(producto) {
    if (!producto) return
    const key = `${Date.now()}-${Math.random()}`
    const existente = itemsRef.current.find(
      it => it.productoId === producto.id && !it.serials?.length && !it.couponCode && !it.combo,
    )
    setItems(arr => {
      const indice = arr.findIndex(
        it => it.productoId === producto.id && !it.serials?.length && !it.couponCode,
      )
      if (indice >= 0) {
        return arr.map((it, i) => (i === indice ? { ...it, quantity: (it.quantity || 1) + 1 } : it))
      }
      return [
        ...arr,
        {
          key,
          productoId: producto.id,
          nombre: producto.nombre,
          precio: precioDe(producto),
          quantity: 1,
          couponCode: null,
          soldWithoutInsurance: false,
          serials: [],
          sobrePedido: false,
        },
      ]
    })
    setErrorVenta('')
    detectarUnidades(producto, key)
    // El precio local es solo el adelanto: el servidor confirma el precio de
    // lista del cliente (o el mayorista/minorista) para esta cantidad.
    if (existente && !existente.precioManual) aplicarPrecioResuelto(existente.key, producto.id, (existente.quantity || 1) + 1)
    else if (!existente) aplicarPrecioResuelto(key, producto.id, 1)
  }

  // Los productos con unidades serializadas piden IMEI en su fila.
  function detectarUnidades(producto, key) {
    if (esDemo) return
    const query = producto.sku || producto.nombre || ''
    api
      .get(`/api/inventory-units?q=${encodeURIComponent(query)}`)
      .then(rows => {
        if (!(rows || []).some(unit => unit.productId === producto.id)) return
        setItems(arr => arr.map(it => (it.key === key ? { ...it, requiereSerie: true } : it)))
      })
      .catch(() => {})
  }

  function quitarItem(key) {
    setItems(arr => arr.filter(x => x.key !== key))
  }
  function editarItem(key, patch) {
    setItems(arr => arr.map(x => {
      if (x.key !== key) return x
      const siguiente = { ...x, ...patch }
      // Marcar el precio como manual (no lo pisa la resolución de lista) y
      // limpiarlo al cambiar de producto o variante.
      if (patch.precio !== undefined) siguiente.precioManual = true
      if (patch.productoId !== undefined) { siguiente.precioManual = false; siguiente.couponCode = null }
      return siguiente
    }))
    if (patch.quantity !== undefined || patch.productoId !== undefined) {
      const fila = itemsRef.current.find(x => x.key === key)
      if (fila) aplicarPrecioResuelto(key, patch.productoId || fila.productoId, Number(patch.quantity ?? fila.quantity) || 1)
    }
  }
  // Descuento por línea: porcentual si hay %, si no el fijo en guaraníes.
  const descuentoItem = it => {
    const pct = parsePercent(it.descuentoPct) ?? 0
    if (pct > 0) return Math.round((it.precio * (it.quantity || 1) * pct) / 100)
    return Math.min(gsNum(it.descuento || 0), it.precio * (it.quantity || 1))
  }

  const totalCarrito = items.reduce((a, it) => a + it.precio * (it.quantity || 1) - descuentoItem(it), 0)
  const tieneCupon = items.some(it => it.couponCode)
  const subtotal = totalCarrito
  const totalGeneral = Math.max(0, subtotal - gsNum(descuento) + gsNum(f.montoDelivery))
  const totalPagado = pagos.reduce((s, p) => s + gsNum(p.monto), 0)
  // Descuento sugerido por el medio elegido (ej. efectivo 5%).
  const descuentoMedioPct = Math.max(0, ...pagos.map(pago => Number(cuentas?.find(cuenta => cuenta.id === pago.accountId)?.discountPct || 0)), 0)
  const descuentoMedioGs = Math.round((subtotal * descuentoMedioPct) / 100)
  const pendiente = Math.max(0, totalGeneral - totalPagado)

  const cantTotal = items.reduce((a, it) => a + (it.quantity || 1), 0)
  const valido =
    sesion?.vendedorId &&
    String(f.cliente ?? '').trim() &&
    cantTotal > 0 &&
    totalPagado <= totalGeneral &&
    gsNum(descuento) <= subtotal

  // Informa al contenedor lo que lleva esta compra, para pintarlo en la barra
  // compacta de pantallas angostas. Cada línea viaja con su subtotal ya
  // calculado (precio unitario × cantidad) para no volver a multiplicar.
  useEffect(() => {
    if (!onCarrito) return
    onCarrito({
      items: lineasParaResumen(items),
      quitar: quitarItem,
      puedeRevisar: items.length > 0,
      irARevisar: () =>
        document.getElementById('pos-resumen-venta')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f.cliente])
  // Escaneo de etiqueta (MOBOS:PROD:<sku>): el lector USB escribe como teclado.
  // Se muestra el producto y se agrega al confirmar, no de prepo.
  useEffect(() => {
    const match = busquedaProducto.trim().toUpperCase().match(/^MOBOS:PROD:([A-Z0-9-]+)$/)
    if (!match) return
    const producto = productos.find(item => String(item.sku || '').toUpperCase() === match[1])
    setBusquedaProducto('')
    if (producto) setEscaneado(producto)
    else setErrorVenta(`El código escaneado no está en el catálogo (${match[1]}).`)
  }, [busquedaProducto, productos])

  const familiasVisibles = familias.filter(fam => {
    const query = busquedaProducto.trim().toLocaleLowerCase()
    if (!query) return true
    return [fam.base, ...fam.items.map(item => item.nombre)].some(text =>
      text.toLocaleLowerCase().includes(query),
    )
  })

  function agregarColor() {
    const c = colorInput.trim()
    if (!c) return
    if (!coloresNuevos.some(x => x.toLowerCase() === c.toLowerCase()))
      setColoresNuevos(s => [...s, c])
    setColorInput('')
  }

  function cancelarNuevoProd() {
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
    setNuevoDetalles({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '' })
  }

  // SKU legible y estable a partir del nombre; si ya existe, el backend le
  // agrega un sufijo numérico (antes se le metía un timestamp y quedaba
  // ilegible: "CABLE-USB-C-MU5C3F2").
  const skuDe = texto => texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'PRODUCTO'

  async function crearProducto() {
    const base = nombreProd.trim()
    if (!base || creandoProd) return
    const precioNuevo = gsNum(nuevoDetalles.precio)
    const costoNuevo = nuevoDetalles.costo === '' ? undefined : gsNum(nuevoDetalles.costo)
    const mayoristaNuevo = nuevoDetalles.mayorista === '' ? undefined : gsNum(nuevoDetalles.mayorista)
    if (precioNuevo <= 0) { setErrorVenta('Ingresá el precio de venta del producto nuevo.'); return }
    setCreandoProd(true); setErrorVenta('')
    try {
      const crear = async (nombre) => {
        if (esDemo) {
          const creado = addProducto(nombre, nuevoDetalles.categoria)
          updateProducto(creado.id, { precioVenta: precioNuevo, precioCosto: costoNuevo ?? 0, condicion: nuevoDetalles.condicion, mayorista: mayoristaNuevo ?? 0 })
          return creado
        }
        return addProductoApi({ nombre, sku: skuDe(nombre), precioVenta: precioNuevo, precioCosto: costoNuevo, category: nuevoDetalles.categoria, condition: nuevoDetalles.condicion, ...(mayoristaNuevo ? { wholesalePricePyg: mayoristaNuevo } : {}), stock: 0 })
      }
      if (coloresNuevos.length === 0) {
        // Producto sin colores: entra directo a la venta.
        agregarProducto(await crear(base))
      } else {
        // Con colores se crea una variante por color ("Base Color"); la primera
        // entra a la venta y el color se cambia en la fila.
        const items = []
        for (const c of coloresNuevos) items.push({ ...(await crear(`${base} ${c}`)), color: c })
        agregarProducto(items[0])
      }
      setNuevoProd(false)
      setNombreProd('')
      setColoresNuevos([])
      setColorInput('')
      setNuevoDetalles({ categoria: 'Accesorios', condicion: 'NEW', precio: '', mayorista: '', costo: '' })
    } catch (error) {
      setErrorVenta(error?.message || 'No se pudo crear el producto.')
    } finally {
      setCreandoProd(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    if (guardando || guardadoEnCurso.current || guardadoIncompleto) return
    const lista = [...items]
    if (
      !sesion?.vendedorId ||
      !String(f.cliente ?? '').trim() ||
      lista.length === 0 ||
      totalPagado > totalGeneral
    )
      return
    const orderItems = lista.map(it => {
      const pct = parsePercent(it.descuentoPct) ?? 0
      const fijo = gsNum(it.descuento || 0)
      return {
        productId: it.productoId,
        description: it.nombre || nombreDe(it.productoId),
        quantity: it.quantity || 1,
        unitPricePyg: it.precio,
        soldWithoutInsurance: Boolean(it.soldWithoutInsurance),
        ...(it.serials?.length ? { inventoryUnitSerials: it.serials } : {}),
        ...(it.couponCode ? { couponCode: it.couponCode } : {}),
        ...(it.comboId ? { comboId: it.comboId } : it.combo ? { comboName: it.combo } : {}),
        ...(pct > 0 ? { discountPct: pct } : fijo > 0 ? { discountPyg: fijo } : {}),
      }
    })
    // La venta se registra por unidad: las filas con cantidad > 1 se expanden
    // para que descuento, pagos y stock se repartan por unidad (sin esto, el
    // total sumaba el precio unitario y los pagos "superaban el total").
    const listaDemo = lista.flatMap(it =>
      Array.from({ length: it.quantity || 1 }, () => ({ ...it, quantity: 1 })),
    )
    setErrorVenta('')
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = `pos-${crypto.randomUUID()}`
    // Trabajando sin conexión: los chequeos que dependen de la red (cuentas de
    // cobro, stock real, IMEI) se relajan; la venta se encola con `offline:
    // true` y el backend la recibe con stock laxo, marcada para revisión.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
    let lineas
    let payments
    try {
      const sinImei = lista.filter(it => it.requiereSerie && !it.serials?.length && !it.sobrePedido)
      if (sinImei.length && !sinRed)
        throw new Error(
          `Elegí el IMEI de ${sinImei.map(it => it.nombre).join(', ')} o marcalo como sobre pedido.`,
        )
      if (tieneCupon && gsNum(descuento) > 0)
        throw new Error('Quitá el descuento extra para utilizar un cupón. No son acumulables.')
      if (customer.phone?.trim() && !telefonoValido(customer.phone, customer.countryCode))
        throw new Error(MENSAJE_TELEFONO)
      const descuentoGlobal = gsNum(descuento)
      // Descuento global sin permiso: exige una autorización DISCOUNT aprobada
      // que alcance para el monto. Las líneas siguen bloqueadas como antes.
      if (!puedeDescontar && descuentoGlobal > 0) {
        if (!authDescuento)
          throw new Error(
            'El descuento necesita autorización de gerencia. Solicitá autorización y actualizá el estado.',
          )
        if (descuentoGlobal > Number(authDescuento.maxDiscountPyg || 0))
          throw new Error(
            `La autorización no alcanza para este descuento (máx ${gs(Number(authDescuento.maxDiscountPyg || 0))}). Solicitá una nueva.`,
          )
      }
      if (!puedeDescontar && items.some(it => descuentoItem(it) > 0))
        throw new Error('Solo administradores y gerentes pueden aplicar descuentos por línea.')
      // Venta bajo lista sin permiso: hasta el porcentaje configurado no pide
      // autorización; el excedente exige una autorización BELOW_LIST_PRICE que
      // lo cubra.
      if (!puedeDescontar && excedenteBajoLista > 0) {
        if (!authPrecio)
          throw new Error(
            `El precio está más de ${pctBajoListaPermitido}% por debajo de lista y necesita autorización de gerencia. Solicitá autorización desde el carrito y actualizá el estado.`,
          )
        if (excedenteBajoLista > Number(authPrecio.maxDiscountPyg || 0))
          throw new Error(
            `La autorización de precio no alcanza para esta venta (excedente bajo lista ${gs(excedenteBajoLista)}, máx ${gs(Number(authPrecio.maxDiscountPyg || 0))}). Solicitá una nueva.`,
          )
      }
      if (venderACredito && Number(customer.creditLimitPyg || 0) <= 0)
        throw new Error('El cliente no tiene límite de crédito habilitado. Configuralo en Clientes.')
      if (esDemo) validateDemoPromotionItems(orderItems, productos, gsNum(descuento))
      if (!sinRed && (!cuentas || errorCuentas))
        throw new Error(errorCuentas || 'Esperá a que terminen de cargar las cuentas.')
      // Sin conexión no se pueden armar filas con cuenta de cobro (necesitan la
      // lista de cuentas): se avisa en vez de encolar algo que va a fallar.
      if (sinRed && !cuentas && pagos.some(p => p.accountId))
        throw new Error('Sin conexión no se pueden usar las cuentas de cobro ya cargadas. Recargá el cobro o esperá la conexión.')
      if (!usaCuentas && pagos.some(p => !String(p.monto).trim() || gsNum(p.monto) <= 0))
        throw new Error('Ingresá un monto positivo en cada pago o quitá la fila vacía.')
      // Forma legacy (sin cuentas de cobro): solo método, monto en ₲ y estado.
      // Los campos de moneda (originalAmount/currency/exchangeRatePyg) se
      // rechazan sin accountId.
      payments = usaCuentas
        ? pagos.map(p => accountPayment(p, cuentas))
        : pagos.map(p => ({
            method: /efectivo/i.test(p.medioPago)
              ? 'CASH'
              : /tarjeta|pos/i.test(p.medioPago)
                ? 'CARD'
                : 'TRANSFER',
            amountPyg: gsNum(p.monto),
            status: 'CONFIRMED',
            ...([p.medioPago, p.cuenta].filter(Boolean).join(' · ').trim()
              ? { reference: [p.medioPago, p.cuenta].filter(Boolean).join(' · ') }
              : {}),
          }))
      if (esDemo)
        payments = payments.map(p => {
          const account = cuentas.find(a => a.id === p.accountId)
          return {
            ...p,
            id: crypto.randomUUID(),
            ...(account
              ? {
                  currency: account.currency,
                  accountSnapshot: { ...account },
                  medioPago: account.name,
                  cuenta: account.name,
                }
              : {}),
          }
        })
      const cantidades = new Map()
      for (const item of lista)
        cantidades.set(
          item.productoId,
          (cantidades.get(item.productoId) || 0) + (item.quantity || 1),
        )
      for (const [id, cantidad] of cantidades) {
        const producto = productos.find(p => p.id === id)
        if (!producto) throw new Error(`Stock insuficiente: producto.`)
        // Sin conexión el stock local puede estar viejo: se permite la venta
        // (stock laxo) y el backend la marca para revisión.
        if (!sinRed && num(producto.stock) < cantidad)
          throw new Error(`Stock insuficiente: ${producto?.nombre || 'producto'}.`)
      }
      lineas = allocateCheckout(
        listaDemo,
        gsNum(descuento),
        gsNum(f.montoDelivery),
        usaCuentas
          ? pagos.map((p, i) => ({ ...p, ...payments[i], monto: payments[i].amountPyg }))
          : pagos.map((p, i) => ({ ...p, ...payments[i], monto: gsNum(p.monto) })),
      )
    } catch (error) {
      setErrorVenta(error.message)
      return
    }

    // Fecha real de hoy, salvo que se haya elegido una a mano (para no guardar
    // con una fecha vieja si la app quedó abierta desde ayer).
    const fechaVenta = f.fechaManual ? f.fecha : fechaClave()

    // Si hay más de un producto, los marcamos como una misma compra para que el
    // historial los muestre agrupados.
    const compraId = listaDemo.length > 1 ? `compra-${Date.now().toString(36)}` : undefined

    // Una venta por producto, compartiendo cliente/vendedor/pago. El costo de
    // envío se cobra una sola vez (va en el primer producto).
    setGuardando(true)
    guardadoEnCurso.current = true
    let ventaPersistida = false
    let completedOrder = null
    // Payload de la venta tal como viajaría a la API: si la conexión se corta,
    // se encola este mismo objeto (con `offline: true`) sin perder nada.
    let payloadParaCola = null
    try {
      if (!esDemo) {
        const orderPayload = {
            ...(customer.id
              ? {
                  customerId: customer.id,
                  // Contacto corregido en el POS: viaja para persistirlo en la
                  // ficha (el correo dejaba de guardarse al editar y vender).
                  ...(customer.email?.trim() || customer.phone?.trim()
                    ? {
                        customer: {
                          ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
                          ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}),
                        },
                      }
                    : {}),
                }
              : {
                  customer: {
                    // Nombre normalizado ("PEREZ, JUAN" → "Juan Perez"): la
                    // ficha y el pedido se muestran siempre igual.
                    name: normalizarNombre(f.cliente.trim()),
                    ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}),
                    ...(customer.countryCode ? { countryCode: customer.countryCode } : {}),
                    ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
                    ...(customer.document?.trim() ? { document: customer.document.trim() } : {}),
                    ...(customer.addresses?.length
                      ? {
                          addresses: customer.addresses
                            .filter(address => address.address?.trim())
                            .map((address, index) => ({
                              label: address.label?.trim() || `Dirección ${index + 1}`,
                              address: address.address.trim(),
                              ...(address.city?.trim() ? { city: address.city.trim() } : {}),
                              ...(address.department?.trim() ? { department: address.department.trim() } : {}),
                              country: address.country?.trim() || 'Paraguay',
                              ...(address.notes?.trim() ? { notes: address.notes.trim() } : {}),
                              isDefault: address.isDefault === true,
                            })),
                        }
                      : {}),
                  },
                }),
            items: orderItems,
            payments,
            discountPyg: gsNum(descuento),
            // Vendedor sin permiso: la venta viaja con la autorización aprobada.
            ...(!puedeDescontar && gsNum(descuento) > 0 && authDescuento
              ? { discountAuthorizationId: authDescuento.id }
              : {}),
            ...(!puedeDescontar && excedenteBajoLista > 0 && authPrecio
              ? { priceAuthorizationId: authPrecio.id }
              : {}),
            deliveryPyg: gsNum(f.montoDelivery),
            // La API rechaza observaciones vacías: se omiten en vez de mandar ''.
            ...(f.observacion?.trim() ? { deliveryNotes: f.observacion } : {}),
            deliveryType: f.entrega,
            // Factura a otro titular: solo viaja si se completó nombre o RUC.
            ...(billingTo.name.trim() || billingTo.document.trim()
              ? {
                  billingTo: {
                    ...(billingTo.name.trim() ? { name: billingTo.name.trim() } : {}),
                    ...(billingTo.document.trim() ? { document: billingTo.document.trim() } : {}),
                  },
                }
              : {}),
            // Venta a crédito: plazo en días; el vencimiento lo calcula el backend.
            ...(venderACredito ? { creditDays: Number(creditoDias) || 0 } : {}),
            // Pedido especial con seña: la seña es el pago parcial ya cargado;
            // solo viaja la marca y la fecha esperada opcional.
            ...(f.specialOrder
              ? { specialOrder: true, ...(f.expectedAt ? { expectedAt: f.expectedAt } : {}) }
              : {}),
        }
        // Sin conexión no hay sin conexión que valga: la venta viaja con
        // `offline` para que el backend relaje el stock y la marque a revisar.
        payloadParaCola = orderPayload
        const order = await guardarOrdenApi(orderPayload, { idempotencyKey: idempotencyKeyRef.current })
        if (!order?.id || order.error || order.ok === false)
          throw new Error(order?.error || 'No se recibió confirmación de la orden.')
        ventaPersistida = true
        completedOrder = order
      } else {
        const validation = await validateDemoTradeIns(payments)
        if (validation === false || validation?.error || validation?.ok === false)
          throw new Error(validation?.error || 'No se pudo validar el canje.')
        const clientesDemo = clientesDemoGuardados()
        const clienteDemo = customer.id
          ? customer
          : clientesDemo.find(
              c =>
                String(c.name || '').toLowerCase() === String(customer.name || '').trim().toLowerCase() &&
                (!customer.phone || c.phone === customer.phone),
            ) || { ...customer, name: customer.name.trim(), id: crypto.randomUUID() }
        const ventas = []
        for (const [i, it] of lineas.entries()) {
          const venta = await addVenta({
            compraId,
            vendedorId: sesion.vendedorId,
            cliente: String(f.cliente ?? ''),
            clienteId: clienteDemo.id,
            clienteTelefono: clienteDemo.phone,
            clienteDireccion: clienteDemo.address,
            vendedorNombre: sesion.nombre,
            productoId: it.productoId,
            couponCode: it.couponCode || null,
            estadoPago: pendiente === 0 ? 'Pagado' : totalPagado > 0 ? 'Parcial' : 'Pendiente',
            fecha: fechaVenta,
            precio: it.precio,
            listPricePyg: precioListaDe(it.productoId),
            medioPago: f.medioPago,
            entrega: i === 0 ? f.entrega : 'Retiro en tienda',
            montoDelivery: it.montoDelivery,
            observacion: f.observacion,
            descuento: it.descuento,
            subtotal,
            total: it.total,
            pagos: it.pagos,
            totalPagado,
            totalPendiente: pendiente,
          })
          if (!venta?.id || venta.error || venta.ok === false)
            throw new Error(venta?.error || 'No se recibió confirmación de la venta demo.')
          ventaPersistida = true
          ventas.push(venta)
        }
        if (!clientesDemo.some(c => c.id === clienteDemo.id))
          guardarClienteDemo(clienteDemo)
        const order = {
          ...ventas[0],
          id: ventas[0].id,
          compraId,
          cliente: String(f.cliente ?? '').trim(),
          vendedorId: sesion.vendedorId,
          seller: { id: sesion.vendedorId, name: sesion.nombre },
          fecha: fechaVenta,
          totalPyg: totalGeneral,
          payments,
          ventas,
          isSpecialOrder: Boolean(f.specialOrder),
          ...(f.expectedAt ? { expectedAt: f.expectedAt } : {}),
        }
        const result = await recordDemoTradeIns(order, payments)
        if (result === false || result?.error || result?.ok === false)
          throw new Error(result?.error || 'No se pudo registrar el canje demo.')
        recordDemoPromotionUsage(orderItems, productos, gsNum(descuento))
        completedOrder = order
      }

      guardarDemo(ULTIMO_VENDEDOR, f.vendedorId)
      idempotencyKeyRef.current = null // la próxima venta arranca con clave nueva
      const { empresaId, sucursalId } = contextoActual()
      // La ficha ya existe (o la creó la venta): el borrador del RUC sobra.
      if (customer.document) descartarPreCliente(empresaId, customer.document)
      borrarCarrito(empresaId, sucursalId)
      setCustomer({ ...CLIENTE_VACIO })
      setItems([])
      setDescuento('')
      setAuthDescuento(null)
      setPagos([])
      setF(VACIO(f.vendedorId))
      setBusquedaProducto('')
      setLastOrder(completedOrder)
      setOk(true)
      setTimeout(() => setOk(false), 2500)
      onGuardado?.()
    } catch (error) {
      // Sin conexión (o se cortó justo al enviar): la venta no se pierde. Queda
      // en la cola local con la misma Idempotency-Key y se reintenta al
      // reconectar; el backend la recibe con `offline` y la marca para revisión.
      if (!esDemo && payloadParaCola && esErrorDeRed(error)) {
        try {
          const item = await encolarVenta({
            payload: { ...payloadParaCola, offline: true },
            idempotencyKey: idempotencyKeyRef.current,
            resumen: { cliente: f.cliente, total: totalGeneral, items: orderItems.length },
          })
          guardarDemo(ULTIMO_VENDEDOR, f.vendedorId)
          idempotencyKeyRef.current = null
          const { empresaId, sucursalId } = contextoActual()
          borrarCarrito(empresaId, sucursalId)
          setCustomer({ ...CLIENTE_VACIO })
          setItems([])
          setDescuento('')
          setAuthDescuento(null)
          setPagos([])
          setF(VACIO(f.vendedorId))
          setBusquedaProducto('')
          setAvisoOffline(
            `Venta guardada sin conexión${item?.resumen?.cliente ? ` (${item.resumen.cliente})` : ''}. Se sincroniza sola al volver la conexión.`,
          )
          setErrorVenta('')
          onGuardado?.()
          return
        } catch {
          /* si tampoco se puede encolar, sigue el error normal de abajo */
        }
      }
      if (ventaPersistida) setGuardadoIncompleto(true)
      setErrorVenta(
        ventaPersistida
          ? `La venta se guardó, pero quedó un paso incompleto: ${error?.message || 'error al finalizar'}. Revisá el registro antes de volver a vender; se bloqueó el reintento para evitar duplicados.`
          : error?.message || 'No se pudo guardar la venta. Tu carrito sigue disponible.',
      )
    } finally {
      setGuardando(false)
      guardadoEnCurso.current = false
    }
  }

  // `prefill.monto` llega de «Dividir saldo» (el saldo que falta): en el cobro
  // legacy se precarga tal cual; con cuentas, el monto lo propone la cuenta al
  // elegirla (PaymentAccountFields conoce el pendiente).
  function agregarPago(prefill = {}) {
    if (!cuentas) return
    setPagos(arr => [
      ...arr,
      usaCuentas
        // Con cuentas, el monto se edita en `originalAmount` (moneda de la
        // cuenta): «Dividir saldo» precarga ahí el saldo que falta (#187).
        ? { ...PAGO_VACIO, accountId: '', originalAmount: prefill.monto ? String(prefill.monto) : '', exchangeRatePyg: '' }
        : { ...PAGO_VACIO, monto: prefill.monto ? String(prefill.monto) : pendiente > 0 ? String(pendiente) : '' },
    ])
  }

  // ── Ventas suspendidas ──────────────────────────────────────────────
  const carritoConDatos = Boolean(
    items.length ||
      pagos.length ||
      gsNum(descuento) ||
      customer.name ||
      customer.phone ||
      customer.email ||
      customer.document ||
      customer.addresses?.length,
  )
  const puedeGestionarSuspendidas = Boolean(
    sesion?.esPropietario || ['ADMIN', 'GERENTE', 'dueno'].includes(sesion?.rol),
  )
  const fechaSuspendida = value => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString('es-PY', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
  }
  // Deja el carrito sin descuentos: el global y los de cada línea (los dos
  // botones de limpieza del carrito).
  function borrarDescuentos() {
    setDescuento('')
    setItems(arr => arr.map(it =>
      it.descuento || it.descuentoPct ? { ...it, descuento: '', descuentoPct: '' } : it,
    ))
  }
  function limpiarCarrito() {
    const { empresaId, sucursalId } = contextoActual()
    borrarCarrito(empresaId, sucursalId)
    setItems([])
    setDescuento('')
    setPagos([])
    setAuthDescuento(null)
    setAuthPrecio(null)
    setBillingTo({ name: '', document: '' })
    setVenderACredito(false)
    setCreditoDias('')
    setCustomer({ ...CLIENTE_VACIO })
    setF(VACIO(f.vendedorId))
  }
  async function abrirSuspendidas() {
    if (esDemo) {
      setAvisoDemoSuspendidas(true)
      return
    }
    setSuspendidasOpen(true)
    setCargandoSuspendidas(true)
    setErrorSuspendidas('')
    try {
      const { sucursalId } = contextoActual()
      const filas = await api.get(
        `/api/suspended-sales${sucursalId ? `?branchId=${encodeURIComponent(sucursalId)}` : ''}`,
      )
      if (!Array.isArray(filas))
        throw new Error('Respuesta inválida al cargar las ventas suspendidas.')
      setSuspendidas(filas)
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudieron cargar las ventas suspendidas.')
    } finally {
      setCargandoSuspendidas(false)
    }
  }
  function abrirSuspender() {
    if (esDemo) {
      setAvisoDemoSuspendidas(true)
      return
    }
    setLabelSuspender('')
    setErrorSuspender('')
    setSuspenderOpen(true)
  }
  // Guarda el carrito completo en el servidor y limpia el formulario: la venta
  // queda en espera para retomarla desde esta u otra computadora de la sucursal.
  async function suspenderVenta() {
    if (suspendiendo) return
    setSuspendiendo(true)
    setErrorSuspender('')
    try {
      const { sucursalId } = contextoActual()
      await api.post('/api/suspended-sales', {
        ...(sucursalId ? { branchId: sucursalId } : {}),
        ...(customer.id ? { customerId: customer.id } : {}),
        ...(labelSuspender.trim() ? { label: labelSuspender.trim() } : {}),
        payload: {
          items,
          customer,
          descuento,
          pagos,
          entrega: f.entrega,
          montoDelivery: f.montoDelivery,
          observacion: f.observacion,
          billingTo,
          venderACredito,
          creditoDias,
          specialOrder: f.specialOrder,
          expectedAt: f.expectedAt,
        },
      })
      setSuspenderOpen(false)
      setLabelSuspender('')
      limpiarCarrito()
      setAvisoSuspension('Venta suspendida. Podés retomarla desde “Ventas suspendidas”.')
    } catch (error) {
      setErrorSuspender(error?.message || 'No se pudo suspender la venta.')
    } finally {
      setSuspendiendo(false)
    }
  }
  // Productos del borrador que ya no tienen stock para lo pedido.
  const faltantesDe = (suspendida) => {
    const filas = Array.isArray(suspendida?.payload?.items) ? suspendida.payload.items : []
    return filas
      .map((fila) => {
        const producto = productos.find((p) => p.id === fila.productoId)
        if (!producto) return null
        const pedido = Number(fila.quantity || 1)
        const stock = Number(producto.stock) || 0
        return stock < pedido ? { nombre: fila.nombre || producto.nombre, pedido, stock } : null
      })
      .filter(Boolean)
  }
  function pedirRecuperar(suspendida) {
    // Si cambió la disponibilidad, primero se avisa: volver o vender igual.
    const faltantes = faltantesDe(suspendida)
    if (faltantes.length) {
      setStockPendiente({ suspendida, faltantes })
      return
    }
    if (carritoConDatos) {
      setRecuperarPendiente(suspendida)
      return
    }
    recuperarSuspendida(suspendida)
  }
  // Enlace público del borrador: se genera (o regenera) y se muestra para
  // copiar, mandar por WhatsApp o por correo. El token solo viaja una vez.
  async function generarEnlacePublico(suspendida) {
    try {
      const data = await api.patch('/api/suspended-sales', { id: suspendida.id, regenerate: true })
      if (!data?.token) throw new Error('El servidor no devolvió el enlace.')
      setEnlacePublico({ id: suspendida.id, url: `${window.location.origin}/carrito/${data.token}` })
      setAvisoEnlace('')
      setErrorSuspendidas('')
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudo generar el enlace público.')
    }
  }
  // Carga el payload guardado en el formulario y recién después descarta la
  // suspendida: el backend no la borra sola al recuperarla.
  async function recuperarSuspendida(suspendida, { venderIgual = false } = {}) {
    setRecuperarPendiente(null)
    const payload = suspendida?.payload
    if (!payload || typeof payload !== 'object') {
      setErrorSuspendidas(
        'El servidor no devolvió el carrito guardado: no se puede recuperar esta venta.',
      )
      return
    }
    const cliente = clienteGuardado(payload.customer)
    // "Vender igualmente": las líneas sin stock quedan marcadas como sobre
    // pedido (el IMEI/stock se completa al entregar).
    const recuperados = itemsGuardados(payload.items).map((item) => {
      if (!venderIgual) return item
      const producto = productos.find((p) => p.id === item.productoId)
      return producto && Number(producto.stock) < Number(item.quantity || 1) ? { ...item, sobrePedido: true } : item
    })
    setItems(recuperados)
    setCustomer(cliente)
    setDescuento(
      payload.descuento === undefined || payload.descuento === null
        ? ''
        : String(payload.descuento),
    )
    setPagos(Array.isArray(payload.pagos) ? payload.pagos : [])
    setBillingTo({
      name: typeof payload.billingTo?.name === 'string' ? payload.billingTo.name : '',
      document: typeof payload.billingTo?.document === 'string' ? payload.billingTo.document : '',
    })
    setVenderACredito(Boolean(payload.venderACredito))
    setCreditoDias(
      payload.creditoDias === undefined || payload.creditoDias === null
        ? ''
        : String(payload.creditoDias),
    )
    setF({
      ...VACIO(f.vendedorId),
      cliente: cliente.name,
      ...(ENTREGA.includes(payload.entrega) ? { entrega: payload.entrega } : {}),
      montoDelivery: typeof payload.montoDelivery === 'string' ? payload.montoDelivery : '',
      observacion: typeof payload.observacion === 'string' ? payload.observacion : '',
      specialOrder: Boolean(payload.specialOrder),
      expectedAt: typeof payload.expectedAt === 'string' ? payload.expectedAt : '',
    })
    setSuspendidas(list => list.filter(item => item.id !== suspendida.id))
    setAvisoSuspension('Venta recuperada. Revisá el carrito antes de cobrar.')
    try {
      await api.delete(`/api/suspended-sales?id=${encodeURIComponent(suspendida.id)}`)
      setSuspendidasOpen(false)
    } catch (error) {
      setErrorSuspendidas(
        error?.message ||
          'La venta se recuperó, pero no se pudo quitarla del servidor: descartala para evitar duplicados.',
      )
    }
  }
  async function descartarSuspendida() {
    if (!descartarPendiente || descartando) return
    setDescartando(true)
    setErrorSuspendidas('')
    try {
      await api.delete(`/api/suspended-sales?id=${encodeURIComponent(descartarPendiente.id)}`)
      setSuspendidas(list => list.filter(item => item.id !== descartarPendiente.id))
      setDescartarPendiente(null)
    } catch (error) {
      setErrorSuspendidas(error?.message || 'No se pudo descartar la venta suspendida.')
      setDescartarPendiente(null)
    } finally {
      setDescartando(false)
    }
  }

  // Atajos del POS. Solo actúan mientras esta vista está visible (el panel la
  // mantiene montada con `hidden`) y nunca cuando se escribe en un campo,
  // salvo Escape. Los handlers usan el estado del render actual; el efecto se
  // re-suscribe en cada render para no manejar closures viejos.
  useEffect(() => {
    const onKey = event => {
      const busqueda = document.getElementById('pos-busqueda-producto')
      if (busqueda && busqueda.closest('[hidden]')) return
      const target = event.target
      const editable =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (event.key === 'Escape' || editable) return
      if (event.key === 'F2') {
        event.preventDefault()
        busqueda?.focus()
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        if (
          valido &&
          !guardando &&
          !guardadoEnCurso.current &&
          !guardadoIncompleto &&
          cuentas &&
          !errorCuentas
        ) {
          event.preventDefault()
          guardar({ preventDefault: () => {} })
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <Card className="p-4 md:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-ink-600 pb-4">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
            <Icon name="receipt" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Nueva venta</h2>
            <p className="mt-0.5 text-xs text-mute">
              Cliente, productos y cobro en una sola página.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-fono/20 bg-fono/5 px-3 py-1 text-xs font-semibold text-fono-light">
            Hoy: {fechaClave().split('-').reverse().join('/')}
          </span>
          {/* Carrito en espera: suspender la venta actual y retomar otra. Vive
              en el encabezado para no cortar el flujo de la venta. */}
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-xs"
            onClick={() => setAnalyticsOpen(true)}
          >
            <Icon name="chart" className="h-4 w-4" />
            Analytics
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-xs"
            onClick={abrirSuspendidas}
          >
            <Icon name="clock" className="h-4 w-4" />
            Ventas suspendidas
          </Button>
          {items.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3 text-xs"
              onClick={abrirSuspender}
              disabled={guardando}
            >
              <Icon name="save" className="h-4 w-4" />
              Suspender venta
            </Button>
          )}
        </div>
      </div>

      {ok && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ok/30 bg-ok/10 p-4 text-ok"
        >
          <span className="grid h-9 w-9 shrink-0 animate-pulse place-items-center rounded-full bg-ok/20">
            <Icon name="check" className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <b className="block">
              {lastOrder?.orderNumber ? `Pedido ${codigoPedido(lastOrder.orderNumber)} creado` : 'Venta registrada'}
            </b>
            Venta registrada correctamente. Ya podés cargar la siguiente.
            {esDemo && (
              <span className="mt-1 block text-xs font-semibold text-mute">
                Modo demo: la venta queda guardada solo en este navegador, no en una tienda real.
              </span>
            )}
          </span>
          {lastOrder && (
            <>
              {whatsappTrackingLink(lastOrder) && (
                <a
                  className="rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-black"
                  href={whatsappTrackingLink(lastOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Seguimiento por WhatsApp
                </a>
              )}
              <Button type="button" variant="outline" onClick={() => setComprobante(true)}>
                Imprimir comprobante
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/pedidos/${encodeURIComponent(lastOrder.id)}`)}
              >
                Ver pedido
              </Button>
            </>
          )}
        </div>
      )}
      {avisoSuspension && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-fono/30 bg-fono/10 p-4 text-sm text-fono-light"
        >
          <span>{avisoSuspension}</span>
          <button
            type="button"
            onClick={() => setAvisoSuspension('')}
            className="rounded-md p-1 text-mute transition hover:bg-ink-700 hover:text-fore"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}
      {avisoOffline && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn"
        >
          <span>{avisoOffline}</span>
          <button
            type="button"
            onClick={() => setAvisoOffline('')}
            className="rounded-md p-1 text-mute transition hover:bg-ink-700 hover:text-fore"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}
      {/* Cola local de ventas sin sincronizar (offline-first). */}
      <div className="mb-4 empty:hidden">
        <ColaOffline />
      </div>
      {pagos.some(p => p.tradeIn) && (
        <p role="status" className="mb-4 rounded-xl border border-fono/30 bg-fono/10 p-3 text-sm">
          Canje preparado como parte de pago. Revisá sus datos y el saldo pendiente en Cobrar.
        </p>
      )}
      <form
        onSubmit={guardar}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          const target = event.target
          if (!(target instanceof HTMLElement)) return
          if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'A') return
        }}
        className="flex flex-col gap-4"
      >
        {errorVenta && (
          <p
            role="alert"
            className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad"
          >
            {errorVenta}
          </p>
        )}

        {/* Resumen fijo: cruza las dos columnas en desktop y queda al pie en
            pantallas angostas (ahí la barra superior es el acceso rápido). */}
        <div
          data-testid="resumen-columna"
          className="order-last z-10 lg:order-first lg:sticky lg:top-24"
        >
          <ResumenVenta
            totalGeneral={totalGeneral}
            items={items}
            unidades={cantTotal}
            montoDescuento={gsNum(descuento)}
            montoDelivery={gsNum(f.montoDelivery)}
            dia={resumenDia}
          />
        </div>

        {/* Operación (cliente + buscador + productos) | carrito y cobro. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="flex min-w-0 flex-col gap-4">
            <PasoProductos
              sesion={sesion}
              esDemo={esDemo}
              customer={customer}
              setCustomer={setCustomer}
              billingTo={billingTo}
              setBillingTo={setBillingTo}
              setF={setF}
              productos={productos}
              nuevoProd={nuevoProd}
              setNuevoProd={setNuevoProd}
              nombreProd={nombreProd}
              setNombreProd={setNombreProd}
              nuevoDetalles={nuevoDetalles}
              setNuevoDetalles={setNuevoDetalles}
              colorInput={colorInput}
              setColorInput={setColorInput}
              coloresNuevos={coloresNuevos}
              setColoresNuevos={setColoresNuevos}
              agregarColor={agregarColor}
              puedeCrearProducto={puedeCrearProducto}
              crearProducto={crearProducto}
              creandoProd={creandoProd}
              cancelarNuevoProd={cancelarNuevoProd}
              setBusquedaProducto={setBusquedaProducto}
              combos={combos}
              agregarCombo={agregarCombo}
              noticeCombo={noticeCombo}
              familiasVisibles={familiasVisibles}
              agregarProducto={agregarProducto}
              guardando={guardando}
            />

            {/* Atajos al pie de la operación (en pantallas angostas no se muestran). */}
            <div className="hidden items-center gap-x-4 gap-y-1.5 text-[11px] text-mute md:flex">
              <span className="font-semibold uppercase tracking-wider text-mute/60">Atajos</span>
              <Atajo k="F2" label="Buscar producto" />
              <Atajo k="Ctrl+S" label="Guardar venta" />
              <Atajo k="Esc" label="Cerrar ventana" />
            </div>
          </div>

          {/* Carrito fijo + cobro y entrega: la venta se lee y se cobra acá. */}
          <div className="flex min-w-0 flex-col gap-4">
            <PasoCarrito
              items={items}
              productos={productos}
              familias={familias}
              esDemo={esDemo}
              guardando={guardando}
              puedeDescontar={puedeDescontar}
              precioDe={precioDe}
              totalCarrito={totalCarrito}
              totalGeneral={totalGeneral}
              montoDelivery={gsNum(f.montoDelivery)}
              quitarItem={quitarItem}
              editarItem={editarItem}
              onImei={setImeiPara}
              descuento={descuento}
              setDescuento={setDescuento}
              montoDescuento={gsNum(descuento)}
              onBorrarDescuentos={borrarDescuentos}
              onVaciarCarrito={limpiarCarrito}
              customer={customer}
              onAuthDescuento={onAuthDescuento}
              montoPrecioBajo={excedenteBajoLista}
              productoBajoId={productoBajoId}
              onAuthPrecio={setAuthPrecio}
              tieneCupon={tieneCupon}
              f={f}
              setF={setF}
              cliente={customer?.name || f.cliente}
              vendedor={sesion?.nombre}
            />

            <PasoCobro
              customer={customer}
              venderACredito={venderACredito}
              setVenderACredito={setVenderACredito}
              creditoDias={creditoDias}
              setCreditoDias={setCreditoDias}
              cuentas={cuentas}
              usaCuentas={usaCuentas}
              errorCuentas={errorCuentas}
              onReintentarCuentas={() => setIntentoCuentas(n => n + 1)}
              pagos={pagos}
              setPagos={setPagos}
              onAgregarPago={agregarPago}
              guardando={guardando}
              guardadoIncompleto={guardadoIncompleto}
              descuentoMedioPct={descuentoMedioPct}
              descuentoMedioGs={descuentoMedioGs}
              subtotal={subtotal}
              puedeDescontar={puedeDescontar}
              setDescuento={setDescuento}
              totalGeneral={totalGeneral}
              totalPagado={totalPagado}
              pendiente={pendiente}
              f={f}
              setF={setF}
              set={set}
              valido={valido}
              cantTotal={cantTotal}
              ok={ok}
            />
          </div>
        </div>
      </form>

      <Modal
        open={Boolean(imeiPara)}
        onClose={() => setImeiPara(null)}
        title="Elegir IMEI de esta venta"
        className="max-w-lg"
      >
        {(() => {
          const fila = items.find(it => it.key === imeiPara)
          const productoFila = fila ? productos.find(p => p.id === fila.productoId) : null
          if (!fila || !productoFila) return null
          return (
            <div className="space-y-3">
              <p className="text-sm text-mute">
                {fila.nombre} · {gs(Number(fila.precio) || 0)} c/u
              </p>
              <SerialUnitPicker
                product={productoFila}
                customerName={customer.name || f.cliente}
                selectedSerials={fila.serials || []}
                onChange={serials => editarItem(fila.key, { serials })}
                disabled={guardando}
              />
              <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${unidadesDeImei > 0 ? 'border-ink-600 bg-ink-800/40 text-mute/70' : 'border-warn/30 bg-warn/5 text-mute'}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-warn disabled:opacity-40"
                  disabled={unidadesDeImei > 0}
                  checked={Boolean(fila.sobrePedido)}
                  onChange={event => editarItem(fila.key, { sobrePedido: event.target.checked, serials: event.target.checked ? [] : fila.serials || [] })}
                />
                <span>
                  {unidadesDeImei > 0
                    ? <>Con stock no se vende sin IMEI: elegí la unidad de arriba (hay {unidadesDeImei} disponible{unidadesDeImei === 1 ? '' : 's'}).</>
                    : <>Vender <b className="text-fore">sin IMEI (sobre pedido)</b>: el cliente reserva sin stock; el IMEI se completa al entregar.</>}
                </span>
              </label>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setImeiPara(null)}>Listo</Button>
              </div>
            </div>
          )
        })()}
      </Modal>
      <Modal
        open={suspenderOpen}
        onClose={suspendiendo ? undefined : () => setSuspenderOpen(false)}
        title="Suspender venta"
        className="max-w-md"
      >
        <div className="space-y-3">
          <p className="text-sm text-mute">
            El carrito queda guardado en el servidor para esta sucursal, con el cliente, la
            entrega, la facturación, los pagos y el descuento cargados. Cualquier persona con
            permiso de venta puede retomarlo.
          </p>
          <div>
            <Label htmlFor="etiqueta-suspendida">Etiqueta (opcional)</Label>
            <Input
              id="etiqueta-suspendida"
              maxLength={120}
              value={labelSuspender}
              onChange={event => setLabelSuspender(event.target.value)}
              placeholder="Ej: nombre del cliente o seña"
              autoCapitalize="sentences"
            />
          </div>
          {errorSuspender && (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
              {errorSuspender}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSuspenderOpen(false)}
              disabled={suspendiendo}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={suspenderVenta} disabled={suspendiendo || !items.length}>
              {suspendiendo ? 'Suspendiendo…' : 'Suspender venta'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={suspendidasOpen}
        onClose={descartando ? undefined : () => setSuspendidasOpen(false)}
        title="Ventas suspendidas"
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-mute">
            Carritos en espera de esta sucursal. Al recuperar uno, el carrito actual se reemplaza
            y la venta suspendida se quita de la lista.
          </p>
          {cargandoSuspendidas && (
            <p role="status" className="text-sm text-mute">
              Cargando ventas suspendidas…
            </p>
          )}
          {errorSuspendidas && (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
              {errorSuspendidas}
            </p>
          )}
          {!cargandoSuspendidas && !suspendidas.length && !errorSuspendidas && (
            <p className="rounded-xl border border-ink-600 px-3 py-4 text-sm text-mute">
              No hay ventas suspendidas en esta sucursal.
            </p>
          )}
          <div className="space-y-2">
            {suspendidas.map(suspendida => (
              <article
                key={suspendida.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {suspendida.label?.trim() || 'Sin etiqueta'}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    {suspendida.customer?.name || 'Sin cliente'} ·{' '}
                    {suspendida.user?.name || 'Vendedor'} · {fechaSuspendida(suspendida.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={descartando}
                    onClick={() => generarEnlacePublico(suspendida)}
                  >
                    Enlace público
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={descartando}
                    onClick={() => pedirRecuperar(suspendida)}
                  >
                    Recuperar
                  </Button>
                  {(puedeGestionarSuspendidas || suspendida.userId === sesion?.vendedorId) && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={descartando}
                      onClick={() => {
                        setErrorSuspendidas('')
                        setDescartarPendiente(suspendida)
                      }}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                      Descartar
                    </Button>
                  )}
                </div>
                {enlacePublico?.id === suspendida.id && (
                  <div className="w-full space-y-2 rounded-xl border border-fono/30 bg-fono/[.06] p-3">
                    <p className="text-xs text-mute">Enlace público del carrito (sin sesión). Se muestra una sola vez: copialo o compartilo ahora.</p>
                    <p className="truncate rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 font-mono text-[11px] text-fono-light">{enlacePublico.url}</p>
                    {avisoEnlace && <p role="status" className="text-xs text-ok">{avisoEnlace}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(enlacePublico.url).then(() => setAvisoEnlace('Enlace copiado: mandalo al cliente para que confirme.'))}>Copiar</Button>
                      <a
                        className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
                        href={`https://wa.me/${String(suspendida.customer?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola${suspendida.customer?.name ? ` ${suspendida.customer.name}` : ''}, te comparto el carrito${suspendida.label ? ` "${suspendida.label}"` : ''}: ${enlacePublico.url}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Enviar por WhatsApp
                      </a>
                      <a
                        className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore"
                        href={`mailto:${suspendida.customer?.email || ''}?subject=${encodeURIComponent(`Carrito${suspendida.label ? ` ${suspendida.label}` : ''}`)}&body=${encodeURIComponent(`Te comparto el carrito para que lo confirmes: ${enlacePublico.url}`)}`}
                      >
                        Enviar por correo
                      </a>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSuspendidasOpen(false)}
              disabled={descartando}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(recuperarPendiente)}
        onCancel={() => setRecuperarPendiente(null)}
        onConfirm={() => recuperarSuspendida(recuperarPendiente)}
        title="Reemplazar el carrito actual"
        description="Tenés una venta en curso. Si recuperás la venta suspendida, el carrito actual se reemplaza por el guardado."
        confirmLabel="Reemplazar y recuperar"
      />

      <ConfirmDialog
        open={Boolean(stockPendiente)}
        onCancel={() => setStockPendiente(null)}
        onConfirm={() => {
          const { suspendida } = stockPendiente
          setStockPendiente(null)
          if (carritoConDatos) setRecuperarPendiente(suspendida)
          else recuperarSuspendida(suspendida, { venderIgual: true })
        }}
        title="Cambió la disponibilidad"
        description={`Estos productos ya no tienen stock para lo pedido: ${(stockPendiente?.faltantes || []).map((f) => `${f.nombre} (pedido ${f.pedido}, hay ${f.stock})`).join(' · ')}. Podés volver atrás o vender igualmente: las líneas quedan como sobre pedido.`}
        confirmLabel="Vender igualmente"
        cancelLabel="Volver atrás"
      />

      <ConfirmDialog
        open={Boolean(descartarPendiente)}
        onCancel={() => {
          if (!descartando) setDescartarPendiente(null)
        }}
        onConfirm={descartarSuspendida}
        title="Descartar venta suspendida"
        description={`Se elimina definitivamente la venta suspendida${
          descartarPendiente?.label?.trim() ? ` “${descartarPendiente.label.trim()}”` : ''
        }. No se puede deshacer.`}
        confirmLabel="Descartar"
        variant="danger"
        busy={descartando}
      />

      <Modal
        open={avisoDemoSuspendidas}
        onClose={() => setAvisoDemoSuspendidas(false)}
        title="Ventas suspendidas"
        className="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-mute">
            Las ventas suspendidas se guardan en el servidor de tu tienda y necesitan conexión.
            En la demo no se guardan ni se simulan.
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setAvisoDemoSuspendidas(false)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      <AnalyticsPos open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />

      {/* Código escaneado: se confirma antes de sumarlo a la venta. */}
      <Modal open={Boolean(escaneado)} onClose={() => setEscaneado(null)} title="Producto escaneado" className="max-w-md">
        {escaneado && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {escaneado.imagen || escaneado.imageUrl ? (
                <img src={escaneado.imagen || escaneado.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light">
                  <Icon name="box" className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{escaneado.nombre || escaneado.name}</p>
                <p className="text-xs text-mute">
                  {[escaneado.sku, escaneado.model || escaneado.modelo, escaneado.capacity || escaneado.capacidad].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-0.5 text-sm">
                  {gs(Number(escaneado.precioVenta) || 0)} ·{' '}
                  {num(escaneado.stock) > 0
                    ? <span className="text-ok">{num(escaneado.stock)} en stock</span>
                    : <span className="text-bad">Agotado</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setEscaneado(null)}>Cancelar</Button>
              <Button
                type="button"
                onClick={() => { agregarProducto(escaneado); setEscaneado(null) }}
              >
                Agregar a la venta
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {lastOrder && <ComprobantePreview order={lastOrder} open={comprobante} onClose={() => setComprobante(false)} />}
    </Card>
  )
}
