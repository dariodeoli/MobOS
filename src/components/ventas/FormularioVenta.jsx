import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import {
  getProductos,
  addProducto,
  addVenta,
  guardarOrdenApi,
  getVendedores,
  addVendedor,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from '@/lib/storage'
import { fechaClave, num, gs, gsInput } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import { allocateCheckout } from '@/utils/checkout'
import { tradeInDraftPayment } from '@/utils/tradeInCheckout'
import { validateDemoPromotionItems, recordDemoPromotionUsage } from '@/lib/demoPromotions'
import { api } from '@/lib/api/client'
import { agruparProductos } from '@/utils/colores'
import { Button, Card, Input, Label, Select, Textarea, Badge } from '@/components/ui'
import SelectorColor from './SelectorColor'
import CheckoutCustomer from './CheckoutCustomer'
import ProductPrice from './ProductPrice'
import Icon from '@/components/shared/Icon'
import SelectorMedioPago from '@/components/shared/SelectorMedioPago'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { validateDemoTradeIns, recordDemoTradeIns } from '@/lib/tradeInPipeline'
import PaymentAccountFields, { accountPayment, updateAccountPayment } from './PaymentAccountFields'
import SerialUnitPicker from '@/components/inventory/SerialUnitPicker'

// Recuerda el último vendedor elegido en esta compu, para no re-seleccionarlo
// en cada venta (suelen ser ráfagas de la misma persona).
const ULTIMO_VENDEDOR = 'fono:ultimoVendedor'

// Montos en ₲ son enteros y se escriben con puntos de miles ("20.000"). Tomamos
// solo los dígitos para no confundir el punto con un decimal (evita 20.000 20).
const gsNum = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

const VACIO = (vendedorId) => ({
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

export default function FormularioVenta({ onGuardado, onCarrito, ocultarCarrito = false, tradeInDraft, onTradeInConsumed }) {
  const { sesion, esDemo } = useSesion()
  const productos = getProductos().filter((p) => p.activo)
  const familias = agruparProductos(productos)
  const vendedores = getVendedores().filter((v) => v.activo)
  const [f, setF] = useState(() => VACIO(sesion?.vendedorId || localStorage.getItem(ULTIMO_VENDEDOR)))
  const [customer, setCustomer] = useState({ name: '', phone: '', countryCode: '+595', email: '', document: '', addresses: [] })
  const [nuevoProd, setNuevoProd] = useState(false)
  const [nombreProd, setNombreProd] = useState('')
  const [coloresNuevos, setColoresNuevos] = useState([])
  const [colorInput, setColorInput] = useState('')
  const [familiaActiva, setFamiliaActiva] = useState(null) // { base, items } cuando se eligió una familia con colores
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [modalColor, setModalColor] = useState(false)
  const [nuevoVend, setNuevoVend] = useState(false)
  const [nombreVend, setNombreVend] = useState('')
  const [ok, setOk] = useState(false)
  const [items, setItems] = useState([]) // carrito: varios productos del mismo cliente
  const [descuento, setDescuento] = useState('')
  const [pagos, setPagos] = useState([])
  const [errorVenta, setErrorVenta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [paso, setPaso] = useState(1)
  const [cuentas, setCuentas] = useState(null)
  const [errorCuentas, setErrorCuentas] = useState('')
  const [intentoCuentas, setIntentoCuentas] = useState(0)
  const [serialRequired, setSerialRequired] = useState(false)
  const guardadoEnCurso = useRef(false)
  const [guardadoIncompleto, setGuardadoIncompleto] = useState(false)
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
    } catch (error) { setErrorVenta(error.message) }
  }, [tradeInDraft, cuentas, pagos, onTradeInConsumed])

  useEffect(() => {
    let vigente = true
    setCuentas(null)
    setErrorCuentas('')
    Promise.resolve().then(() => getPaymentAccounts()).then((result) => {
      if (!Array.isArray(result)) throw new Error('Respuesta inválida al cargar cuentas.')
      if (vigente) setCuentas(result)
    }).catch((error) => {
      if (vigente) setErrorCuentas(error?.message || 'No se pudieron cargar las cuentas de cobro.')
    })
    return () => { vigente = false }
  }, [esDemo, intentoCuentas])

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // Si cambia el día (o se corrige el reloj) con la app abierta, resincroniza la
  // fecha a HOY, salvo que la hayas elegido a mano.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'visible') return
      setF((s) => (s.fechaManual || s.fecha === fechaClave() ? s : { ...s, fecha: fechaClave() }))
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

  function nombreDe(id) {
    return productos.find((p) => p.id === id)?.nombre || ''
  }
  function agregarItem() {
    if (!f.productoId || gsNum(f.precio) <= 0 || (serialRequired && !f.serials.length)) return
    setItems((arr) => [
      ...arr,
      {
        key: `${Date.now()}-${Math.random()}`,
        productoId: f.productoId,
        nombre: nombreDe(f.productoId),
        precio: gsNum(f.precio),
        couponCode: f.couponCode,
        soldWithoutInsurance: f.soldWithoutInsurance,
        serials: f.serials,
      },
    ])
    setF((s) => ({ ...s, productoId: '', precio: '', couponCode: null, soldWithoutInsurance: false, serials: [] }))
    setSerialRequired(false)
    setFamiliaActiva(null)
  }
  function quitarItem(key) {
    setItems((arr) => arr.filter((x) => x.key !== key))
  }

  const totalCarrito = items.reduce((a, it) => a + it.precio, 0)
  const tieneCupon = Boolean(f.couponCode || items.some(it => it.couponCode))
  const precioActual = f.productoId && gsNum(f.precio) > 0 ? gsNum(f.precio) : 0
  const subtotal = totalCarrito + precioActual
  const totalGeneral = Math.max(0, subtotal - gsNum(descuento) + gsNum(f.montoDelivery))
  const totalPagado = pagos.reduce((s, p) => s + gsNum(p.monto), 0)
  const pendiente = Math.max(0, totalGeneral - totalPagado)

  const cantTotal = items.length + (precioActual > 0 ? 1 : 0)
  const valido = sesion?.vendedorId && f.cliente.trim() && cantTotal > 0 && totalPagado <= totalGeneral && gsNum(descuento) <= subtotal

  // Informa al contenedor lo que lleva esta compra, para pintarlo en el lateral.
  useEffect(() => {
    if (!onCarrito) return
    const actual =
      f.productoId && gsNum(f.precio) > 0
        ? [{ key: '__actual__', nombre: nombreDe(f.productoId), precio: gsNum(f.precio), serials: f.serials }]
        : []
    onCarrito({ items: [...items, ...actual], quitar: quitarItem })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f.productoId, f.precio])

  // Lo que muestra el <Select>: la familia (si hay color elegido) o el id directo.
  const valorSelect = familiaActiva ? 'fam:' + familiaActiva.base : f.productoId
  // Producto/color elegido actualmente (para el chip).
  const itemActivo =
    familiaActiva && f.productoId ? familiaActiva.items.find((it) => it.id === f.productoId) : null
  const familiasVisibles = familias.filter((fam) => {
    const query = busquedaProducto.trim().toLocaleLowerCase()
    if (!query) return true
    return [fam.base, ...fam.items.map((item) => item.nombre)].some((text) => text.toLocaleLowerCase().includes(query))
  })

  function elegirVendedor(e) {
    const v = e.target.value
    if (v === '__nuevo__') {
      setNuevoVend(true)
      return
    }
    setF((s) => ({ ...s, vendedorId: v }))
  }

  function crearVendedor() {
    const nombre = nombreVend.trim()
    if (!nombre) return
    const v = addVendedor(nombre)
    setNuevoVend(false)
    setNombreVend('')
    setF((s) => ({ ...s, vendedorId: v.id }))
  }

  function aplicarProducto(p) {
    setF((s) => ({
      ...s,
      productoId: p.id,
      precio: p && p.precioVenta > 0 ? String(p.precioVenta) : '',
      couponCode: null,
      soldWithoutInsurance: false,
      serials: [],
    }))
    setSerialRequired(false)
  }

  function elegirProducto(e) {
    const v = e.target.value
    if (v === '__nuevo__') {
      setNuevoProd(true)
      return
    }
    if (v.startsWith('fam:')) {
      // Familia con varios colores abrir la ventana para elegir color.
      const fam = familias.find((x) => 'fam:' + x.base === v)
      setFamiliaActiva(fam)
      setF((s) => ({ ...s, productoId: '' }))
      setModalColor(true)
      return
    }
    // Producto directo (sin colores)
    setFamiliaActiva(null)
    const p = productos.find((x) => x.id === v)
    if (p) aplicarProducto(p)
  }

  function elegirColor(item) {
    aplicarProducto(item)
    setModalColor(false)
  }

  function agregarColor() {
    const c = colorInput.trim()
    if (!c) return
    if (!coloresNuevos.some((x) => x.toLowerCase() === c.toLowerCase()))
      setColoresNuevos((s) => [...s, c])
    setColorInput('')
  }

  function cancelarNuevoProd() {
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
  }

  function crearProducto() {
    const base = nombreProd.trim()
    if (!base) return
    if (coloresNuevos.length === 0) {
      // Producto sin colores uno solo, queda elegido.
      const p = addProducto(base)
      setFamiliaActiva(null)
      setF((s) => ({ ...s, productoId: p.id }))
    } else {
      // Con colores creamos una variante por color ("Base Color") y abrimos
      // la ventana para elegir cuál corresponde a esta venta.
      const items = coloresNuevos.map((c) => {
        const p = addProducto(`${base} ${c}`)
        return { ...p, color: c }
      })
      setFamiliaActiva({ base, items })
      setF((s) => ({ ...s, productoId: '' }))
      setModalColor(true)
    }
    setNuevoProd(false)
    setNombreProd('')
    setColoresNuevos([])
    setColorInput('')
  }

  async function guardar(e) {
    e.preventDefault()
    if (paso !== 3) return
    if (guardando || guardadoEnCurso.current || guardadoIncompleto) return
    // Lista final = lo agregado al carrito + lo que esté seleccionado ahora.
    const lista = [...items]
    if (f.productoId && gsNum(f.precio) > 0) {
      lista.push({ productoId: f.productoId, precio: gsNum(f.precio), couponCode: f.couponCode, soldWithoutInsurance: f.soldWithoutInsurance, serials: f.serials })
    }
    if (!sesion?.vendedorId || !f.cliente.trim() || lista.length === 0 || totalPagado > totalGeneral) return
    const orderItems = lista.map(it => ({ productId: it.productoId, description: nombreDe(it.productoId), quantity: 1, unitPricePyg: it.precio, soldWithoutInsurance: Boolean(it.soldWithoutInsurance), ...(it.serials?.length ? { inventoryUnitSerials: it.serials } : {}), ...(it.couponCode ? { couponCode: it.couponCode } : {}) }))
    setErrorVenta('')
    let lineas
    let payments
    try {
      if (tieneCupon && gsNum(descuento) > 0) throw new Error('Quitá el descuento extra para utilizar un cupón. No son acumulables.')
      if (esDemo) validateDemoPromotionItems(orderItems, productos, gsNum(descuento))
      if (!cuentas || errorCuentas) throw new Error(errorCuentas || 'Esperá a que terminen de cargar las cuentas.')
      if (!usaCuentas && pagos.some(p => !String(p.monto).trim() || gsNum(p.monto) <= 0)) throw new Error('Ingresá un monto positivo en cada pago o quitá la fila vacía.')
      payments = usaCuentas ? pagos.map((p) => accountPayment(p, cuentas)) : pagos.map(p => ({
        method: /efectivo/i.test(p.medioPago) ? 'CASH' : /tarjeta|pos/i.test(p.medioPago) ? 'CARD' : 'TRANSFER',
        originalAmount: gsNum(p.monto), exchangeRatePyg: 1,
        amountPyg: gsNum(p.monto), status: 'CONFIRMED', reference: [p.medioPago, p.cuenta].filter(Boolean).join(' · '),
      }))
      if (esDemo) payments = payments.map((p) => {
        const account = cuentas.find((a) => a.id === p.accountId)
        return { ...p, id: crypto.randomUUID(), ...(account ? { currency: account.currency, accountSnapshot: { ...account }, medioPago: account.name, cuenta: account.name } : {}) }
      })
      const cantidades = new Map()
      for (const item of lista) cantidades.set(item.productoId, (cantidades.get(item.productoId) || 0) + 1)
      for (const [id, cantidad] of cantidades) {
        const producto = productos.find(p => p.id === id)
        if (!producto || num(producto.stock) < cantidad) throw new Error(`Stock insuficiente: ${producto?.nombre || 'producto'}.`)
      }
      lineas = allocateCheckout(lista, gsNum(descuento), gsNum(f.montoDelivery), usaCuentas
        ? pagos.map((p, i) => ({ ...p, ...payments[i], monto: payments[i].amountPyg }))
        : pagos.map((p, i) => ({ ...p, ...payments[i], monto: gsNum(p.monto) })))
    } catch (error) {
      setErrorVenta(error.message)
      return
    }

    // Fecha real de hoy, salvo que se haya elegido una a mano (para no guardar
    // con una fecha vieja si la app quedó abierta desde ayer).
    const fechaVenta = f.fechaManual ? f.fecha : fechaClave()

    // Si hay más de un producto, los marcamos como una misma compra para que el
    // historial los muestre agrupados.
    const compraId = lista.length > 1 ? `compra-${Date.now().toString(36)}` : undefined

    // Una venta por producto, compartiendo cliente/vendedor/pago. El costo de
    // envío se cobra una sola vez (va en el primer producto).
    setGuardando(true)
    guardadoEnCurso.current = true
    let ventaPersistida = false
    try {
    if (!esDemo) {
      const order = await guardarOrdenApi({
        ...(customer.id ? { customerId: customer.id } : { customer: { name: f.cliente.trim(), ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}), ...(customer.countryCode ? { countryCode: customer.countryCode } : {}), ...(customer.email?.trim() ? { email: customer.email.trim() } : {}), ...(customer.document?.trim() ? { document: customer.document.trim() } : {}), ...(customer.addresses?.length ? { addresses: customer.addresses.filter(address => address.address?.trim()).map((address, index) => ({ label: address.label?.trim() || `Dirección ${index + 1}`, address: address.address.trim(), ...(address.city?.trim() ? { city: address.city.trim() } : {}), ...(address.notes?.trim() ? { notes: address.notes.trim() } : {}), isDefault: address.isDefault === true })) } : {}) } }),
        items: orderItems,
        payments,
        discountPyg: gsNum(descuento), deliveryPyg: gsNum(f.montoDelivery),
        deliveryNotes: f.observacion, deliveryType: f.entrega,
      })
      if (!order?.id || order.error || order.ok === false) throw new Error(order?.error || 'No se recibió confirmación de la orden.')
      ventaPersistida = true
    } else {
      const validation = await validateDemoTradeIns(payments)
      if (validation === false || validation?.error || validation?.ok === false) throw new Error(validation?.error || 'No se pudo validar el canje.')
      const clientesDemo = JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]')
      const clienteDemo = customer.id ? customer : clientesDemo.find(c => c.name.toLowerCase() === customer.name.trim().toLowerCase() && (!customer.phone || c.phone === customer.phone)) || { ...customer, name: customer.name.trim(), id: crypto.randomUUID() }
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
        couponCode: lista[i]?.couponCode || null,
        estadoPago: pendiente === 0 ? 'Pagado' : totalPagado > 0 ? 'Parcial' : 'Pendiente',
        fecha: fechaVenta,
        precio: it.precio,
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
      if (!venta?.id || venta.error || venta.ok === false) throw new Error(venta?.error || 'No se recibió confirmación de la venta demo.')
      ventaPersistida = true
      ventas.push(venta)
      }
      if (!clientesDemo.some(c => c.id === clienteDemo.id)) localStorage.setItem('mobos:demo-customers:v1', JSON.stringify([...clientesDemo, clienteDemo]))
      const order = { ...ventas[0], id: ventas[0].id, compraId, cliente: f.cliente.trim(), vendedorId: sesion.vendedorId, seller: { id: sesion.vendedorId, name: sesion.nombre }, fecha: fechaVenta, totalPyg: totalGeneral, payments, ventas }
      const result = await recordDemoTradeIns(order, payments)
      if (result === false || result?.error || result?.ok === false) throw new Error(result?.error || 'No se pudo registrar el canje demo.')
      recordDemoPromotionUsage(orderItems, productos, gsNum(descuento))
    }

    localStorage.setItem(ULTIMO_VENDEDOR, f.vendedorId)
    setCustomer({ name: '', phone: '', countryCode: '+595', email: '', document: '', addresses: [] })
    setItems([])
    setDescuento('')
    setPagos([])
    setF(VACIO(f.vendedorId))
    setFamiliaActiva(null)
    setBusquedaProducto('')
    setPaso(1)
    setOk(true)
    setTimeout(() => setOk(false), 2500)
    onGuardado?.()
    } catch (error) {
      if (ventaPersistida) setGuardadoIncompleto(true)
      setErrorVenta(ventaPersistida
        ? `La venta se guardó, pero quedó un paso incompleto: ${error?.message || 'error al finalizar'}. Revisá el registro antes de volver a vender; se bloqueó el reintento para evitar duplicados.`
        : error?.message || 'No se pudo guardar la venta. Tu carrito sigue disponible.')
    } finally {
      setGuardando(false)
      guardadoEnCurso.current = false
    }
  }

  function agregarPago() {
    if (!cuentas) return
    setPagos((arr) => [...arr, usaCuentas
      ? { ...PAGO_VACIO, accountId: '', originalAmount: '', exchangeRatePyg: '' }
      : { ...PAGO_VACIO, monto: pendiente > 0 ? String(pendiente) : '' }])
  }

  const pasos = ['Cliente y productos', 'Revisar carrito', 'Cobrar']
  const puedePaso2 = Boolean(f.cliente.trim() && items.length > 0 && !f.productoId)
  function siguientePaso() {
    if (paso === 1 && puedePaso2) setPaso(2)
    else if (paso === 2) setPaso(3)
  }

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

      {ok && <p role="status" aria-live="polite" className="mb-4 rounded-xl border border-ok/30 bg-ok/10 p-4 text-ok">Venta registrada correctamente. Ya podés cargar la siguiente.</p>}
      {paso !== 3 && pagos.some(p => p.tradeIn) && <p role="status" className="mb-4 rounded-xl border border-fono/30 bg-fono/10 p-3 text-sm">Canje preparado como parte de pago. Revisá sus datos y el saldo pendiente en Cobrar.</p>}
      <form onSubmit={guardar} className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
        {errorVenta && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-red-300 md:col-span-2">{errorVenta}</p>}
        <nav aria-label="Pasos de la venta" className="grid grid-cols-3 gap-1 rounded-2xl border border-ink-600 bg-ink-900/50 p-1 md:col-span-2">
          {pasos.map((nombre, index) => { const n = index + 1; return <button key={nombre} type="button" onClick={() => n <= paso && setPaso(n)} disabled={n > paso} className={cn('min-h-11 rounded-xl px-2 text-left text-xs font-semibold transition sm:px-3', paso === n ? 'bg-fono text-white shadow-lg shadow-fono/15' : n < paso ? 'text-fono-light hover:bg-fono/10' : 'cursor-not-allowed text-mute/60')}><span className="mr-1.5 text-[10px] opacity-70">0{n}</span>{nombre}</button> })}
        </nav>
        <div className="flex items-center justify-between text-xs text-mute md:col-span-2"><span>Paso {paso} de 3</span>{paso === 3 && <span className="text-fono-light">Revisá los montos antes de confirmar</span>}</div>
        <div className={paso === 1 ? 'contents' : 'hidden'}>
        <div className="md:col-span-2 rounded-xl border border-ink-600 p-3 text-sm"><span className="text-mute">Vendedor de esta venta</span><strong className="ml-3">{sesion?.nombre || 'Ingresá con tu PIN'}</strong><p className="mt-1 text-xs text-mute">Asignado automáticamente a tu sesión.</p></div>
        <CheckoutCustomer esDemo={esDemo} value={customer} onChange={c => { setCustomer(c); setF(current => ({ ...current, cliente: c.name })) }} />

        {/* Producto */}
        <div className="rounded-2xl border border-fono/20 bg-fono/[.04] p-4 md:col-span-2">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><Label>Producto</Label><p className="mt-1 text-xs text-mute">Buscá por nombre, modelo o variante.</p></div>
            <span className="text-xs font-medium text-fono-light">{productos.length} disponibles</span>
          </div>
          {nuevoProd ? (
            <div className="rounded-xl border border-ink-600 p-3 space-y-2.5">
              <Input
                autoFocus
                value={nombreProd}
                onChange={(e) => setNombreProd(e.target.value)}
                placeholder="Nombre base (ej: Protector 17 Air)"
                autoCapitalize="words"
              />
              <div>
                <div className="text-[11px] font-bold uppercase text-mute mb-1">
                  Colores (opcional)
                </div>
                <div className="flex gap-2">
                  <Input
                    value={colorInput}
                    onChange={(e) => setColorInput(e.target.value)}
                    placeholder="Ej: Azul"
                    autoCapitalize="words"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        agregarColor()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={agregarColor}>
                    + Color
                  </Button>
                </div>
                {coloresNuevos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {coloresNuevos.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColoresNuevos((s) => s.filter((x) => x !== c))}
                        className="rounded-full bg-fono/10 text-fono text-xs font-bold px-2.5 py-1 hover:bg-bad/15 hover:text-bad transition"
                        title="Quitar"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-mute mt-1">
                  Sin colores: se crea un solo producto. Con colores: se crea una variante por color
                  y vas a elegir cuál en cada venta.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={crearProducto} className="flex-1">
                  Crear {coloresNuevos.length > 0 ? `(${coloresNuevos.length} colores)` : ''}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelarNuevoProd}>
                  <Icon name="close" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
                <Input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto por texto" className="pl-9" />
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2" aria-label="Resultados de productos">
                {familiasVisibles.map(fam => { const p = fam.items[0]; return <button type="button" key={fam.base} onClick={() => elegirProducto({ target: { value: fam.items.length > 1 ? 'fam:' + fam.base : p.id } })} className="flex min-h-20 items-center gap-3 rounded-xl border border-ink-600 p-3 text-left transition hover:border-fono focus-visible:outline focus-visible:outline-fono">
                  {p.imagen || p.imageUrl ? <img src={p.imagen || p.imageUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-fono/10 text-fono-light"><Icon name="box" className="h-6 w-6" /></span>}
                  <span><strong className="block text-sm">{fam.base}</strong><span className="block text-xs text-mute">{fam.items.length > 1 ? fam.items.length + ' variantes · desde ' : ''}{gs(Math.min(...fam.items.map(item => num(item.precioVenta))))}</span></span>
                </button> })}
                {!familiasVisibles.length && <p className="p-3 text-sm text-mute">No encontramos productos. Probá otro nombre.</p>}
              </div>
              {familiaActiva && (
                <div className="flex items-center gap-2 mt-2">
                  {itemActivo ? (
                    <Badge color="green"> {itemActivo.color || itemActivo.nombre}</Badge>
                  ) : (
                    <Badge color="orange">Elegí un color</Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalColor(true)}
                    className="text-xs font-bold text-fono hover:underline"
                  >
                    Cambiar color
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {f.productoId && <ProductPrice key={f.productoId} esDemo={esDemo} product={productos.find(p => p.id === f.productoId)} price={f.precio} onChange={(precio, coupon = null) => setF(current => ({ ...current, precio, couponCode: typeof coupon === 'string' ? coupon : coupon?.couponCode || null }))} />}
        {f.productoId && !esDemo && <div className="md:col-span-2"><SerialUnitPicker product={productos.find(p => p.id === f.productoId)} customerName={customer.name || f.cliente} selectedSerials={f.serials} onChange={serials => setF(current => ({ ...current, serials }))} onRequiresSerial={setSerialRequired} disabled={guardando} /></div>}
        {f.productoId && Number(productos.find(p => p.id === f.productoId)?.insuranceRate || 0) > 0 && <label className="flex items-center gap-2 text-sm text-mute"><input type="checkbox" checked={f.soldWithoutInsurance} onChange={(e) => setF((s) => ({ ...s, soldWithoutInsurance: e.target.checked }))} className="h-4 w-4 accent-fono" /> Vendido sin seguro — no descontar seguro del margen</label>}
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={agregarItem}
            disabled={!f.productoId || gsNum(f.precio) <= 0 || (serialRequired && !f.serials.length)}
          >
            Agregar a la lista
          </Button>
        </div>

        <div className="flex justify-end md:col-span-2"><Button type="button" disabled={!puedePaso2} onClick={siguientePaso} className="min-h-11 w-full sm:w-auto">Revisar carrito <Icon name="chevron" className="ml-2 h-4 w-4 -rotate-90" /></Button></div>
        </div>

        <div className={paso === 2 ? 'contents' : 'hidden'}>
        {/* Carrito: productos agregados al mismo cliente */}
        {!ocultarCarrito && items.length > 0 && (
          <div className="md:col-span-2 rounded-xl border border-ink-600 divide-y divide-ink-600">
            {items.map((it) => (
              <div key={it.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm font-medium truncate">{it.nombre}{it.serials?.length > 0 && <small className="ml-2 text-fono-light">IMEI ••••{it.serials[0].slice(-4)}</small>}{it.couponCode && <small className="ml-2 text-fono-light">Cupón {it.couponCode}</small>}{it.soldWithoutInsurance && <small className="ml-2 text-warn">Sin seguro</small>}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-fono">{gs(it.precio)}</span>
                  <button
                    type="button"
                    onClick={() => quitarItem(it.key)}
                    className="text-mute hover:text-bad"
                    title="Quitar"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-1.5 bg-ink-700">
              <span className="text-xs font-bold uppercase text-mute">
                Subtotal ({items.length})
              </span>
              <span className="text-sm font-extrabold">{gs(totalCarrito)}</span>
            </div>
          </div>
        )}

        {/* Estado de pago */}
        <div>
          <Label>Descuento extra (Gs)</Label>
          <Input inputMode="numeric" value={gsInput(descuento)} onChange={(e) => setDescuento(e.target.value)} placeholder="0" />
          {tieneCupon && <p className="mt-1 text-xs text-fono-light">Esta venta tiene cupón: el descuento extra debe quedar en cero.</p>}
        </div>

        {/* Fecha */}
        <div>
          <Label>Fecha</Label>
          <Input
            type="date"
            value={f.fecha}
            onChange={(e) => setF((s) => ({ ...s, fecha: e.target.value, fechaManual: true }))}
          />
        </div>

        <div className="flex justify-between gap-2 md:col-span-2"><Button type="button" variant="ghost" onClick={() => setPaso(1)} className="min-h-11">Atrás</Button><Button type="button" onClick={siguientePaso} className="min-h-11">Ir a cobrar <Icon name="chevron" className="ml-2 h-4 w-4 -rotate-90" /></Button></div>
        </div>

        <div className={paso === 3 ? 'contents' : 'hidden'}>
        {/* Medio de pago */}
        {cuentas?.length === 0 && <div>
          <Label>Medio de pago</Label>
          <SelectorMedioPago
            value={f.medioPago}
            onChange={(v) => setF((s) => ({ ...s, medioPago: v }))}
          />
        </div>}

        {/* Pagos parciales y combinados */}
        <div className="space-y-3 rounded-2xl border border-fono/30 bg-gradient-to-br from-fono/[.08] to-transparent p-4 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label>Pagos de esta venta</Label>
              <p className="text-[11px] text-mute">Podés dividir el cobro entre efectivo, cuentas y transferencias.</p>
            </div>
            <Button type="button" variant="outline" onClick={agregarPago} disabled={!cuentas || guardando || guardadoIncompleto}>+ Agregar pago</Button>
          </div>
          {!cuentas && !errorCuentas && <p role="status" className="text-sm text-mute">Cargando cuentas de cobro…</p>}
          {errorCuentas && <div role="alert" className="text-sm text-red-300">{errorCuentas}<Button type="button" variant="ghost" onClick={() => setIntentoCuentas((n) => n + 1)}>Reintentar carga</Button></div>}
          {cuentas?.length === 0 && <p className="text-xs text-mute">No hay cuentas configuradas. Se habilitaron los medios de pago anteriores.</p>}
          {usaCuentas && !cuentas.some((a) => a.isActive && ['USD', 'PYG'].includes(a.currency)) && <p role="alert" className="text-sm text-warn">No hay cuentas activas en USD o PYG para recibir pagos.</p>}
          {pagos.map((p, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_auto] gap-2 items-end">
              {usaCuentas ? <PaymentAccountFields payment={p} accounts={cuentas} onChange={(change) => setPagos((a) => a.map((x, j) => j === i ? updateAccountPayment(x, change, cuentas) : x))} /> : <>
              <div><Label>Medio</Label><SelectorMedioPago value={p.medioPago} onChange={(v) => setPagos((a) => a.map((x, j) => j === i ? { ...x, medioPago: v } : x))} /></div>
              <div><Label>Cuenta</Label><Input value={p.cuenta} onChange={(e) => setPagos((a) => a.map((x, j) => j === i ? { ...x, cuenta: e.target.value } : x))} placeholder="Ej. Ueno principal" /></div>
              <div><Label>Monto (Gs)</Label><Input inputMode="numeric" value={gsInput(p.monto)} onChange={(e) => setPagos((a) => a.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))} /></div>
              </>}
              <Button type="button" variant="ghost" onClick={() => setPagos((a) => a.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 border-t border-fono/20 pt-3 text-sm">
            <span className="text-mute">Total<strong className="mt-1 block text-base text-white">{gs(totalGeneral)}</strong></span>
            <span className="text-mute">Pagado<strong className="mt-1 block text-base text-ok">{gs(totalPagado)}</strong></span>
            <span className="text-mute">Pendiente<strong className={cn('mt-1 block text-base', pendiente ? 'text-warn' : 'text-ok')}>{gs(pendiente)}</strong></span>
          </div>
        </div>

        {/* Entrega + monto envío */}
        <div>
          <Label>Entrega</Label>
          <Select value={f.entrega} onChange={set('entrega')}>
            {ENTREGA.map((x) => (
              <option key={x} value={x}>
                {x === 'Delivery'
                  ? 'Delivery'
                  : x === 'Encomienda'
                    ? 'Envío por encomienda'
                    : 'Retiro en tienda'}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>
            {f.entrega === 'Encomienda' ? 'Costo de la encomienda (₲)' : 'Monto del delivery (₲)'}
          </Label>
          <Input
            inputMode="numeric"
            value={gsInput(f.montoDelivery)}
            onChange={set('montoDelivery')}
            placeholder="0 si retira en tienda"
            disabled={f.entrega === 'Retiro en tienda'}
          />
        </div>

        {/* Observación */}
        <div className="md:col-span-2">
          <Label>Observación</Label>
          <Textarea
            rows={1}
            value={f.observacion}
            onChange={set('observacion')}
            placeholder="Notas, color, envío vía encomienda, etc."
            autoCapitalize="sentences"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setPaso(2)} className="min-h-12">Atrás</Button>
          <Button type="submit" variant="success" disabled={!valido || guardando || !cuentas || Boolean(errorCuentas) || guardadoIncompleto} className="sticky bottom-3 min-h-12 flex-1 text-base shadow-lg shadow-fono/10">
            {guardando ? 'Guardando venta…' : 'Guardar venta'}
            {cantTotal > 1 ? ` · ${cantTotal} productos` : ''}
            {totalGeneral > 0 ? ` · ${gs(totalGeneral)}` : ''}
          </Button>
          {ok && <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-2 text-ok font-bold text-sm whitespace-nowrap"><Icon name="receipt" className="h-4 w-4" /> Recibo confirmado</span>}
        </div>
        </div>
      </form>

      {modalColor && familiaActiva && (
        <SelectorColor
          base={familiaActiva.base}
          items={familiaActiva.items}
          onPick={elegirColor}
          onCancel={() => setModalColor(false)}
        />
      )}
    </Card>
  )
}
