import { useEffect, useRef, useState } from 'react'
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
import { agruparProductos } from '@/utils/colores'
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
} from '@/components/ui'
import SelectorColor from './SelectorColor'
import Icon from '@/components/shared/Icon'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import { accountPayment } from './PaymentAccountFields'
import { printOrderReceipt } from '@/components/shared/OrderReceipt'
import { whatsappTrackingLink } from './PagosPedido'
import { telefonoValido, MENSAJE_TELEFONO } from '@/utils/telefono'
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

export default function FormularioVenta({
  onGuardado,
  onCarrito,
  ocultarCarrito = false,
  tradeInDraft,
  onTradeInConsumed,
}) {
  const { sesion, esDemo } = useSesion()
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
  const [familiaActiva, setFamiliaActiva] = useState(null) // { base, items } cuando se eligió una familia con colores
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [modalColor, setModalColor] = useState(false)
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
  const [pagos, setPagos] = useState(() =>
    Array.isArray(cartInicial?.pagos) ? cartInicial.pagos : [],
  )
  const [errorVenta, setErrorVenta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [paso, setPaso] = useState(1)
  const [cuentas, setCuentas] = useState(null)
  const [errorCuentas, setErrorCuentas] = useState('')
  const [intentoCuentas, setIntentoCuentas] = useState(0)
  const [serialRequired, setSerialRequired] = useState(false)
  // Sobre pedido: vender un modelo guardado sin IMEI cuando no hay stock
  // disponible; el IMEI se completa al entregar.
  const [sobrePedido, setSobrePedido] = useState(false)
  // Precio mayorista aplicado al producto seleccionado (cliente WHOLESALE).
  const [precioMayorista, setPrecioMayorista] = useState(false)
  // Venta a crédito: plazo en días y límite del cliente.
  const [venderACredito, setVenderACredito] = useState(false)
  const [creditoDias, setCreditoDias] = useState('')
  // Factura a otro titular (esposo/a, padre, empresa) con RUC.
  const [billingTo, setBillingTo] = useState({ name: '', document: '' })
  const [lastOrder, setLastOrder] = useState(null)
  const guardadoEnCurso = useRef(false)
  const [guardadoIncompleto, setGuardadoIncompleto] = useState(false)
  // Misma clave idempotente para todos los reintentos de una misma venta;
  // se regenera recién cuando la venta quedó confirmada.
  const idempotencyKeyRef = useRef(null)
  const usaCuentas = Boolean(cuentas?.length)
  const appliedTradeIn = useRef(null)

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
      setF(current => ({ ...current, productoId: handoff.productId, serials: serial ? [serial] : [], precio: '' }))
      if (serial) setSerialRequired(true)
    } catch { /* handoff corrupto: se ignora */ }
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
  // Precio de lista que corresponde a esta venta: mayorista si el cliente lo es.
  function precioListaDe(id) {
    const producto = productos.find(p => p.id === id)
    if (!producto) return undefined
    if (customer?.pricingTier === 'WHOLESALE' && Number(producto.wholesalePricePyg) > 0) return Number(producto.wholesalePricePyg)
    return Number(producto.precioVenta) || 0
  }
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
      }
    })
    setItems(arr => [...arr, ...nuevas])
    setNoticeCombo(`Combo ${combo.name} agregado: ${nuevas.length} componentes por ${gs(precioCombo)}.`)
  }

  function agregarItem() {
    if (!f.productoId || gsNum(f.precio) <= 0 || (serialRequired && !f.serials.length && !sobrePedido)) return
    setItems(arr => {
      // Mismo producto, cupón y condición, sin IMEI/seriales de por medio:
      // se suma la cantidad en vez de repetir la fila. Las líneas con seriales
      // quedan siempre separadas porque cada equipo es una unidad trazable.
      const indice = !f.serials.length
        ? arr.findIndex(
            it =>
              it.productoId === f.productoId &&
              !it.serials?.length &&
              it.couponCode === f.couponCode &&
              Boolean(it.soldWithoutInsurance) === Boolean(f.soldWithoutInsurance) &&
              Boolean(it.sobrePedido) === Boolean(sobrePedido),
          )
        : -1
      if (indice >= 0) {
        return arr.map((it, i) => (i === indice ? { ...it, quantity: (it.quantity || 1) + 1 } : it))
      }
      return [
        ...arr,
        {
          key: `${Date.now()}-${Math.random()}`,
          productoId: f.productoId,
          nombre: nombreDe(f.productoId),
          precio: gsNum(f.precio),
          quantity: 1,
          couponCode: f.couponCode,
          soldWithoutInsurance: f.soldWithoutInsurance,
          serials: f.serials,
          sobrePedido,
        },
      ]
    })
    setF(s => ({
      ...s,
      productoId: '',
      precio: '',
      couponCode: null,
      soldWithoutInsurance: false,
      serials: [],
    }))
    setSerialRequired(false)
    setSobrePedido(false)
    setFamiliaActiva(null)
  }
  function quitarItem(key) {
    setItems(arr => arr.filter(x => x.key !== key))
  }
  function editarDescuento(key, patch) {
    setItems(arr => arr.map(x => (x.key === key ? { ...x, ...patch } : x)))
  }
  // Descuento por línea: porcentual si hay %, si no el fijo en guaraníes.
  const descuentoItem = it => {
    const pct = Number(it.descuentoPct || 0)
    if (pct > 0) return Math.round((it.precio * (it.quantity || 1) * pct) / 100)
    return Math.min(gsNum(it.descuento || 0), it.precio * (it.quantity || 1))
  }

  const totalCarrito = items.reduce((a, it) => a + it.precio * (it.quantity || 1) - descuentoItem(it), 0)
  const tieneCupon = Boolean(f.couponCode || items.some(it => it.couponCode))
  const precioActual = f.productoId && gsNum(f.precio) > 0 ? gsNum(f.precio) : 0
  const subtotal = totalCarrito + precioActual
  const totalGeneral = Math.max(0, subtotal - gsNum(descuento) + gsNum(f.montoDelivery))
  const totalPagado = pagos.reduce((s, p) => s + gsNum(p.monto), 0)
  // Descuento sugerido por el medio elegido (ej. efectivo 5%).
  const descuentoMedioPct = Math.max(0, ...pagos.map(pago => Number(cuentas?.find(cuenta => cuenta.id === pago.accountId)?.discountPct || 0)), 0)
  const descuentoMedioGs = Math.round((subtotal * descuentoMedioPct) / 100)
  const pendiente = Math.max(0, totalGeneral - totalPagado)

  const cantTotal = items.reduce((a, it) => a + (it.quantity || 1), 0) + (precioActual > 0 ? 1 : 0)
  const valido =
    sesion?.vendedorId &&
    f.cliente.trim() &&
    cantTotal > 0 &&
    totalPagado <= totalGeneral &&
    gsNum(descuento) <= subtotal

  // Informa al contenedor lo que lleva esta compra, para pintarlo en el lateral.
  useEffect(() => {
    if (!onCarrito) return
    const actual =
      f.productoId && gsNum(f.precio) > 0
        ? [
            {
              key: '__actual__',
              nombre: nombreDe(f.productoId),
              precio: gsNum(f.precio),
              serials: f.serials,
            },
          ]
        : []
    const paraLateral = items.map(it => ({
      ...it,
      nombre: (it.quantity || 1) > 1 ? `${it.nombre} ×${it.quantity}` : it.nombre,
      precio: it.precio * (it.quantity || 1),
    }))
    onCarrito({ items: [...paraLateral, ...actual], quitar: quitarItem })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f.productoId, f.precio])

  // Producto/color elegido actualmente (para el chip).
  const itemActivo =
    familiaActiva && f.productoId ? familiaActiva.items.find(it => it.id === f.productoId) : null
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

  function aplicarProducto(p) {
    // Cliente mayorista: el precio se precarga desde wholesalePricePyg.
    const mayorista = customer?.pricingTier === 'WHOLESALE' && Number(p.wholesalePricePyg) > 0
    setF(s => ({
      ...s,
      productoId: p.id,
      precio: mayorista ? String(p.wholesalePricePyg) : p && p.precioVenta > 0 ? String(p.precioVenta) : '',
      couponCode: null,
      soldWithoutInsurance: false,
      serials: [],
    }))
    setSerialRequired(false)
    setSobrePedido(false)
    setPrecioMayorista(mayorista)
  }

  function elegirProducto(e) {
    const v = e.target.value
    if (v === '__nuevo__') {
      setNuevoProd(true)
      return
    }
    if (v.startsWith('fam:')) {
      // Familia con varios colores abrir la ventana para elegir color.
      const fam = familias.find(x => 'fam:' + x.base === v)
      setFamiliaActiva(fam)
      setF(s => ({ ...s, productoId: '' }))
      setModalColor(true)
      return
    }
    // Producto directo (sin colores)
    setFamiliaActiva(null)
    const p = productos.find(x => x.id === v)
    if (p) aplicarProducto(p)
  }

  function elegirColor(item) {
    aplicarProducto(item)
    setModalColor(false)
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

  const skuDe = texto => `${texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'PRODUCTO'}-${Date.now().toString(36).toUpperCase()}`

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
        // Producto sin colores: uno solo, queda elegido para esta venta.
        const p = await crear(base)
        setFamiliaActiva(null)
        setF(s => ({ ...s, productoId: p.id }))
      } else {
        // Con colores se crea una variante por color ("Base Color") y se elige.
        const items = []
        for (const c of coloresNuevos) items.push({ ...(await crear(`${base} ${c}`)), color: c })
        setFamiliaActiva({ base, items })
        setF(s => ({ ...s, productoId: '' }))
        setModalColor(true)
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
    // Lista final = lo agregado al carrito + lo que esté seleccionado ahora.
    const lista = [...items]
    if (f.productoId && gsNum(f.precio) > 0) {
      lista.push({
        productoId: f.productoId,
        precio: gsNum(f.precio),
        couponCode: f.couponCode,
        soldWithoutInsurance: f.soldWithoutInsurance,
        serials: f.serials,
      })
    }
    if (
      !sesion?.vendedorId ||
      !f.cliente.trim() ||
      lista.length === 0 ||
      totalPagado > totalGeneral
    )
      return
    const orderItems = lista.map(it => {
      const pct = Number(it.descuentoPct || 0)
      const fijo = gsNum(it.descuento || 0)
      return {
        productId: it.productoId,
        description: nombreDe(it.productoId),
        quantity: it.quantity || 1,
        unitPricePyg: it.precio,
        soldWithoutInsurance: Boolean(it.soldWithoutInsurance),
        ...(it.serials?.length ? { inventoryUnitSerials: it.serials } : {}),
        ...(it.couponCode ? { couponCode: it.couponCode } : {}),
        ...(pct > 0 ? { discountPct: pct } : fijo > 0 ? { discountPyg: fijo } : {}),
      }
    })
    // El demo registra una venta por unidad: las filas con cantidad > 1 se
    // expanden para que descuento, pagos y stock se repartan por unidad.
    const listaDemo = esDemo
      ? lista.flatMap(it =>
          Array.from({ length: it.quantity || 1 }, () => ({ ...it, quantity: 1 })),
        )
      : lista
    setErrorVenta('')
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = `pos-${crypto.randomUUID()}`
    let lineas
    let payments
    try {
      if (tieneCupon && gsNum(descuento) > 0)
        throw new Error('Quitá el descuento extra para utilizar un cupón. No son acumulables.')
      if (customer.phone?.trim() && !telefonoValido(customer.phone, customer.countryCode))
        throw new Error(MENSAJE_TELEFONO)
      if (!puedeDescontar && gsNum(descuento) > 0)
        throw new Error('Solo administradores y gerentes pueden aplicar descuentos.')
      if (!puedeDescontar && items.some(it => descuentoItem(it) > 0))
        throw new Error('Solo administradores y gerentes pueden aplicar descuentos por línea.')
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
                c.name.toLowerCase() === customer.name.trim().toLowerCase() &&
                (!customer.phone || c.phone === customer.phone),
            ) || { ...customer, name: customer.name.trim(), id: crypto.randomUUID() }
        const ventas = []
        for (const [i, it] of lineas.entries()) {
          const venta = await addVenta({
            compraId,
            vendedorId: sesion.vendedorId,
            cliente: f.cliente,
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
          cliente: f.cliente.trim(),
          vendedorId: sesion.vendedorId,
          seller: { id: sesion.vendedorId, name: sesion.nombre },
          fecha: fechaVenta,
          totalPyg: totalGeneral,
          payments,
          ventas,
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
      setCustomer({
        name: '',
        phone: '',
        countryCode: '+595',
        email: '',
        document: '',
        addresses: [],
      })
      setItems([])
      setDescuento('')
      setPagos([])
      setF(VACIO(f.vendedorId))
      setFamiliaActiva(null)
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

  const pasos = ['Cliente y productos', 'Revisar carrito', 'Cobrar']
  const puedePaso2 = Boolean(f.cliente.trim() && items.length > 0 && !f.productoId)
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
        if (modalColor) {
          event.preventDefault()
          setModalColor(false)
          return
        }
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
      if (event.key === 'F3') {
        if (
          paso === 1 &&
          f.productoId &&
          gsNum(f.precio) > 0 &&
          !(serialRequired && !f.serials.length && !sobrePedido)
        ) {
          event.preventDefault()
          agregarItem()
        }
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
              <Button
                type="button"
                variant="outline"
                onClick={() => printOrderReceipt(lastOrder, { format: 'a4' })}
              >
                Imprimir A4
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => printOrderReceipt(lastOrder, { format: 'thermal' })}
              >
                Imprimir térmico
              </Button>
            </>
          )}
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
            className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-red-300 md:col-span-2"
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
        <div className="hidden items-center gap-x-4 gap-y-1.5 text-[11px] text-mute md:col-span-2 md:flex">
          <span className="font-semibold uppercase tracking-wider text-mute/60">Atajos</span>
          <Atajo k="F2" label="Buscar producto" />
          <Atajo k="F3" label="Agregar a la lista" />
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
          f={f}
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
          elegirProducto={elegirProducto}
          familiaActiva={familiaActiva}
          itemActivo={itemActivo}
          setModalColor={setModalColor}
          precioMayorista={precioMayorista}
          serialRequired={serialRequired}
          setSerialRequired={setSerialRequired}
          sobrePedido={sobrePedido}
          setSobrePedido={setSobrePedido}
          guardando={guardando}
          gsNum={gsNum}
          agregarItem={agregarItem}
          puedePaso2={puedePaso2}
          siguientePaso={siguientePaso}
          setNuevoVend={setNuevoVend}
          setErrorVend={setErrorVend}
          setPinVend={setPinVend}
        />

        <PasoCarrito
          visible={paso === 2}
          ocultarCarrito={ocultarCarrito}
          items={items}
          puedeDescontar={puedeDescontar}
          descuentoItem={descuentoItem}
          totalCarrito={totalCarrito}
          quitarItem={quitarItem}
          editarDescuento={editarDescuento}
          descuento={descuento}
          setDescuento={setDescuento}
          tieneCupon={tieneCupon}
          f={f}
          setF={setF}
          onAtras={() => setPaso(1)}
          onSiguiente={siguientePaso}
        />

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

      {modalColor && familiaActiva && (
        <SelectorColor
          base={familiaActiva.base}
          items={familiaActiva.items}
          onPick={elegirColor}
          onCancel={() => setModalColor(false)}
        />
      )}

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
            <Label>Nombre</Label>
            <Input
              autoFocus
              value={nombreVend}
              onChange={e => setNombreVend(e.target.value)}
              placeholder="Nombre del vendedor"
              autoCapitalize="words"
            />
          </div>
          {!esDemo && (
            <div>
              <Label>PIN (4 dígitos)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinVend}
                onChange={e => setPinVend(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Ej. 2468"
              />
            </div>
          )}
          {errorVend && (
            <p
              role="alert"
              className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-red-300"
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
    </Card>
  )
}
