import { useCallback, useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import {
  getProductos,
  productosById,
  addProducto,
  addProductoApi,
  updateProducto,
  addVenta,
  guardarOrdenApi,
  addVendedor,
  contextoActual,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from '@/lib/storage'
import { leerCarrito, guardarCarrito, borrarCarrito } from '@/lib/posCart'
import { fechaClave, num, gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import { allocateCheckout } from '@/utils/checkout'
import { tradeInDraftPayment } from '@/utils/tradeInCheckout'
import { validateDemoPromotionItems, recordDemoPromotionUsage } from '@/lib/demoPromotions'
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
  PinInput,
} from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { parsePercent } from '@/components/shared/PercentField'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import { accountPayment } from './PaymentAccountFields'
import ComprobantePreview from '@/components/shared/ComprobantePreview'
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

export default function FormularioVenta({
  onGuardado,
  onCarrito,
  tradeInDraft,
  onTradeInConsumed,
}) {
  const { sesion, esDemo, empresa } = useSesion()
  const puedeDescontar = esDemo || ['dueno', 'GERENTE'].includes(sesion?.rol)
  const productos = getProductos().filter(p => p.activo)
  const familias = agruparProductos(productos)
  // Carrito persistido: se restaura una sola vez al montar el formulario.
  const [cartInicial] = useState(() => leerCarritoInicial())
  const [f, setF] = useState(() => ({
    ...VACIO(sesion?.vendedorId || localStorage.getItem(ULTIMO_VENDEDOR)),
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
  const [nuevoVend, setNuevoVend] = useState(false)
  const [nombreVend, setNombreVend] = useState('')
  const [pinVend, setPinVend] = useState('')
  const [errorVend, setErrorVend] = useState('')
  const [creandoVend, setCreandoVend] = useState(false)
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
  const [paso, setPaso] = useState(1)
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
  const [descartarPendiente, setDescartarPendiente] = useState(null)
  const [descartando, setDescartando] = useState(false)
  const [avisoSuspension, setAvisoSuspension] = useState('')
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
      return {
        ...it,
        precio: esUsd ? Number(it.precio) || 0 : Number(info.unitPricePyg) || 0,
        precioOrigen: info.origin,
        precioLista: info.priceList?.name || null,
        precioMinQty: info.minQty ?? null,
        precioUsd: esUsd ? Number(info.unitPriceUsd) : null,
        precioListaValor: esUsd ? null : Number(info.unitPricePyg) || 0,
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
    if (info && info.currency !== 'USD') return Number(info.unitPricePyg) || 0
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

  // Informa al contenedor lo que lleva esta compra, para pintarlo en el lateral.
  useEffect(() => {
    if (!onCarrito) return
    const paraLateral = items.map(it => ({
      ...it,
      nombre: (it.quantity || 1) > 1 ? `${it.nombre} ×${it.quantity}` : it.nombre,
      precio: it.precio * (it.quantity || 1),
    }))
    onCarrito({
      items: paraLateral,
      quitar: quitarItem,
      puedeRevisar: puedePaso2,
      irARevisar: () => setPaso(2),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f.cliente])
  // Escaneo de etiqueta de precio (MOBOS:PROD:<sku>): agrega el producto al
  // carrito directo, sin buscarlo a mano. El lector USB escribe como teclado.
  useEffect(() => {
    const match = busquedaProducto.trim().toUpperCase().match(/^MOBOS:PROD:([A-Z0-9-]+)$/)
    if (!match) return
    const producto = productos.find(item => String(item.sku || '').toUpperCase() === match[1])
    if (producto) { agregarProducto(producto); setBusquedaProducto('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaProducto, productos])

  const familiasVisibles = familias.filter(fam => {
    const query = busquedaProducto.trim().toLocaleLowerCase()
    if (!query) return true
    return [fam.base, ...fam.items.map(item => item.nombre)].some(text =>
      text.toLocaleLowerCase().includes(query),
    )
  })

  async function crearVendedor() {
    const nombre = nombreVend.trim()
    if (!nombre) return
    setErrorVend('')
    if (!esDemo && !/^\d{4}$/.test(pinVend)) {
      setErrorVend('Ingresá un PIN de 4 dígitos para el vendedor.')
      return
    }
    setCreandoVend(true)
    try {
      let v
      if (esDemo) {
        v = addVendedor(nombre)
      } else {
        const created = await resources.users.create({
          name: nombre,
          pin: pinVend,
          role: 'VENDEDOR',
        })
        v = { id: created.id, nombre: created.name, activo: created.status === 'ACTIVE' }
      }
      setNuevoVend(false)
      setNombreVend('')
      setPinVend('')
      setF(s => ({ ...s, vendedorId: v.id }))
    } catch (error) {
      setErrorVend(error?.message || 'No se pudo crear el vendedor.')
    } finally {
      setCreandoVend(false)
    }
  }

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
    if (paso !== 3) return
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
    let lineas
    let payments
    try {
      const sinImei = lista.filter(it => it.requiereSerie && !it.serials?.length && !it.sobrePedido)
      if (sinImei.length)
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
      if (!cuentas || errorCuentas)
        throw new Error(errorCuentas || 'Esperá a que terminen de cargar las cuentas.')
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
        if (!producto || num(producto.stock) < cantidad)
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
    try {
      if (!esDemo) {
        const order = await guardarOrdenApi(
          {
            ...(customer.id
              ? { customerId: customer.id }
              : {
                  customer: {
                    name: f.cliente.trim(),
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
          },
          { idempotencyKey: idempotencyKeyRef.current },
        )
        if (!order?.id || order.error || order.ok === false)
          throw new Error(order?.error || 'No se recibió confirmación de la orden.')
        ventaPersistida = true
        completedOrder = order
      } else {
        const validation = await validateDemoTradeIns(payments)
        if (validation === false || validation?.error || validation?.ok === false)
          throw new Error(validation?.error || 'No se pudo validar el canje.')
        const clientesDemo = JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]')
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
          localStorage.setItem(
            'mobos:demo-customers:v1',
            JSON.stringify([...clientesDemo, clienteDemo]),
          )
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

      localStorage.setItem(ULTIMO_VENDEDOR, f.vendedorId)
      idempotencyKeyRef.current = null // la próxima venta arranca con clave nueva
      const { empresaId, sucursalId } = contextoActual()
      borrarCarrito(empresaId, sucursalId)
      setCustomer({ ...CLIENTE_VACIO })
      setItems([])
      setDescuento('')
      setAuthDescuento(null)
      setPagos([])
      setF(VACIO(f.vendedorId))
      setBusquedaProducto('')
      setLastOrder(completedOrder)
      setPaso(1)
      setOk(true)
      setTimeout(() => setOk(false), 2500)
      onGuardado?.()
    } catch (error) {
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

  function agregarPago() {
    if (!cuentas) return
    setPagos(arr => [
      ...arr,
      usaCuentas
        ? { ...PAGO_VACIO, accountId: '', originalAmount: '', exchangeRatePyg: '' }
        : { ...PAGO_VACIO, monto: pendiente > 0 ? String(pendiente) : '' },
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
    setPaso(1)
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
  function pedirRecuperar(suspendida) {
    if (carritoConDatos) {
      setRecuperarPendiente(suspendida)
      return
    }
    recuperarSuspendida(suspendida)
  }
  // Carga el payload guardado en el formulario y recién después descarta la
  // suspendida: el backend no la borra sola al recuperarla.
  async function recuperarSuspendida(suspendida) {
    setRecuperarPendiente(null)
    const payload = suspendida?.payload
    if (!payload || typeof payload !== 'object') {
      setErrorSuspendidas(
        'El servidor no devolvió el carrito guardado: no se puede recuperar esta venta.',
      )
      return
    }
    const cliente = clienteGuardado(payload.customer)
    setItems(itemsGuardados(payload.items))
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
    setPaso(1)
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

  const pasos = ['Cliente y productos', 'Revisar carrito', 'Cobrar']
  const puedePaso2 = Boolean(f.cliente.trim() && items.length > 0)
  function siguientePaso() {
    if (paso === 1 && puedePaso2) setPaso(2)
    else if (paso === 2) setPaso(3)
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
      if (event.key === 'Escape') {
        if (nuevoVend) {
          event.preventDefault()
          setNuevoVend(false)
          setErrorVend('')
          return
        }
        return
      }
      if (editable) return
      if (event.key === 'F2') {
        event.preventDefault()
        busqueda?.focus()
        return
      }
      if (event.key === 'F6') {
        if (paso === 1 && puedePaso2) {
          event.preventDefault()
          setPaso(2)
        }
        return
      }
      if (event.key === 'F7') {
        if (paso === 2) {
          event.preventDefault()
          setPaso(3)
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        if (
          paso === 3 &&
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
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-ink-600 pb-4">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
            <Icon name="receipt" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Nueva venta</h2>
            <p className="mt-0.5 text-xs text-mute">
              El vendedor se asigna desde tu sesión. Agregá el cliente y los productos.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-fono/20 bg-fono/5 px-3 py-1 text-xs font-semibold text-fono-light">
          Hoy: {fechaClave().split('-').reverse().join('/')}
        </span>
      </div>

      {ok && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-ok/30 bg-ok/10 p-4 text-ok"
        >
          <span>Venta registrada correctamente. Ya podés cargar la siguiente.</span>
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
      {paso !== 3 && pagos.some(p => p.tradeIn) && (
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
          // Enter avanza entre pasos; en "Cobrar" el Enter nativo confirma la venta.
          if (paso < 3) {
            event.preventDefault()
            siguientePaso()
          }
        }}
        className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2"
      >
        {errorVenta && (
          <p
            role="alert"
            className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad md:col-span-2"
          >
            {errorVenta}
          </p>
        )}
        <nav
          aria-label="Pasos de la venta"
          className="grid grid-cols-3 gap-1 rounded-2xl border border-ink-600 bg-ink-800/50 p-1 md:col-span-2"
        >
          {pasos.map((nombre, index) => {
            const n = index + 1
            const completado = n < paso
            return (
              <button
                key={nombre}
                type="button"
                onClick={() => n <= paso && setPaso(n)}
                disabled={n > paso}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold transition sm:px-3',
                  paso === n
                    ? 'bg-fono text-onbrand shadow-lg shadow-fono/15'
                    : completado
                      ? 'text-fono-light hover:bg-fono/10'
                      : 'cursor-not-allowed text-mute/60',
                )}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', paso === n ? 'bg-onbrand/20' : completado ? 'bg-fono/20' : 'bg-ink-700')}>
                  {completado ? <Icon name="check" className="h-3 w-3" /> : `0${n}`}
                </span>
                <span className="truncate">{nombre}</span>
              </button>
            )
          })}
        </nav>
        <div className="h-1 overflow-hidden rounded-full bg-ink-700 md:col-span-2">
          <div className="h-full rounded-full bg-fono transition-all duration-300" style={{ width: `${(paso / 3) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-mute md:col-span-2">
          <span>Paso {paso} de 3</span>
          {paso === 3 && (
            <span className="text-fono-light">Revisá los montos antes de confirmar</span>
          )}
        </div>
        {/* Carrito en espera: suspender la venta actual y retomar otra. */}
        <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
          <Button type="button" variant="outline" onClick={abrirSuspendidas}>
            <Icon name="clock" className="h-4 w-4" />
            Ventas suspendidas
          </Button>
          {items.length > 0 && (
            <Button type="button" variant="outline" onClick={abrirSuspender} disabled={guardando}>
              <Icon name="save" className="h-4 w-4" />
              Suspender venta
            </Button>
          )}
        </div>
        <div className="hidden items-center gap-x-4 gap-y-1.5 text-[11px] text-mute md:col-span-2 md:flex">
          <span className="font-semibold uppercase tracking-wider text-mute/60">Atajos</span>
          <Atajo k="F2" label="Buscar producto" />
          <Atajo k="F6" label="Revisar carrito" />
          <Atajo k="F7" label="Ir a cobrar" />
          <Atajo k="Ctrl+S" label="Guardar venta" />
          <Atajo k="Esc" label="Cerrar ventana" />
        </div>
        <PasoProductos
          visible={paso === 1}
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
          busquedaProducto={busquedaProducto}
          setBusquedaProducto={setBusquedaProducto}
          combos={combos}
          agregarCombo={agregarCombo}
          noticeCombo={noticeCombo}
          familiasVisibles={familiasVisibles}
          agregarProducto={agregarProducto}
          familias={familias}
          items={items}
          totalCarrito={totalCarrito}
          quitarItem={quitarItem}
          editarItem={editarItem}
          onImei={setImeiPara}
          puedeDescontar={puedeDescontar}
          precioDe={precioDe}
          guardando={guardando}
          puedePaso2={puedePaso2}
          siguientePaso={siguientePaso}
          setNuevoVend={setNuevoVend}
          setErrorVend={setErrorVend}
          setPinVend={setPinVend}
        />

        <PasoCarrito
          visible={paso === 2}
          items={items}
          productos={productos}
          familias={familias}
          esDemo={esDemo}
          guardando={guardando}
          puedeDescontar={puedeDescontar}
          precioDe={precioDe}
          totalCarrito={totalCarrito}
          quitarItem={quitarItem}
          editarItem={editarItem}
          onImei={setImeiPara}
          descuento={descuento}
          setDescuento={setDescuento}
          montoDescuento={gsNum(descuento)}
          customer={customer}
          onAuthDescuento={onAuthDescuento}
          montoPrecioBajo={excedenteBajoLista}
          productoBajoId={productoBajoId}
          onAuthPrecio={setAuthPrecio}
          tieneCupon={tieneCupon}
          f={f}
          setF={setF}
          onAtras={() => setPaso(1)}
          onSiguiente={siguientePaso}
        />

        {/* Pedido especial con seña: solo marca el pedido y su fecha esperada;
            las reglas de cobro no cambian (la seña es un pago parcial). */}
        {paso === 3 && (
          <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 md:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-warn"
                checked={Boolean(f.specialOrder)}
                onChange={event =>
                  setF(s => ({
                    ...s,
                    specialOrder: event.target.checked,
                    ...(event.target.checked ? {} : { expectedAt: '' }),
                  }))
                }
              />
              <span>
                <b className="text-fore">Pedido especial con seña</b>: el pedido se completa más
                adelante y la seña es el pago parcial que cargás abajo.
              </span>
            </label>
            {f.specialOrder && (
              <div className="mt-3 max-w-xs">
                <Label htmlFor="fecha-esperada">Fecha esperada (opcional)</Label>
                <Input
                  id="fecha-esperada"
                  type="date"
                  min={fechaClave()}
                  value={f.expectedAt}
                  onChange={set('expectedAt')}
                />
              </div>
            )}
          </div>
        )}

        <PasoCobro
          visible={paso === 3}
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
          onAtras={() => setPaso(2)}
          valido={valido}
          cantTotal={cantTotal}
          ok={ok}
        />
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
              <label className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-mute">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-warn"
                  checked={Boolean(fila.sobrePedido)}
                  onChange={event => editarItem(fila.key, { sobrePedido: event.target.checked, serials: event.target.checked ? [] : fila.serials || [] })}
                />
                <span>
                  Vender <b className="text-fore">sin IMEI (sobre pedido)</b>: el cliente reserva sin
                  stock; el IMEI se completa al entregar.
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
        open={nuevoVend}
        onClose={
          creandoVend
            ? undefined
            : () => {
                setNuevoVend(false)
                setErrorVend('')
              }
        }
        title="Nuevo vendedor"
        className="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre"
              autoFocus
              value={nombreVend}
              onChange={e => setNombreVend(e.target.value)}
              placeholder="Nombre del vendedor"
              autoCapitalize="words"
            />
          </div>
          {!esDemo && (
            <div>
              <Label htmlFor="pin-vendedor">PIN (4 dígitos)</Label>
              <PinInput id="pin-vendedor" value={pinVend} onChange={setPinVend} />
            </div>
          )}
          {errorVend && (
            <p
              role="alert"
              className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
            >
              {errorVend}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNuevoVend(false)
                setErrorVend('')
              }}
              disabled={creandoVend}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={crearVendedor}
              disabled={creandoVend || !nombreVend.trim()}
            >
              {creandoVend ? 'Creando…' : 'Crear vendedor'}
            </Button>
          </div>
        </div>
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

      {lastOrder && <ComprobantePreview order={lastOrder} open={comprobante} onClose={() => setComprobante(false)} />}
    </Card>
  )
}
